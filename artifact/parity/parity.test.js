// Compara o motor JS (artifact/src/engine.js) com as saidas do motor Python (casos de gen_parity.py).
// Uso: node artifact/parity/parity.test.js [data.json] [cases.json]
const fs = require('fs')
const path = require('path')
const E = require('../src/engine.js')
const dataPath = process.argv[2] || path.join(__dirname, '..', 'data.json')
const casesPath = process.argv[3] || path.join(__dirname, 'cases.json')
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'))
const inv = new Map(data.inverters.map((i) => [i.inverter_id, i]))
const mod = new Map(data.modules.map((m) => [m.module_id, m]))

const IGNORE = new Set(['source']) // chave so do Python (origem do ajuste no servidor)
let diffs = []
function cmp(path, a, e) {
  if (e === null || e === undefined) {
    if (!(a === null || a === undefined)) diffs.push(`${path}: esperado null, veio ${JSON.stringify(a)}`)
    return
  }
  if (typeof e === 'number') {
    if (typeof a !== 'number' || !(Math.abs(a - e) <= 1e-9 * Math.max(1, Math.abs(e)))) diffs.push(`${path}: esperado ${e}, veio ${a}`)
    return
  }
  if (typeof e === 'string' && path.endsWith('overload_override.message')) {
    // o app acrescenta onde desmarcar o ajuste (tela de Configuracoes), que nao existe no artefato
    e = e.split(' Para voltar a usar')[0]
  }
  if (typeof e !== 'object') {
    if (a !== e) diffs.push(`${path}: esperado ${JSON.stringify(e)}, veio ${JSON.stringify(a)}`)
    return
  }
  if (Array.isArray(e)) {
    if (!Array.isArray(a) || a.length !== e.length) return diffs.push(`${path}: tamanho esperado ${e.length}, veio ${a && a.length}`)
    e.forEach((x, i) => cmp(`${path}[${i}]`, a[i], x))
    return
  }
  for (const k of Object.keys(e)) {
    if (IGNORE.has(k)) continue
    cmp(`${path}.${k}`, a == null ? undefined : a[k], e[k])
  }
}

const report = (name, total, before) => {
  const n = diffs.length - before
  console.log(`${n === 0 ? 'OK ' : 'FALHOU'} ${name}: ${total} casos${n ? `, ${n} diferencas` : ''}`)
}

// validate
let before = diffs.length
for (const [n, c] of cases.validate.entries()) {
  let out, err = null
  try { out = E.buildValidationResponse(inv.get(c.inv), mod.get(c.mod), c.t[0], c.t[1], c.cfg, c.adj) } catch (e) { err = e.code || String(e) }
  if (c.error || err) { if (c.error !== err) diffs.push(`validate#${n}: erro esperado ${c.error}, veio ${err}`); continue }
  cmp(`validate#${n}`, out, c.expected)
}
report('buildValidationResponse', cases.validate.length, before)

before = diffs.length
for (const [n, c] of cases.limits.entries()) {
  let out, err = null
  try { out = E.mpptLimitsForKit(inv.get(c.inv), mod.get(c.mod), c.t[0], c.t[1], c.idx, c.total_kwp, c.adj) } catch (e) { err = e.code || String(e) }
  if (c.error || err) { if (c.error !== err) diffs.push(`limits#${n}: erro esperado ${c.error}, veio ${err}`); continue }
  cmp(`limits#${n}`, out, c.expected)
}
report('mpptLimitsForKit', cases.limits.length, before)

before = diffs.length
for (const [n, c] of cases.auto.entries()) {
  let out, err = null
  try { out = E.autoConfigStrings(E.buildAdjustedInverter(inv.get(c.inv), c.adj), mod.get(c.mod), c.t[0], c.t[1]) } catch (e) { err = e.code || String(e) }
  if (c.error || err) { if (c.error !== err) diffs.push(`auto#${n}: erro esperado ${c.error}, veio ${err}`); continue }
  cmp(`auto#${n}`, out, c.expected)
}
report('autoConfigStrings', cases.auto.length, before)

before = diffs.length
let totalSug = 0
for (const [n, c] of cases.suggest.entries()) {
  const p = c.params
  const out = E.suggestKit(data.modules, data.inverters, p.t[0], p.t[1], p, cases.suggest_adjustments.by_inverter, cases.suggest_adjustments.default)
  totalSug += c.expected.length
  cmp(`suggest#${n}(${JSON.stringify(p)})`, out, c.expected)
}
report(`suggestKit (${totalSug} sugestoes)`, cases.suggest.length, before)

before = diffs.length
cmp('area', E.compareModulesArea(cases.area.ids.map((i) => mod.get(i)), cases.area.target_kwp, cases.area.area_util_m2), cases.area.expected)
report('compareModulesArea', cases.area.ids.length, before)

if (diffs.length) {
  console.log('\nPrimeiras diferencas:')
  diffs.slice(0, 15).forEach((d) => console.log(' -', d))
  process.exit(1)
}
console.log('\nPARIDADE TOTAL com o motor Python.')
