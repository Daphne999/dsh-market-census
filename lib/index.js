/**
 * dsh-market-census —— 插件市场普查（离线、只读、确定性）。
 *
 * 输入：一份缓存的 awesome-dsh-plugin `plugins.json` 快照（每日流水线本来就会
 * 下载）。四个工具回答四个问题：市场有多大（census）、谁已经做了（find）、
 * 这个名字/描述是不是重复（dupe）、今天新增了什么（delta）。
 */
import { census, delta, dupe, find, loadCatalog, resolveSnapshotPath } from './catalog.mjs'

export const name = 'dsh-market-census'
export const inject = ['tools']

const pathParam = {
  type: 'string',
  description: 'Path to a cached awesome-dsh-plugin plugins.json. Defaults to DSH_MARKET_FILE or $DSH_HOME/market/plugins.json.',
}

const load = (args) => loadCatalog(resolveSnapshotPath(args?.path))

const renderCats = (categories) => categories.map((c) => `${c.name} ${c.count}`).join(' · ')

export function makeTools() {
  return [
    {
      name: 'market_census',
      description:
        'Offline census of a cached DSH plugin-market snapshot: total, top categories and counts for the keywords you care about. Read-only, no network. | 插件市场普查：总数、类别分布、指定关键词的命中数。只读、不联网。',
      parameters: {
        type: 'object',
        properties: {
          path: pathParam,
          keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords to count, e.g. ["error","diagnose","peak"].' },
          top: { type: 'number', description: 'How many categories to show (1-50, default 15).' },
        },
        required: [],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            report: { type: 'string' },
            total: { type: 'number' },
            updated: { type: 'string' },
            categories: { type: 'string' },
            keywords: { type: 'string' },
          },
          required: ['ok', 'report', 'total', 'updated', 'categories', 'keywords'],
          additionalProperties: false,
        },
        render: (_a, v) => [{ type: 'text', text: v?.report ?? '' }],
      },
      async execute(args) {
        const catalog = load(args)
        const result = census(catalog, { top: args?.top, keywords: args?.keywords })
        const kw = result.keywords.map((k) => `${k.term}=${k.count}`).join(' · ')
        const lines = [
          `快照：${catalog.file}`,
          `总数 ${result.total}${result.updated ? `（updated ${result.updated}）` : ''}`,
          `类别：${renderCats(result.categories)}`,
        ]
        if (kw) lines.push(`关键词：${kw}`)
        return {
          ok: true,
          report: lines.join('\n'),
          total: result.total,
          updated: result.updated,
          categories: JSON.stringify(result.categories),
          keywords: JSON.stringify(result.keywords),
        }
      },
    },
    {
      name: 'market_find',
      description:
        'Search a cached market snapshot for existing implementations of an idea (name + zh/en description). Returns ranked candidates so you can tell "gap" from "duplicate". | 竞品检索：在本地快照里按名称+中英描述查已有实现，返回排序后的候选。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to look for, e.g. "peak" or "会话日志".' },
          path: pathParam,
          limit: { type: 'number', description: 'Max candidates (1-50, default 10).' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' }, report: { type: 'string' }, count: { type: 'number' }, results: { type: 'string' } },
          required: ['ok', 'report', 'count', 'results'],
          additionalProperties: false,
        },
        render: (_a, v) => [{ type: 'text', text: v?.report ?? '' }],
      },
      async execute(args) {
        const catalog = load(args)
        const rows = find(catalog, { query: args?.query, limit: args?.limit })
        const lines = [`「${args?.query}」命中 ${rows.length} 个：`]
        for (const r of rows.slice(0, 10)) {
          lines.push(`- ${r.name}（${r.category}｜★${r.stars}｜${r.added || '?'}）${r.zh.slice(0, 60)}`)
        }
        if (rows.length === 0) lines.push('- （0 命中；换个更短的关键词再试）')
        return { ok: true, report: lines.join('\n'), count: rows.length, results: JSON.stringify(rows) }
      },
    },
    {
      name: 'market_dupe',
      description:
        'Score a proposed plugin name/description against a cached snapshot: exact name taken, near-duplicate crowded, or clear. Pure local bigram similarity. | 查重：给准备用的名字/描述，和本地快照里已有插件做近重复打分（exact 名称占用 / crowded / clear）。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Proposed plugin name, e.g. "dsh-market-census".' },
          description: { type: 'string', description: 'Optional one-line description to sharpen the comparison.' },
          path: pathParam,
          threshold: { type: 'number', description: 'Crowded threshold 0.1-0.99 (default 0.55).' },
          limit: { type: 'number', description: 'Max candidates (1-30, default 8).' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            report: { type: 'string' },
            verdict: { type: 'string' },
            best: { type: 'number' },
            top: { type: 'string' },
          },
          required: ['ok', 'report', 'verdict', 'best', 'top'],
          additionalProperties: false,
        },
        render: (_a, v) => [{ type: 'text', text: v?.report ?? '' }],
      },
      async execute(args) {
        const catalog = load(args)
        const result = dupe(catalog, args)
        const lines = [`结论：${result.verdict}（最高分 ${result.best.toFixed(3)}）`]
        for (const c of result.top.slice(0, 6)) {
          lines.push(`- ${c.exact ? '同名' : c.score.toFixed(3)} ${c.row.name}（${c.row.category}｜★${c.row.stars}）${c.row.zh.slice(0, 50)}`)
        }
        return {
          ok: true,
          report: lines.join('\n'),
          verdict: result.verdict,
          best: result.best,
          top: JSON.stringify(result.top.map((c) => ({ name: c.row.name, category: c.row.category, score: c.score, exact: c.exact }))),
        }
      },
    },
    {
      name: 'market_delta',
      description:
        'New arrivals since a date in a cached snapshot, grouped by category. Answers "what changed" without re-reading the whole market. | 增量：某日期之后新增的插件数量与类别分布。',
      parameters: {
        type: 'object',
        properties: {
          since: { type: 'string', description: 'YYYY-MM-DD, inclusive.' },
          path: pathParam,
          top: { type: 'number', description: 'Max categories (1-50, default 12).' },
        },
        required: ['since'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            report: { type: 'string' },
            count: { type: 'number' },
            categories: { type: 'string' },
            sample: { type: 'string' },
          },
          required: ['ok', 'report', 'count', 'categories', 'sample'],
          additionalProperties: false,
        },
        render: (_a, v) => [{ type: 'text', text: v?.report ?? '' }],
      },
      async execute(args) {
        const catalog = load(args)
        const result = delta(catalog, { since: args?.since, top: args?.top })
        const lines = [
          `${result.since} 之后新增 ${result.count} 个`,
          `类别：${renderCats(result.categories)}`,
          `样本：${result.sample.join(' / ') || '（无）'}`,
        ]
        return {
          ok: true,
          report: lines.join('\n'),
          count: result.count,
          categories: JSON.stringify(result.categories),
          sample: JSON.stringify(result.sample),
        }
      },
    },
  ]
}

export async function apply(ctx) {
  const tools = ctx.get('tools')
  if (!tools?.register) {
    throw new Error('[dsh-market-census] tools 服务不可用：请在 inject 里声明 tools')
  }
  for (const tool of makeTools()) tools.register(tool)
}
