#!/usr/bin/env node
/*
 * Regenera as fixtures golden de backend/tests/golden/fixtures/manual/ a partir do
 * HTML canonico da Fotus (calculadora-dimensionamento.html), executando as FUNCOES DO
 * PROPRIO HTML (calcModuleCorrections, calcMpptLimits) em um sandbox node:vm.
 *
 * O HTML NAO esta neste repositorio (fica no projeto fotus-dimens). Uso:
 *
 *   node regenerar_fixtures.js <caminho/do/calculadora-dimensionamento.html> --controle
 *   node regenerar_fixtures.js <caminho/do/calculadora-dimensionamento.html> --coef-v
 *
 * --controle  : usa o HTML SEM alteracao e apenas COMPARA com as fixtures atuais (nao grava).
 *               Serve para provar que este script reproduz o oraculo bit a bit.
 * --coef-v    : aplica a decisao Fotus de 2026-11-24 (ver app/domain/calculo_solar/corrections.py):
 *               em memoria, troca UM termo no HTML (`mod.coef_pmp` -> `mod.coef_v` na linha de
 *               vmpMin) e REGRAVA as fixtures. O arquivo HTML em disco nunca e alterado.
 *
 * Cobertura: corrections (25), mppt-limits (7), validate-kit (3) e auto-config (2).
 * validate-kit e auto-config compoem as funcoes do HTML (a composicao replica
 * `renderResult`/`updateKitTotals` e `autoConfigStrings`, como o gerador original do fotus-dimens).
 */
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const crypto = require('crypto')

const htmlPath = process.argv[2]
const mode = process.argv[3]
if (!htmlPath || !['--controle', '--coef-v'].includes(mode)) {
  console.error('uso: node regenerar_fixtures.js <html> --controle|--coef-v')
  process.exit(2)
}
const FIX = path.join(__dirname, '..', 'fixtures', 'manual')

let html = fs.readFileSync(htmlPath, 'utf8')
if (mode === '--coef-v') {
  const needle = 'const vmpMin = mod.vmp * (1 + (tMax - 25) * mod.coef_pmp / 100);'
  const count = html.split(needle).length - 1
  if (count !== 1) throw new Error(`esperava exatamente 1 ocorrencia da linha de vmpMin no HTML, achei ${count}`)
  html = html.replace(needle, needle.replace('mod.coef_pmp', 'mod.coef_v'))
}
const htmlSha = crypto.createHash('sha256').update(html).digest('hex')

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`funcao ${name} nao encontrada`)
  let i = src.indexOf('{', start), depth = 0, j = i
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}' && --depth === 0) break
  }
  return src.slice(start, j + 1)
}
const sandbox = vm.createContext({})
vm.runInContext(extractFunction(html, 'calcModuleCorrections') + '\n' + extractFunction(html, 'calcMpptLimits'), sandbox)
const { calcModuleCorrections, calcMpptLimits } = sandbox

function validateKit(inv, mod, tMin, tMax, cfg, old) {
  const perMppt = []
  let allMpptOk = true
  for (let i = 0; i < inv.num_mppt; i++) {
    const lim = calcMpptLimits(inv, mod, tMin, tMax, i)
    if (!lim) { allMpptOk = false; continue }
    const c = cfg[i]
    if (!c) { allMpptOk = false; continue }
    const seriesOk = lim.minSeries <= c.series && c.series <= lim.maxSeries
    const stringsOk = c.strings <= lim.maxStrings
    const ok = seriesOk && stringsOk
    if (!ok) allMpptOk = false
    perMppt.push({
      mpptIdx: i, series: c.series, strings: c.strings, limits: lim, seriesOk, stringsOk,
      badge: ok ? 'OK' : 'Verificar',
      vocArranjo: c.series * lim.vocMax, vmpArranjo: c.series * lim.vmpMin, impArranjo: c.strings * lim.impMax,
    })
  }
  // totais e overload nao dependem da tensao minima: vem das fixtures atuais
  const overloadFail = old.overloadFail
  const allOk = allMpptOk && !overloadFail
  return {
    perMppt, totalMods: old.totalMods, totalKwp: old.totalKwp, ratioCcCa: old.ratioCcCa, overloadKw: old.overloadKw,
    overloadFail, allMpptOk, overallBadge: allOk ? 'Aprovado' : (overloadFail ? 'Reprovado' : 'Verificar'),
    wiringNote: old.wiringNote,
  }
}

function autoConfig(inv, mod, tMin, tMax) {
  const cfg = []
  for (let i = 0; i < inv.num_mppt; i++) {
    const lim = calcMpptLimits(inv, mod, tMin, tMax, i)
    if (!lim) continue
    cfg.push({ series: Math.min(lim.maxSeries, Math.max(lim.minSeries, Math.round((lim.minSeries + lim.maxSeries) / 2))), strings: 1 })
  }
  return cfg
}

const regenerators = {
  corrections: (fx) => calcModuleCorrections(fx.inputs.mod, fx.inputs.tMin, fx.inputs.tMax),
  'mppt-limits': (fx) => {
    if (fx.outputs.error) return fx.outputs // caso de erro: o dominio lanca excecao quando o HTML devolve null
    const r = calcMpptLimits(fx.inputs.inv, fx.inputs.mod, fx.inputs.tMin, fx.inputs.tMax, fx.inputs.mpptIdx)
    if (r === null) throw new Error(`${fx.header.scenario_id}: HTML devolveu null`)
    return r
  },
  'validate-kit': (fx) => validateKit(fx.inputs.inv, fx.inputs.mod, fx.inputs.tMin, fx.inputs.tMax, fx.inputs.cfg, fx.outputs),
  'auto-config': (fx) => ({ mpptConfig: autoConfig(fx.inputs.inv, fx.inputs.mod, fx.inputs.tMin, fx.inputs.tMax) }),
}

let total = 0, iguais = 0, alterados = 0
const resumo = []
for (const [sub, fn] of Object.entries(regenerators)) {
  for (const file of fs.readdirSync(path.join(FIX, sub)).filter((f) => f.endsWith('.json')).sort()) {
    const full = path.join(FIX, sub, file)
    const fx = JSON.parse(fs.readFileSync(full, 'utf8'))
    const novo = fn(fx)
    const antes = JSON.stringify(fx.outputs), depois = JSON.stringify(novo)
    total++
    if (antes === depois) { iguais++; continue }
    alterados++
    resumo.push(`${sub}/${file}`)
    if (mode === '--coef-v') {
      fx.outputs = novo
      fx.header.html_sha256 = htmlSha
      fx.header.oraculo = 'HTML canonico com UM termo alterado: vmpMin usa coef_v (decisao Fotus 2026-11-24). Regenerado por tests/golden/tools/regenerar_fixtures.js --coef-v'
      fs.writeFileSync(full, JSON.stringify(fx, null, 2) + '\n', 'utf8')
    }
  }
}
console.log(`modo ${mode}: ${total} fixtures | ${iguais} iguais ao oraculo | ${alterados} diferentes${mode === '--coef-v' ? ' (regravadas)' : ''}`)
if (mode === '--controle') {
  console.log(alterados === 0 ? 'CONTROLE OK: o script reproduz as fixtures atuais bit a bit.' : 'CONTROLE FALHOU em: ' + resumo.join(', '))
  process.exit(alterados === 0 ? 0 : 1)
}
