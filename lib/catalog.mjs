/**
 * dsh-market-census — offline census of the DSH plugin market.
 *
 * Input: a cached `plugins.json` snapshot from awesome-dsh-plugin (the same
 * file the daily pipeline already downloads). Everything below is pure
 * computation: no network, no model, no writes.
 *
 * The four questions the tools answer:
 *   - census: how big is the market, which categories/keywords dominate?
 *   - find:   who already does X? (ranked competitor list)
 *   - dupe:   is this name/description already taken or crowded?
 *   - delta:  what was added since <date>, and in which categories?
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Resolve the snapshot path: explicit arg -> env -> $DSH_HOME/market/plugins.json. */
export function resolveSnapshotPath(explicit) {
  if (typeof explicit === 'string' && explicit.trim().length > 0) return explicit.trim()
  if (typeof process.env.DSH_MARKET_FILE === 'string' && process.env.DSH_MARKET_FILE.trim().length > 0) {
    return process.env.DSH_MARKET_FILE.trim()
  }
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'market', 'plugins.json')
}

/** Load and validate a plugins.json snapshot. Throws with an actionable message. */
export function loadCatalog(filePath) {
  let text
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    const code = error && error.code ? error.code : 'unknown'
    throw new Error(
      `cannot read market snapshot at ${filePath} (${code}). Pass {"path": "..."} or set DSH_MARKET_FILE to a cached plugins.json.`,
    )
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`market snapshot at ${filePath} is not valid JSON`)
  }
  const plugins = Array.isArray(parsed) ? parsed : Array.isArray(parsed.plugins) ? parsed.plugins : null
  if (plugins === null) throw new Error(`market snapshot at ${filePath} has no plugins array`)
  const rows = plugins
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      name: String(p.name || ''),
      category: String(p.category || 'unknown'),
      zh: String((p.description && p.description.zh) || ''),
      en: String((p.description && p.description.en) || ''),
      stars: Number.isFinite(p.stars) ? p.stars : 0,
      added: typeof p.added === 'string' ? p.added : '',
      url: String(p.url || ''),
    }))
    .filter((p) => p.name.length > 0)
  return {
    file: filePath,
    updated: typeof parsed.updated === 'string' ? parsed.updated : '',
    total: Number.isFinite(parsed.count) ? parsed.count : rows.length,
    rows,
  }
}

const textOf = (row) => `${row.name} ${row.zh} ${row.en}`.toLowerCase()

/** Character bigrams after lowercasing and stripping punctuation/space. */
export function bigrams(text) {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
  const out = new Set()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  if (s.length === 1) out.add(s)
  return out
}

/** Jaccard similarity of two strings. */
export function similarity(a, b) {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let hit = 0
  for (const g of A) if (B.has(g)) hit++
  return hit / (A.size + B.size - hit)
}

/** Category + optional keyword counts. */
export function census(catalog, options = {}) {
  const top = clampInt(options.top, 15, 1, 50)
  const keywords = Array.isArray(options.keywords) ? options.keywords.filter((k) => typeof k === 'string' && k.trim()) : []
  const byCategory = new Map()
  for (const row of catalog.rows) byCategory.set(row.category, (byCategory.get(row.category) || 0) + 1)
  const categories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([name, count]) => ({ name, count }))
  const keywordRows = keywords.map((term) => {
    const needle = term.toLowerCase()
    const count = catalog.rows.filter((row) => textOf(row).includes(needle)).length
    return { term, count }
  })
  return { total: catalog.total, updated: catalog.updated, categories, keywords: keywordRows }
}

/** Ranked competitor search: exact name > name contains > description contains. */
export function find(catalog, options = {}) {
  const query = String(options.query || '').trim()
  if (query.length === 0) throw new Error('query must be a non-empty string')
  const limit = clampInt(options.limit, 10, 1, 50)
  const q = query.toLowerCase()
  const terms = q.split(/\s+/).filter(Boolean)
  const scored = []
  for (const row of catalog.rows) {
    const name = row.name.toLowerCase()
    const text = textOf(row)
    if (!terms.every((t) => text.includes(t))) continue
    let score = 0
    if (name === q) score = 100
    else if (name.includes(q)) score = 60
    else if (terms.every((t) => name.includes(t))) score = 40
    else score = 20
    scored.push({ row, score })
  }
  scored.sort((a, b) => b.score - a.score || b.row.stars - a.row.stars || a.row.name.localeCompare(b.row.name))
  return scored.slice(0, limit).map(({ row, score }) => ({ ...row, score }))
}

/** Near-duplicate scoring for a proposed plugin name/description. */
export function dupe(catalog, options = {}) {
  const name = String(options.name || '').trim()
  if (name.length === 0) throw new Error('name must be a non-empty string')
  const description = String(options.description || '')
  const threshold = clampNumber(options.threshold, 0.55, 0.1, 0.99)
  const limit = clampInt(options.limit, 8, 1, 30)
  const proposal = `${name} ${description}`
  const scored = catalog.rows.map((row) => {
    const nameSim = similarity(name, row.name)
    const textSim = similarity(proposal, `${row.name} ${row.zh} ${row.en}`)
    return { row, score: Number((0.65 * nameSim + 0.35 * textSim).toFixed(4)), exact: row.name.toLowerCase() === name.toLowerCase() }
  })
  scored.sort((a, b) => b.score - a.score || b.row.stars - a.row.stars)
  const top = scored.slice(0, limit)
  const best = top[0]
  let verdict = 'clear'
  if (best && best.exact) verdict = 'taken'
  else if (best && best.score >= threshold) verdict = 'crowded'
  return { verdict, best: best ? best.score : 0, top }
}

/** New arrivals since a date (YYYY-MM-DD, inclusive), grouped by category. */
export function delta(catalog, options = {}) {
  const since = String(options.since || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('since must be YYYY-MM-DD')
  const top = clampInt(options.top, 12, 1, 50)
  const rows = catalog.rows.filter((row) => row.added && row.added >= since)
  const byCategory = new Map()
  for (const row of rows) byCategory.set(row.category, (byCategory.get(row.category) || 0) + 1)
  const categories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([name, count]) => ({ name, count }))
  return { since, count: rows.length, categories, sample: rows.slice(0, 10).map((r) => r.name) }
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
