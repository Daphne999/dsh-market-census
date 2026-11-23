/**
 * Scenario smoke against the real snapshot the daily pipeline already downloads.
 * Run: node scripts/smoke.mjs [path-to-plugins.json]
 */
import assert from 'node:assert/strict'
import { census, delta, dupe, find, loadCatalog } from '../lib/catalog.mjs'

const file = process.argv[2] || 'D:/ds工作区/_daily/market-2026-11-23.json'
const catalog = loadCatalog(file)

const c = census(catalog, { keywords: ['peak', 'error', '会话日志'], top: 5 })
assert.ok(c.total > 12000, `expected a full snapshot, got ${c.total}`)
assert.ok(c.categories.length === 5)
assert.ok(c.categories[0].count > c.categories[4].count)
console.log(`census: total ${c.total}, top ${c.categories[0].name} ${c.categories[0].count}`)
console.log(`keywords: ${c.keywords.map((k) => `${k.term}=${k.count}`).join(' ')}`)

const rows = find(catalog, { query: 'offpeak', limit: 5 })
assert.ok(rows.length >= 2, `expected offpeak implementations, got ${rows.length}`)
console.log(`find: ${rows.length} offpeak candidates, first ${rows[0].name}`)

const taken = dupe(catalog, { name: rows[0].name })
assert.equal(taken.verdict, 'taken')
const clear = dupe(catalog, { name: 'dsh-quantum-linter-9000' })
assert.equal(clear.verdict, 'clear')
console.log(`dupe: taken=${taken.verdict}, clear=${clear.verdict}`)

const d = delta(catalog, { since: '2026-11-22' })
assert.ok(d.count > 0, 'expected arrivals since 2026-11-22')
console.log(`delta: ${d.count} new since ${d.since}`)

console.log('smoke: PASS')
