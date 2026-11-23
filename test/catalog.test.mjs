/**
 * node:test suite for dsh-market-census.
 * Runs under `node --test --test-isolation=none test/*.test.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { bigrams, census, delta, dupe, find, loadCatalog, similarity } from '../lib/catalog.mjs'
import { apply, makeTools } from '../lib/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(here, 'fixtures', 'plugins.json')

test('loadCatalog reads the fixture and normalizes rows', () => {
  const catalog = loadCatalog(fixture)
  assert.equal(catalog.total, 8)
  assert.equal(catalog.updated, '2026-11-22')
  assert.equal(catalog.rows.length, 8)
  assert.equal(catalog.rows[0].name, 'dsh-offpeak-guard')
})

test('bigrams/similarity are deterministic and symmetric', () => {
  assert.equal(similarity('dsh-offpeak-guard', 'dsh-offpeak-guard'), 1)
  assert.ok(similarity('dsh-offpeak-guard', 'dsh-offpeak-send') >= 0.45)
  assert.ok(similarity('dsh-offpeak-guard', 'dsh-weather') < 0.2)
  assert.equal(similarity('abc', 'abd'), similarity('abd', 'abc'))
  assert.ok(bigrams('中文测试').size > 0)
})

test('census counts categories and keywords', () => {
  const catalog = loadCatalog(fixture)
  const r = census(catalog, { keywords: ['peak', '急救', 'plugin'], top: 3 })
  assert.equal(r.total, 8)
  assert.equal(r.categories[0].name, 'usage')
  assert.equal(r.categories[0].count, 3)
  assert.equal(r.categories.length, 3)
  const byTerm = Object.fromEntries(r.keywords.map((k) => [k.term, k.count]))
  assert.equal(byTerm.peak, 3)
  assert.equal(byTerm['急救'], 2)
  assert.equal(byTerm.plugin, 1)
})

test('find ranks exact name first and filters by query', () => {
  const catalog = loadCatalog(fixture)
  const rows = find(catalog, { query: 'offpeak', limit: 5 })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, 'dsh-offpeak-guard')
  assert.equal(rows[0].score, 60)
  assert.throws(() => find(catalog, { query: '  ' }), /non-empty/)
  assert.equal(find(catalog, { query: 'nothing-here' }).length, 0)
})

test('dupe distinguishes taken, crowded and clear', () => {
  const catalog = loadCatalog(fixture)
  assert.equal(dupe(catalog, { name: 'dsh-offpeak-guard' }).verdict, 'taken')
  assert.equal(dupe(catalog, { name: 'dsh-weather' }).verdict, 'clear')
  const near = dupe(catalog, { name: 'dsh-offpeak-send-plus', description: 'queue messages during peak hours' })
  assert.notEqual(near.verdict, 'clear')
  assert.ok(near.best > 0.5)
})

test('delta filters by added date', () => {
  const catalog = loadCatalog(fixture)
  const r = delta(catalog, { since: '2026-11-20' })
  assert.equal(r.count, 3)
  assert.ok(r.categories.some((c) => c.name === 'tools'))
  assert.throws(() => delta(catalog, { since: '2026/11/20' }), /YYYY-MM-DD/)
})

test('tools expose four names and apply() registers them', async () => {
  const tools = makeTools()
  assert.deepEqual(tools.map((t) => t.name), ['market_census', 'market_find', 'market_dupe', 'market_delta'])
  const registered = []
  await apply({ get: (k) => (k === 'tools' ? { register: (t) => registered.push(t.name) } : undefined) })
  assert.deepEqual(registered, ['market_census', 'market_find', 'market_dupe', 'market_delta'])
})

test('census tool output has no nulls', async () => {
  const [tool] = makeTools()
  const out = await tool.execute({ path: fixture, keywords: ['peak'] })
  for (const key of ['ok', 'report', 'total', 'updated', 'categories', 'keywords']) {
    assert.ok(key in out, `missing ${key}`)
    assert.notEqual(out[key], null, `${key} must not be null`)
  }
  assert.match(out.report, /总数 8/)
})
