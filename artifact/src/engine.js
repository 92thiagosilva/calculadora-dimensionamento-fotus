/* Motor de calculo da Calculadora de Dimensionamento Fotus — porte para JavaScript
 * do motor Python (backend/app/domain/calculo_solar). Mantem a mesma ordem de
 * operacoes e os mesmos arredondamentos de cada trecho (ex.: round do Python
 * em `suggestion`, Math.round do JS em `auto_config`), porque a paridade
 * numerica com a calculadora canonica da Fotus e' requisito de negocio. */
(function (root) {
  'use strict'

  class ToolError extends Error {
    constructor(code, message) {
      super(message)
      this.code = code
    }
  }

  // ---------- arredondamentos ----------
  const jsRound = (x) => Math.floor(x + 0.5) // Math.round do JS (.5 sobe)
  const jsToFixed0 = (x) => (x >= 0 ? Math.floor(x + 0.5) : Math.ceil(x - 0.5))
  /** round() do Python: empate vai para o par (round(2.5) = 2). */
  function pyRound(x, nd = 0) {
    const f = 10 ** nd
    const m = x * f
    const fl = Math.floor(m)
    const diff = m - fl
    if (diff === 0.5) return (fl % 2 === 0 ? fl : fl + 1) / f
    return Math.round(m) / f
  }
  /** f"{x:.{nd}f}" do Python: empate EXATO vai para o digito par (65.625 -> "65.62"); toFixed do JS sobe. */
  function pyFixed(x, nd) {
    const s = x.toFixed(Math.min(100, nd + 40)) // expansao decimal exata do double
    const dot = s.indexOf('.')
    const rest = s.slice(dot + 1 + nd)
    if (/^50*$/.test(rest)) {
      const kept = s.slice(0, dot + 1 + nd).replace(/\.$/, '')
      const lastDigit = Number(kept[kept.length - 1])
      if (lastDigit % 2 === 0) return kept
    }
    return x.toFixed(nd)
  }
  const fmt1 = (n) => pyFixed(n, 1)

  // ---------- correcao termica ----------
  function applyModuleCorrections(mod, tMin, tMax) {
    return {
      voc_max: mod.voc * (1 + ((tMin - 25) * mod.coef_v) / 100),
      vmp_min: mod.vmp * (1 + ((tMax - 25) * mod.coef_pmp) / 100),
      imp_max: mod.imp * (1 + ((tMax - 25) * mod.coef_i) / 100),
      isc_max: mod.isc * (1 + ((tMax - 25) * mod.coef_i) / 100),
    }
  }

  // ---------- limites do MPPT ----------
  function calculateMpptLimits(inv, mod, tMin, tMax, mpptIdx) {
    const corr = applyModuleCorrections(mod, tMin, tMax)
    const { voc_max, vmp_min, imp_max, isc_max } = corr
    if (mpptIdx < 0 || mpptIdx >= inv.mppt_currents.length) {
      throw new ToolError('MPPT_INDEX_OUT_OF_RANGE', `MPPT_INDEX_OUT_OF_RANGE: mpptIdx=${mpptIdx} fora do range (num_mppt=${inv.num_mppt})`)
    }
    const curr = inv.mppt_currents[mpptIdx]
    if (inv.v_max == null) {
      throw new ToolError('CALCULATION_NUMERIC_ERROR', 'CALCULATION_NUMERIC_ERROR: inversor sem v_max definido')
    }
    const linMaxRaw = mpptIdx < inv.lin_max.length ? inv.lin_max[mpptIdx] : 0
    const linMax = linMaxRaw || 99

    const maxSeriesVoc = Math.floor(inv.v_max / voc_max)
    const maxSeriesVmpp = inv.v_mpp_max ? Math.floor(inv.v_mpp_max / mod.vmp) : maxSeriesVoc
    const minSeries = inv.v_mpp_min ? Math.ceil(inv.v_mpp_min / vmp_min) : 1
    const maxSeries = Math.min(maxSeriesVoc, maxSeriesVmpp)

    const maxStringsByImax = curr.imax > 0 ? Math.floor(curr.imax / imp_max) : 99
    const maxStringsByIsc = curr.isc > 0 ? Math.floor(curr.isc / isc_max) : 99
    const maxStrings = Math.min(maxStringsByImax, maxStringsByIsc, linMax)

    let limitingFactor
    if (maxStrings === linMax && maxStrings <= maxStringsByImax && maxStrings <= maxStringsByIsc) limitingFactor = 'linMax'
    else if (maxStringsByImax <= maxStringsByIsc) limitingFactor = 'imax'
    else limitingFactor = 'isc'

    return {
      max_series_voc: maxSeriesVoc,
      max_series_vmpp: maxSeriesVmpp,
      min_series: minSeries,
      max_series: maxSeries,
      max_strings: maxStrings,
      max_strings_by_imax: maxStringsByImax,
      max_strings_by_isc: maxStringsByIsc,
      lin_max: linMax,
      voc_max,
      vmp_min,
      imp_max,
      isc_max,
      imax_mppt: curr.imax,
      isc_mppt: curr.isc,
      limiting_factor: limitingFactor,
    }
  }

  // ---------- validacao do kit (canonico) ----------
  function validateKit(inv, mod, tMin, tMax, cfg) {
    if (inv.p_max_cc == null) {
      throw new ToolError('CALCULATION_NUMERIC_ERROR', 'CALCULATION_NUMERIC_ERROR: inversor sem p_max_cc definido')
    }
    let totalMods = 0
    for (const c of cfg) if (c) totalMods += (c.series || 0) * (c.strings || 0)

    const totalKwp = (totalMods * mod.pnom) / 1000
    const overloadKw = inv.p_max_cc / 1000
    const overloadFail = totalKwp > overloadKw
    const ratioCcCa = totalMods > 0 ? jsToFixed0(((totalMods * mod.pnom) / inv.p_nom) * 100) : 0

    const perMppt = []
    let allMpptOk = true
    for (let i = 0; i < inv.num_mppt; i++) {
      let lim
      try {
        lim = calculateMpptLimits(inv, mod, tMin, tMax, i)
      } catch (err) {
        if (err instanceof ToolError && err.code === 'MPPT_INDEX_OUT_OF_RANGE') {
          allMpptOk = false
          continue
        }
        throw err
      }
      const c = i < cfg.length ? cfg[i] : null
      if (!c) {
        allMpptOk = false
        continue
      }
      const seriesOk = lim.min_series <= c.series && c.series <= lim.max_series
      const stringsOk = c.strings <= lim.max_strings
      const ok = seriesOk && stringsOk
      if (!ok) allMpptOk = false
      perMppt.push({
        mppt_idx: i,
        series: c.series,
        strings: c.strings,
        limits: lim,
        series_ok: seriesOk,
        strings_ok: stringsOk,
        badge: ok ? 'OK' : 'Verificar',
        voc_arranjo: c.series * lim.voc_max,
        vmp_arranjo: c.series * lim.vmp_min,
        imp_arranjo: c.strings * lim.imp_max,
      })
    }

    const allOk = allMpptOk && !overloadFail
    const overallBadge = allOk ? 'Aprovado' : overloadFail ? 'Reprovado' : 'Verificar'
    const wiringNote = overloadFail
      ? `Overload excedido: ${pyFixed(totalKwp, 2)} kWp > ${pyFixed(overloadKw, 1)} kWp (limite CC do inversor). Reduza modulos ou troque o inversor.`
      : null

    return {
      per_mppt: perMppt,
      total_mods: totalMods,
      total_kwp: totalKwp,
      ratio_cc_ca: ratioCcCa,
      overload_kw: overloadKw,
      overload_fail: overloadFail,
      all_mppt_ok: allMpptOk,
      overall_badge: overallBadge,
      wiring_note: wiringNote,
    }
  }

  function recomputeBadgeFromPerMppt(v) {
    const per = v.per_mppt
    if (!per.length) return v
    const allMpptOk = per.every((p) => p.badge === 'OK')
    let overall
    if (v.overload_fail) overall = 'Reprovado'
    else if (allMpptOk) overall = 'Aprovado'
    else overall = 'Verificar'
    return { ...v, all_mppt_ok: allMpptOk, overall_badge: overall }
  }

  function autoConfigStrings(inv, mod, tMin, tMax) {
    const out = []
    for (let i = 0; i < inv.num_mppt; i++) {
      let lim
      try {
        lim = calculateMpptLimits(inv, mod, tMin, tMax, i)
      } catch (err) {
        if (err instanceof ToolError && err.code === 'MPPT_INDEX_OUT_OF_RANGE') continue
        throw err
      }
      const opt = Math.min(lim.max_series, Math.max(lim.min_series, jsRound((lim.min_series + lim.max_series) / 2)))
      out.push({ series: opt, strings: 1 })
    }
    return out
  }

  // ---------- regras condicionais ----------
  const METRICS = {
    overload_pct: {
      label: 'Sobrecarga do kit (CC dos módulos ÷ CA do inversor − 1)',
      unit: '%',
      compute: (c) => (c.p_nom_w > 0 ? (c.total_dc_w / c.p_nom_w - 1) * 100 : 0),
    },
    total_kwp: { label: 'Potência total dos módulos do kit', unit: 'kWp', compute: (c) => c.total_dc_w / 1000 },
  }
  const OPERATORS = {
    '>': ['maior que', (a, b) => a > b],
    '>=': ['maior ou igual a', (a, b) => a >= b],
    '<': ['menor que', (a, b) => a < b],
    '<=': ['menor ou igual a', (a, b) => a <= b],
  }
  const MODES = { set: 'definir valor', delta: 'somar', percent: 'variar em %' }

  const scalarTarget = (key, label, unit, attr) => ({
    key, label, unit,
    get: (inv) => (inv[attr] == null ? [] : [inv[attr]]),
    set: (inv, vals) => ({ ...inv, [attr]: vals[0] }),
  })
  const currentTarget = (key, label, attr) => ({
    key, label, unit: 'A',
    get: (inv) => inv.mppt_currents.map((c) => c[attr]),
    set: (inv, vals) => ({ ...inv, mppt_currents: inv.mppt_currents.map((c, i) => ({ ...c, [attr]: vals[i] })) }),
  })
  const TARGETS = {
    v_max: scalarTarget('v_max', 'V max', 'V', 'v_max'),
    v_mpp_min: scalarTarget('v_mpp_min', 'V MPP min', 'V', 'v_mpp_min'),
    v_mpp_max: scalarTarget('v_mpp_max', 'V MPP max', 'V', 'v_mpp_max'),
    imax: currentTarget('imax', 'I max por MPPT', 'imax'),
    isc: currentTarget('isc', 'Isc max por MPPT', 'isc'),
    overload_limit_pct: {
      key: 'overload_limit_pct', label: 'Sobrecarga máxima permitida', unit: '%',
      get: (inv) => (inv.p_max_cc == null || inv.p_nom <= 0 ? [] : [(inv.p_max_cc / inv.p_nom - 1) * 100]),
      set: (inv, vals) => ({ ...inv, p_max_cc: inv.p_nom * (1 + vals[0] / 100) }),
    },
  }

  function applyMode(mode, current, value) {
    let n
    if (mode === 'set') n = value
    else if (mode === 'delta') n = current + value
    else n = current * (1 + value / 100)
    return Math.max(0, n)
  }
  const r9 = (x) => Number(x.toFixed(9))

  function kitContext(totalDcW, pNomW) {
    return { total_dc_w: totalDcW, p_nom_w: pNomW }
  }

  function ruleApplies(rule, ctx) {
    if (!rule.enabled) return false
    for (const c of rule.conditions) {
      const measured = r9(METRICS[c.metric].compute(ctx))
      if (!OPERATORS[c.op][1](measured, r9(c.value))) return false
    }
    return true
  }

  const sameArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
  const uniq = (arr) => [...new Set(arr)]

  function applyEffectsDetailed(inv, rule) {
    const changes = []
    for (const e of rule.effects) {
      const t = TARGETS[e.target]
      const before = t.get(inv)
      if (!before.length) continue
      const after = before.map((v) => applyMode(e.mode, v, e.value))
      if (sameArr(after, before)) continue
      inv = t.set(inv, after)
      changes.push({ target: t.key, label: t.label, unit: t.unit, mode: e.mode, before, after })
    }
    return [inv, changes]
  }
  const changeText = (c) =>
    `${c.label}: ${uniq(c.before.map(fmt1)).join('/')} ${c.unit} → ${uniq(c.after.map(fmt1)).join('/')} ${c.unit}`

  function describeApplied(rule, ctx, changes) {
    const parts = rule.conditions.map((c) => {
      const m = METRICS[c.metric]
      return `${m.label} = ${fmt1(m.compute(ctx))} ${m.unit} (${OPERATORS[c.op][0]} ${fmt1(c.value)} ${m.unit})`
    })
    const when = parts.length ? parts.join('; ') : 'regra sempre ativa'
    const effects = changes.length ? changes.map(changeText).join('; ') : 'sem alteração de valores'
    return `Regra condicional "${rule.name}" aplicada — ${when}. Efeito: ${effects}.`
  }

  function applyRules(inv, rules, ctx) {
    const applied = []
    for (const rule of rules) {
      if (!ruleApplies(rule, ctx)) continue
      const [next, changes] = applyEffectsDetailed(inv, rule)
      inv = next
      applied.push({ rule_id: rule.id, name: rule.name, description: describeApplied(rule, ctx, changes) })
    }
    return [inv, applied]
  }

  function ruleVariantInverters(inv, rules) {
    const variants = []
    for (const rule of rules) {
      if (!rule.enabled) continue
      const [variant, changes] = applyEffectsDetailed(inv, rule)
      if (changes.length) variants.push(variant)
    }
    return variants
  }

  function evaluateConditions(rule, ctx) {
    return rule.conditions.map((c) => {
      const m = METRICS[c.metric]
      const measured = m.compute(ctx)
      return {
        metric: c.metric, label: m.label, unit: m.unit, measured, op: c.op, op_label: OPERATORS[c.op][0],
        threshold: c.value, ok: OPERATORS[c.op][1](r9(measured), r9(c.value)),
      }
    })
  }

  // ---------- ajustes estaticos ----------
  const DC_AC_RATIO_MIN_PCT_DEFAULT = 70.0
  const DEFAULT_ADJUSTMENTS = {
    overload_pct_override: null, imax_tolerance_a: 0, isc_tolerance_a: 0, vmax_delta_v: 0,
    vmpp_min_delta_v: 0, vmpp_max_delta_v: 0, dc_ac_ratio_min_pct_override: null, rules: [],
  }

  function isDefaultAdjustments(a) {
    return (
      a.overload_pct_override == null && a.imax_tolerance_a === 0 && a.isc_tolerance_a === 0 &&
      a.vmax_delta_v === 0 && a.vmpp_min_delta_v === 0 && a.vmpp_max_delta_v === 0 &&
      a.dc_ac_ratio_min_pct_override == null && !(a.rules && a.rules.length)
    )
  }

  function buildAdjustedInverter(inv, adj) {
    return {
      ...inv,
      mppt_currents: inv.mppt_currents.map((c) => ({ imax: c.imax + adj.imax_tolerance_a, isc: c.isc + adj.isc_tolerance_a })),
      v_max: inv.v_max != null ? inv.v_max + adj.vmax_delta_v : null,
      v_mpp_min: inv.v_mpp_min != null ? inv.v_mpp_min + adj.vmpp_min_delta_v : null,
      v_mpp_max: inv.v_mpp_max != null ? inv.v_mpp_max + adj.vmpp_max_delta_v : null,
      p_max_cc: adj.overload_pct_override != null ? inv.p_nom * (1 + adj.overload_pct_override / 100) : inv.p_max_cc,
    }
  }

  function totalDcW(cfg, mod) {
    let n = 0
    for (const c of cfg) if (c) n += (c.series || 0) * (c.strings || 0)
    return n * mod.pnom
  }

  function rulesRelaxed(before, after) {
    if (before.overload_fail && !after.overload_fail) return true
    const byIdx = new Map(after.per_mppt.map((p) => [p.mppt_idx, p]))
    for (const b of before.per_mppt) {
      const a = byIdx.get(b.mppt_idx)
      if (a && ((a.series_ok && !b.series_ok) || (a.strings_ok && !b.strings_ok))) return true
    }
    return false
  }

  function validateKitWithRules(inv, mod, tMin, tMax, cfg, adj) {
    const staticInv = buildAdjustedInverter(inv, adj)
    const staticResult = validateKit(staticInv, mod, tMin, tMax, cfg)
    const ctx = kitContext(totalDcW(cfg, mod), inv.p_nom)
    const [ruleInv, appliedRules] = applyRules(staticInv, adj.rules || [], ctx)
    const finalResult = appliedRules.length ? validateKit(ruleInv, mod, tMin, tMax, cfg) : staticResult
    if (isDefaultAdjustments(adj)) return { result: finalResult, reasons: [], applied_rules: [], rules_relaxed: false }

    const adjustedInv = staticInv
    const rawResult = validateKit(inv, mod, tMin, tMax, cfg)
    const reasons = []
    if (!staticResult.overload_fail && rawResult.overload_fail) {
      reasons.push(
        `Sobrecarga ajustada: com a sobrecarga cadastrada o limite seria ${fmt1(rawResult.overload_kw)} kW (o kit excederia); ` +
          `com o ajuste configurado, o limite passa a ser ${fmt1(staticResult.overload_kw)} kW.`,
      )
    }
    const rawByIdx = new Map(rawResult.per_mppt.map((p) => [p.mppt_idx, p]))
    for (const adjP of staticResult.per_mppt) {
      const rawP = rawByIdx.get(adjP.mppt_idx)
      if (!rawP) continue
      if (adjP.series_ok && !rawP.series_ok) {
        const notes = []
        if (adj.vmax_delta_v !== 0 && inv.v_max != null) notes.push(`V max ${fmt1(inv.v_max)} V → ${fmt1(adjustedInv.v_max)} V`)
        if (adj.vmpp_min_delta_v !== 0 && inv.v_mpp_min != null) notes.push(`V MPP min ${fmt1(inv.v_mpp_min)} V → ${fmt1(adjustedInv.v_mpp_min)} V`)
        if (adj.vmpp_max_delta_v !== 0 && inv.v_mpp_max != null) notes.push(`V MPP max ${fmt1(inv.v_mpp_max)} V → ${fmt1(adjustedInv.v_mpp_max)} V`)
        if (notes.length) {
          reasons.push(
            `MPPT ${adjP.mppt_idx + 1}: a série de ${adjP.series} módulos só fica dentro da faixa permitida com o(s) ajuste(s) de tensão configurado(s): ${notes.join(', ')}.`,
          )
        }
      }
      if (adjP.strings_ok && !rawP.strings_ok) {
        const notes = []
        if (adj.imax_tolerance_a !== 0) {
          notes.push(`I max ${fmt1(inv.mppt_currents[adjP.mppt_idx].imax)} A → ${fmt1(adjustedInv.mppt_currents[adjP.mppt_idx].imax)} A`)
        }
        if (adj.isc_tolerance_a !== 0) {
          notes.push(`Isc max ${fmt1(inv.mppt_currents[adjP.mppt_idx].isc)} A → ${fmt1(adjustedInv.mppt_currents[adjP.mppt_idx].isc)} A`)
        }
        if (notes.length) {
          reasons.push(
            `MPPT ${adjP.mppt_idx + 1}: ${adjP.strings} fileira(s) só ficam dentro do limite com a tolerância de corrente configurada: ${notes.join(', ')}.`,
          )
        }
      }
    }
    const relaxed = appliedRules.length > 0 && rulesRelaxed(staticResult, finalResult)
    if (relaxed) for (const a of appliedRules) reasons.push(a.description)
    return { result: finalResult, reasons, applied_rules: appliedRules, rules_relaxed: relaxed }
  }

  function checkMinDcAcRatio(totalKwp, pNomW, minRatio) {
    const pNomKw = pNomW / 1000
    const minKwpRequired = minRatio * pNomKw
    const ratio = pNomKw > 0 ? totalKwp / pNomKw : 0
    return { ratio, min_kwp_required: minKwpRequired, ok: totalKwp >= minKwpRequired }
  }

  function checkDcAcRatioWithAdjustments(totalKwp, pNomW, adj) {
    const effectivePct = adj.dc_ac_ratio_min_pct_override != null ? adj.dc_ac_ratio_min_pct_override : DC_AC_RATIO_MIN_PCT_DEFAULT
    const check = checkMinDcAcRatio(totalKwp, pNomW, effectivePct / 100)
    let reason = null
    if (adj.dc_ac_ratio_min_pct_override != null && effectivePct !== DC_AC_RATIO_MIN_PCT_DEFAULT) {
      const def = checkMinDcAcRatio(totalKwp, pNomW, DC_AC_RATIO_MIN_PCT_DEFAULT / 100)
      if (check.ok && !def.ok) {
        reason =
          `Mínimo de potência CC/CA ajustado: com o padrão de ${fmt1(DC_AC_RATIO_MIN_PCT_DEFAULT)}% seriam exigidos no mínimo ` +
          `${fmt1(def.min_kwp_required)} kWp de módulos (o kit ficaria abaixo); com o ajuste configurado (${fmt1(effectivePct)}%), ` +
          `o mínimo passa a ser ${fmt1(check.min_kwp_required)} kWp.`
      }
    }
    return [check, effectivePct, reason]
  }

  function overloadOverrideNote(inv, adj) {
    const override = adj.overload_pct_override
    if (override == null || inv.p_max_cc == null || inv.p_nom <= 0) return null
    const catalogPct = (inv.p_max_cc / inv.p_nom - 1) * 100
    if (Math.abs(override - catalogPct) < 0.05) return null
    const effectiveKw = (inv.p_nom * (1 + override / 100)) / 1000
    const direction = override < catalogPct ? 'reduz' : 'amplia'
    return {
      override_pct: override, catalog_pct: catalogPct, catalog_limit_kw: inv.p_max_cc / 1000, effective_limit_kw: effectiveKw,
      message:
        `A sobrecarga cadastrada deste inversor (+${fmt1(catalogPct)}%, limite de ${fmt1(inv.p_max_cc / 1000)} kW) está sendo ` +
        `substituída por +${fmt1(override)}% (limite de ${fmt1(effectiveKw)} kW) em Configurações de Cálculo, o que ${direction} o limite de sobrecarga.`,
    }
  }

  /** Pipeline completo de validacao (ajustes + regras + CC/CA), formato da API. */
  function buildValidationResponse(inv, mod, tMin, tMax, cfg, adj) {
    const adjusted = validateKitWithRules(inv, mod, tMin, tMax, cfg, adj)
    const result = recomputeBadgeFromPerMppt(adjusted.result)
    const out = { ...result }
    if (adjusted.reasons.length && out.overall_badge === 'Aprovado') out.overall_badge = 'Aprovado com ressalva'
    out.ressalva_reasons = [...adjusted.reasons]
    out.applied_rules = adjusted.applied_rules
    out.rules_relaxed = adjusted.rules_relaxed
    out.overload_override = overloadOverrideNote(inv, adj)

    const [check, effectivePct, reason] = checkDcAcRatioWithAdjustments(out.total_kwp, inv.p_nom, adj)
    out.formula_badge = out.overall_badge
    out.dc_ac_ratio_ok = check.ok
    out.dc_ac_min_kwp_required = check.min_kwp_required
    if (!check.ok) {
      out.overall_badge = 'Reprovado'
      out.dc_ac_ratio_note =
        `Abaixo de ${pyFixed(effectivePct, 0)}% da potência nominal do inversor: ${pyFixed(out.total_kwp, 2)} kWp de módulos < ` +
        `${pyFixed(check.min_kwp_required, 2)} kWp mínimos exigidos (${pyFixed(effectivePct, 0)}% de ${pyFixed(inv.p_nom / 1000, 1)} kW). ` +
        `Adicione mais módulos ou escolha um inversor menor.`
    } else {
      out.dc_ac_ratio_note = null
      if (reason) {
        out.ressalva_reasons.push(reason)
        if (out.overall_badge === 'Aprovado') out.overall_badge = 'Aprovado com ressalva'
      }
    }
    return out
  }

  /** Limites de um MPPT, avaliando as regras para o kit atual (potencia total em kWp). */
  function mpptLimitsForKit(inv, mod, tMin, tMax, mpptIdx, totalKwp, adj) {
    let adjusted = buildAdjustedInverter(inv, adj)
    let applied = []
    if (totalKwp != null) [adjusted, applied] = applyRules(adjusted, adj.rules || [], kitContext(totalKwp * 1000, inv.p_nom))
    const lim = calculateMpptLimits(adjusted, mod, tMin, tMax, mpptIdx)
    return { ...lim, effective_v_max: adjusted.v_max, applied_rules: applied }
  }

  // ---------- sugestao automatica ----------
  const INVERTER_KW_EXACT_TOLERANCE = 0.01
  const DEFAULT_LIMIT = 100

  function candidateMpptConfigs(inv, mod, tMin, tMax) {
    const limits = []
    for (let i = 0; i < inv.num_mppt; i++) {
      try {
        limits.push(calculateMpptLimits(inv, mod, tMin, tMax, i))
      } catch (err) {
        if (err instanceof ToolError) limits.push(null)
        else throw err
      }
    }
    if (limits.every((l) => l === null)) return []
    const seen = new Set()
    const configs = []
    for (const seriesChoice of ['min', 'mid', 'max']) {
      for (const stringsChoice of ['min', 'max']) {
        let cfg = []
        const keyParts = []
        for (const lim of limits) {
          if (lim === null) {
            cfg.push(null)
            keyParts.push(null)
            continue
          }
          let series
          if (seriesChoice === 'min') series = lim.min_series
          else if (seriesChoice === 'max') series = lim.max_series
          else series = Math.min(lim.max_series, Math.max(lim.min_series, pyRound((lim.min_series + lim.max_series) / 2)))
          const strings = stringsChoice === 'max' ? lim.max_strings : 1
          if (strings < 1 || series < 1) {
            cfg = []
            break
          }
          cfg.push({ series, strings })
          keyParts.push([series, strings])
        }
        if (!cfg.length) continue
        const key = JSON.stringify(keyParts)
        if (seen.has(key)) continue
        seen.add(key)
        configs.push(cfg)
      }
    }
    return configs
  }

  const normBrand = (s) => s.trim().toUpperCase()

  function suggestKit(modules, inverters, tMin, tMax, opts, adjustmentsByInverterId, defaultAdjustments) {
    const o = opts || {}
    const hasDc = o.target_kwp != null
    const hasAc = o.target_inverter_kw != null
    if (!hasDc && !hasAc) throw new ToolError('INVALID_INPUT_RANGE', 'suggest_kit requer target_kwp (paineis DC) OU target_inverter_kw (inversor AC).')
    if (hasDc && hasAc) throw new ToolError('INVALID_INPUT_RANGE', 'suggest_kit aceita target_kwp OU target_inverter_kw, nunca os dois.')
    const limit = o.max_suggestions == null ? DEFAULT_LIMIT : Math.min(500, Math.max(1, Math.trunc(o.max_suggestions)))
    const defAdj = defaultAdjustments || DEFAULT_ADJUSTMENTS
    const byInv = adjustmentsByInverterId || {}
    const modBrand = o.module_brand ? normBrand(o.module_brand) : null
    const invBrand = o.inverter_brand ? normBrand(o.inverter_brand) : null

    const acc = []
    for (const mod of modules) {
      if (modBrand !== null && normBrand(mod.brand) !== modBrand) continue
      for (const inv of inverters) {
        if (inv.categoria === 'Microinversor') continue
        if (invBrand !== null && normBrand(inv.brand) !== invBrand) continue
        if (o.inverter_phase != null && inv.fase !== o.inverter_phase) continue
        if (o.inverter_min_kw != null && inv.p_nom / 1000 < o.inverter_min_kw) continue
        if (o.inverter_max_kw != null && inv.p_nom / 1000 > o.inverter_max_kw) continue
        if (inv.p_max_cc == null || inv.v_max == null) continue
        if (hasAc && Math.abs(inv.p_nom / 1000 - o.target_inverter_kw) > INVERTER_KW_EXACT_TOLERANCE) continue

        const adj = byInv[String(inv.inverter_id)] || defAdj
        const adjustedInv = buildAdjustedInverter(inv, adj)
        const candidates = candidateMpptConfigs(adjustedInv, mod, tMin, tMax)
        if (adj.rules && adj.rules.length) {
          const seenCfgs = new Set(candidates.map((c) => JSON.stringify(c)))
          for (const variant of ruleVariantInverters(adjustedInv, adj.rules)) {
            for (const cv of candidateMpptConfigs(variant, mod, tMin, tMax)) {
              const k = JSON.stringify(cv)
              if (!seenCfgs.has(k)) {
                seenCfgs.add(k)
                candidates.push(cv)
              }
            }
          }
        }
        const seenKwp = new Set()
        for (const cfg of candidates) {
          let adjusted
          try {
            adjusted = validateKitWithRules(inv, mod, tMin, tMax, cfg, adj)
          } catch (err) {
            if (err instanceof ToolError) continue
            throw err
          }
          let validation = recomputeBadgeFromPerMppt(adjusted.result)
          let reasons = adjusted.reasons
          if (reasons.length && validation.overall_badge === 'Aprovado') validation = { ...validation, overall_badge: 'Aprovado com ressalva' }
          if (validation.overall_badge !== 'Aprovado' && validation.overall_badge !== 'Aprovado com ressalva') continue

          const [ratioCheck, , ratioReason] = checkDcAcRatioWithAdjustments(validation.total_kwp, inv.p_nom, adj)
          if (!ratioCheck.ok) continue
          if (ratioReason) {
            reasons = [...reasons, ratioReason]
            if (validation.overall_badge === 'Aprovado') validation = { ...validation, overall_badge: 'Aprovado com ressalva' }
          }
          if (hasDc && !(o.target_kwp * 0.95 <= validation.total_kwp && validation.total_kwp <= o.target_kwp * 1.05)) continue

          const kwpKey = pyRound(validation.total_kwp, 2)
          if (seenKwp.has(kwpKey)) continue
          seenKwp.add(kwpKey)

          const score = hasAc ? Math.abs(inv.p_nom / 1000 - o.target_inverter_kw) : Math.abs(validation.total_kwp - o.target_kwp)
          acc.push({
            module_id: mod.module_id,
            inverter_id: inv.inverter_id,
            mppt_config: cfg.map((c, idx) => (c ? { mppt_idx: idx, series: c.series, strings: c.strings } : null)).filter(Boolean),
            validation: { ...validation, ressalva_reasons: reasons, applied_rules: adjusted.applied_rules },
            score,
          })
        }
      }
    }
    acc.sort((a, b) => a.score - b.score || a.inverter_id - b.inverter_id || a.module_id - b.module_id || a.validation.total_kwp - b.validation.total_kwp)
    return acc.slice(0, limit)
  }

  // ---------- comparativo de area ----------
  function compareModulesArea(modules, targetKwp, areaUtilM2) {
    return modules.map((mod) => {
      const areaM2 = (mod.altura_mm * mod.largura_mm) / 1_000_000
      const wPorM2 = areaM2 ? mod.pnom / areaM2 : 0
      let quantidadeKwp = null, kwpAtingido = null, areaOcupada = null
      if (targetKwp != null) {
        quantidadeKwp = jsRound((targetKwp * 1000) / mod.pnom)
        kwpAtingido = (quantidadeKwp * mod.pnom) / 1000
        areaOcupada = quantidadeKwp * areaM2
      }
      let quantidadeArea = null, kwpAtingidoArea = null
      if (areaUtilM2 != null) {
        quantidadeArea = areaM2 ? Math.floor(areaUtilM2 / areaM2) : 0
        kwpAtingidoArea = (quantidadeArea * mod.pnom) / 1000
      }
      return {
        module_id: mod.module_id, label: mod.label, pnom: mod.pnom, efic: mod.efic, area_m2: areaM2, w_por_m2: wPorM2,
        peso_kg: mod.peso_kg, quantidade_kwp: quantidadeKwp, kwp_atingido: kwpAtingido, area_ocupada_m2: areaOcupada,
        quantidade_area: quantidadeArea, kwp_atingido_area: kwpAtingidoArea,
      }
    })
  }

  root.Engine = {
    ToolError, applyModuleCorrections, calculateMpptLimits, validateKit, recomputeBadgeFromPerMppt, autoConfigStrings,
    buildAdjustedInverter, validateKitWithRules, buildValidationResponse, mpptLimitsForKit, suggestKit, compareModulesArea,
    ruleApplies, evaluateConditions, kitContext, METRICS, OPERATORS, TARGETS, MODES, DEFAULT_ADJUSTMENTS,
    DC_AC_RATIO_MIN_PCT_DEFAULT, checkMinDcAcRatio, pyRound,
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Engine
})(typeof window !== 'undefined' ? window : globalThis)
