(() => {
  const E = window.Engine
  const D = JSON.parse(document.getElementById('fotus-data').textContent)
  const modById = new Map(D.modules.map((m) => [m.module_id, m]))
  const invById = new Map(D.inverters.map((i) => [i.inverter_id, i]))
  const adjFor = (inv) => D.adjustments.byInverter[String(inv.inverter_id)] || D.adjustments.default

  // ---------- utilidades ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = v
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v)
      else if (v === true) el.setAttribute(k, '')
      else el.setAttribute(k, v)
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
    }
    return el
  }
  const $ = (sel, root = document) => root.querySelector(sel)
  const fmt = (n, d = 1) => (n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }))
  const label = (x) => `${x.brand} ${x.model}`
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild) }
  const tone = (badge) => (badge === 'Aprovado' || badge === 'OK' ? 'ok' : badge === 'Reprovado' ? 'bad' : 'warn')
  const pill = (badge) => h('span', { class: `pill ${tone(badge)}` }, badge)
  const overloadPct = (inv) => (inv.p_max_cc != null && inv.p_nom > 0 ? (inv.p_max_cc / inv.p_nom - 1) * 100 : null)
  const alertBox = (kind, title, body) => h('div', { class: `alert ${kind}` }, title ? h('strong', null, title + ' ') : null, body)

  // ---------- estado ----------
  const sampleModule = D.modules.find((m) => m.model.startsWith('RS6-585NG-E3')) || D.modules[0]
  const sampleInverter = D.inverters.find((i) => i.model.startsWith('ASW 40K-LT-G3 380V (3 MPPT)')) || D.inverters[0]
  const S = {
    tab: 'dim',
    step: 4,
    regionId: 'Conservador',
    manual: false,
    tMin: 0,
    tMax: 60,
    moduleId: sampleModule.module_id,
    inverterId: sampleInverter.inverter_id,
    mppt: null,
    auto: null,
    noData: null,
    modF: { q: '', brand: '', power: 'all' },
    invF: { q: '', brand: '', fase: '' },
    example: true,
  }
  const thermal = () => ({ min: S.tMin, max: S.tMax })

  // ---------- casca ----------
  const TABS = [
    ['dim', 'Dimensionar'],
    ['sug', 'Sugestão automática'],
    ['area', 'Comparativo de área'],
    ['adj', 'Ajustes aplicados'],
  ]
  const root = $('#app')
  const views = {}
  const tabBtns = {}
  const tabs = h('div', { class: 'tabs', role: 'tablist' })
  for (const [id, text] of TABS) {
    tabBtns[id] = h('button', { class: 'tab', role: 'tab', id: `tab-${id}`, 'aria-selected': 'false', onclick: () => setTab(id) }, text)
    tabs.append(tabBtns[id])
    views[id] = h('section', { class: 'view', id: `view-${id}`, role: 'tabpanel', 'aria-labelledby': `tab-${id}`, hidden: true })
  }
  root.append(
    h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'wordmark' }, 'FOTUS', h('b', null, '.')), h('span', { class: 'sub' }, 'Calculadora de dimensionamento módulo × inversor')),
      tabs),
    ...Object.values(views),
    h('p', { class: 'foot' },
      `Catálogo: ${D.modules.length} módulos e ${D.inverters.length} inversores. Fonte: ${D.fonte}. Ajustes de cálculo copiados em ${D.geradoEm}. `,
      'Esta página é uma cópia somente leitura; resultados e regras seguem o motor de cálculo da Fotus.'),
  )
  const built = {}
  function setTab(id) {
    S.tab = id
    for (const [tid] of TABS) {
      const on = tid === id
      views[tid].hidden = !on
      tabBtns[tid].setAttribute('aria-selected', String(on))
    }
    if (!built[id]) {
      built[id] = true
      ;({ dim: renderDim, sug: buildSug, area: buildArea, adj: buildAdj })[id]()
    } else if (id === 'dim') renderDim()
    try { history.replaceState(null, '', '#' + id) } catch {}
  }

  // ---------- DIMENSIONAR ----------
  const STEPS = ['Local térmico', 'Módulo', 'Inversor', 'Strings por MPPT', 'Resultado']
  function stepsNav() {
    return h('div', { class: 'steps', role: 'navigation', 'aria-label': 'Passos' },
      STEPS.map((name, i) => {
        const n = i + 1
        const blocked = (n >= 3 && !S.moduleId) || (n >= 4 && !S.inverterId)
        return h('button', {
          class: `step ${n < S.step ? 'done' : ''}`, 'aria-current': n === S.step ? 'step' : null, disabled: blocked,
          onclick: () => goStep(n),
        }, `${n}. ${name}`)
      }))
  }
  function goStep(n) {
    S.step = n
    renderDim()
  }
  function renderDim() {
    const v = views.dim
    clear(v)
    v.append(stepsNav())
    if (S.example && S.step === 4) {
      v.append(alertBox('ok', 'Kit de exemplo carregado.', 'Altere os módulos em série e as strings abaixo, ou volte aos passos 2 e 3 para trocar o módulo e o inversor.'))
    }
    const body = h('div', { class: 'stack' })
    v.append(body)
    ;[null, stepThermal, stepModule, stepInverter, stepStrings, stepResult][S.step](body)
  }

  function stepThermal(body) {
    body.append(h('h2', null, '1. Local térmico'),
      h('p', { class: 'muted' }, 'Escolha um preset regional (temperaturas mínima e máxima esperadas) ou informe manualmente. Esses valores corrigem as especificações do módulo para o pior caso térmico.'))
    const chips = h('div', { class: 'chips' })
    const mi = h('input', { class: 'input', id: 'tmin', type: 'number', value: S.tMin })
    const ma = h('input', { class: 'input', id: 'tmax', type: 'number', value: S.tMax })
    function paint() {
      clear(chips)
      for (const r of D.regions) {
        chips.append(h('button', {
          class: 'chip', 'aria-pressed': String(!S.manual && S.regionId === r.region_id),
          onclick: () => { S.manual = false; S.regionId = r.region_id; S.tMin = r.t_min; S.tMax = r.t_max; mi.value = r.t_min; ma.value = r.t_max; paint() },
        }, h('b', null, r.label + (r.is_default ? ' (padrão)' : '')), h('span', null, `${r.t_min}°C a ${r.t_max}°C`)))
      }
    }
    paint()
    const manualInput = () => { S.manual = true; S.tMin = Number(mi.value); S.tMax = Number(ma.value); paint() }
    mi.addEventListener('input', manualInput)
    ma.addEventListener('input', manualInput)
    body.append(chips,
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { for: 'tmin' }, 'Temperatura mínima (°C)'), mi),
        h('div', { class: 'field' }, h('label', { for: 'tmax' }, 'Temperatura máxima (°C)'), ma)),
      h('div', { class: 'actions' }, h('span'), h('button', { class: 'btn primary', onclick: () => goStep(2) }, 'Continuar →')))
  }

  function powerOk(m, p) {
    return p === 'all' || (p === '0-400' ? m.pnom < 400 : p === '400-500' ? m.pnom >= 400 && m.pnom < 500 : p === '500-600' ? m.pnom >= 500 && m.pnom < 600 : p === '600-700' ? m.pnom >= 600 && m.pnom < 700 : m.pnom >= 700)
  }
  function picker({ title, intro, filters, items, selectedId, render, onPick, onNext, onBack, count }) {
    const list = h('div', { class: 'list', role: 'list' })
    const info = h('p', { class: 'muted small', 'aria-live': 'polite' })
    const next = h('button', { class: 'btn primary', onclick: onNext }, 'Continuar →')
    function paint() {
      clear(list)
      const found = items()
      for (const it of found.slice(0, 80)) list.append(render(it, () => { onPick(it); paint() }))
      info.textContent = `${found.length} ${count}${found.length > 80 ? ' — mostrando 80, refine a busca' : ''}`
      if (!found.length) list.append(h('p', { class: 'muted', style: 'padding:14px' }, 'Nenhum item encontrado com esses filtros.'))
      next.disabled = !selectedId()
    }
    const frag = [h('h2', null, title), h('p', { class: 'muted' }, intro), h('div', { class: 'row' }, filters(paint)), info, list,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: onBack }, '← Voltar'), next)]
    return { frag, paint }
  }
  const sel = (id, labelText, value, opts, onchange) =>
    h('div', { class: 'field' }, h('label', { for: id }, labelText),
      h('select', { class: 'input', id, onchange: (e) => onchange(e.target.value) },
        opts.map(([v, t]) => h('option', { value: v, selected: v === value }, t))))

  function stepModule(body) {
    const brands = [...new Set(D.modules.map((m) => m.brand))].sort()
    const { frag, paint } = picker({
      title: '2. Módulo fotovoltaico', intro: 'Selecione o módulo que será utilizado no kit.', count: 'módulos',
      filters: (paint) => [
        h('div', { class: 'field grow' }, h('label', { for: 'mq' }, 'Buscar'),
          h('input', { class: 'input', id: 'mq', type: 'search', placeholder: 'Marca ou modelo…', value: S.modF.q, oninput: (e) => { S.modF.q = e.target.value; paint() } })),
        sel('mb', 'Marca', S.modF.brand, [['', 'Todas as marcas'], ...brands.map((b) => [b, b])], (v) => { S.modF.brand = v; paint() }),
        sel('mp', 'Potência', S.modF.power, [['all', 'Todas'], ['0-400', 'Até 400 Wp'], ['400-500', '400–500 Wp'], ['500-600', '500–600 Wp'], ['600-700', '600–700 Wp'], ['700+', 'Acima de 700 Wp']], (v) => { S.modF.power = v; paint() }),
      ],
      items: () => {
        const q = S.modF.q.trim().toLowerCase()
        return D.modules.filter((m) => (!S.modF.brand || m.brand === S.modF.brand) && powerOk(m, S.modF.power) && (!q || m.label.toLowerCase().includes(q)))
      },
      selectedId: () => S.moduleId,
      render: (m, pick) => h('button', { class: 'item', 'aria-pressed': String(m.module_id === S.moduleId), onclick: pick },
        h('span', { class: 'brand-tag' }, m.brand),
        h('span', { class: 'big' }, `${fmt(m.pnom, 0)} Wp`),
        h('span', { class: 'name' }, m.model),
        h('span', { class: 'spec' }, `Voc ${fmt(m.voc, 2)} V · Vmp ${fmt(m.vmp, 2)} V · Isc ${fmt(m.isc, 2)} A · Imp ${fmt(m.imp, 2)} A${m.efic ? ` · ${fmt(m.efic * (m.efic < 1 ? 100 : 1), 2)}%` : ''}`)),
      onPick: (m) => { S.moduleId = m.module_id; S.mppt = null; S.example = false },
      onNext: () => goStep(3), onBack: () => goStep(1),
    })
    body.append(...frag)
    paint()
  }

  function stepInverter(body) {
    const brands = [...new Set(D.inverters.map((i) => i.brand))].sort()
    const fases = [...new Set(D.inverters.map((i) => i.fase).filter(Boolean))].sort()
    const { frag, paint } = picker({
      title: '3. Inversor', intro: 'Selecione o inversor. A sobrecarga mostrada é a do cadastro (o resultado considera os ajustes aplicados).', count: 'inversores',
      filters: (paint) => [
        h('div', { class: 'field grow' }, h('label', { for: 'iq' }, 'Buscar'),
          h('input', { class: 'input', id: 'iq', type: 'search', placeholder: 'Marca ou modelo…', value: S.invF.q, oninput: (e) => { S.invF.q = e.target.value; paint() } })),
        sel('ib', 'Marca', S.invF.brand, [['', 'Todas as marcas'], ...brands.map((b) => [b, b])], (v) => { S.invF.brand = v; paint() }),
        sel('if', 'Fase', S.invF.fase, [['', 'Todas'], ...fases.map((f) => [f, f])], (v) => { S.invF.fase = v; paint() }),
      ],
      items: () => {
        const q = S.invF.q.trim().toLowerCase()
        return D.inverters.filter((i) => (!S.invF.brand || i.brand === S.invF.brand) && (!S.invF.fase || i.fase === S.invF.fase) && (!q || label(i).toLowerCase().includes(q)))
      },
      selectedId: () => S.inverterId,
      render: (i, pick) => h('button', { class: 'item', 'aria-pressed': String(i.inverter_id === S.inverterId), onclick: pick },
        h('span', { class: 'brand-tag' }, i.brand),
        h('span', { class: 'big' }, `${fmt(i.p_nom / 1000, i.p_nom % 1000 ? 1 : 0)} kW`),
        h('span', { class: 'name' }, i.model),
        h('span', { class: 'spec' }, `${i.num_mppt} MPPT · V max ${fmt(i.v_max, 0)} V · MPP ${fmt(i.v_mpp_min, 0)}–${fmt(i.v_mpp_max, 0)} V · sobrecarga +${fmt(overloadPct(i), 0)}%${i.fase ? ' · ' + i.fase : ''}`)),
      onPick: (i) => { S.inverterId = i.inverter_id; S.mppt = null; S.example = false },
      onNext: () => goStep(4), onBack: () => goStep(2),
    })
    body.append(...frag)
    paint()
  }

  // ----- strings por MPPT -----
  function initMppt(inv, mod, adj) {
    const staticInv = E.buildAdjustedInverter(inv, adj)
    S.mppt = []; S.auto = []; S.noData = []
    for (let i = 0; i < inv.num_mppt; i++) {
      try {
        const lim = E.calculateMpptLimits(staticInv, mod, S.tMin, S.tMax, i)
        const series = Math.min(lim.max_series, Math.max(lim.min_series, Math.floor((lim.min_series + lim.max_series) / 2 + 0.5)))
        S.mppt.push({ series, strings: 1 }); S.auto.push({ series, strings: 1 }); S.noData.push(false)
      } catch (e) {
        if (!(e instanceof E.ToolError)) throw e
        S.mppt.push(null); S.auto.push(null); S.noData.push(true)
      }
    }
    if (S.example) { // o kit do exemplo: 15 em serie x 2 strings
      S.mppt = S.mppt.map((c) => (c ? { series: 15, strings: 2 } : c))
      S.auto = S.auto.map((c) => (c ? { series: 15, strings: 2 } : c))
    }
  }

  function explainIssue(entry, lim, inv) {
    const out = []
    if (entry.series > 0 && entry.series < lim.min_series) {
      out.push(`Poucos módulos em série (${entry.series} de no mínimo ${lim.min_series}). Tensão do arranjo (Vmp): ${fmt(entry.series * lim.vmp_min)} V — abaixo do mínimo exigido pelo inversor. Com a tensão baixa, o inversor pode não conseguir aproveitar toda a energia gerada — ou nem ligar.`)
    }
    if (entry.series > lim.max_series) {
      out.push(`Módulos demais em série (${entry.series} acima do máximo de ${lim.max_series}). Tensão do arranjo (Voc): ${fmt(entry.series * lim.voc_max)} V — acima do máximo de ${fmt(lim.effective_v_max)} V suportado pelo inversor. Ultrapassar esse limite tem risco de danificar o equipamento.`)
    }
    if (entry.strings > lim.max_strings) {
      const head = `Fileiras (strings) demais nesse MPPT (${entry.strings} acima do máximo de ${lim.max_strings}). `
      if (entry.strings > lim.lin_max) out.push(head + `Essa entrada do inversor só aceita fisicamente ${lim.lin_max} fileira(s) conectada(s).`)
      else if (entry.strings > lim.max_strings_by_isc) out.push(head + `Corrente do arranjo (Isc): ${fmt(entry.strings * lim.isc_max)} A — acima do máximo de ${fmt(lim.isc_mppt)} A suportado por essa entrada do inversor.`)
      else out.push(head + `Corrente do arranjo (Imp): ${fmt(entry.strings * lim.imp_max)} A — acima do máximo de ${fmt(lim.imax_mppt)} A suportado por essa entrada do inversor.`)
    }
    return out
  }

  function stepStrings(body) {
    const inv = invById.get(S.inverterId), mod = modById.get(S.moduleId), adj = adjFor(inv)
    if (!S.mppt || S.mppt.length !== inv.num_mppt) initMppt(inv, mod, adj)
    const rules = (adj.rules || []).filter((r) => r.enabled)
    const minRatio = adj.dc_ac_ratio_min_pct_override != null ? adj.dc_ac_ratio_min_pct_override : E.DC_AC_RATIO_MIN_PCT_DEFAULT
    const catPct = overloadPct(inv)
    const overloadReplaced = adj.overload_pct_override != null && catPct != null && Math.abs(adj.overload_pct_override - catPct) >= 0.05

    const tKwp = h('span', { class: 'big' }), tSub = h('span', { class: 'small' })
    const banners = h('div', { class: 'stack' })
    const cards = []
    const mpptGrid = h('div', { class: 'mppts' })
    const next = h('button', { class: 'btn primary', onclick: () => { S.example = false; goStep(5) } }, 'Ver resultado →')

    body.append(
      h('h2', null, '4. Strings por MPPT'),
      h('p', { class: 'muted' }, `Ajuste os módulos em série e as strings de cada MPPT do ${label(inv)}. Os limites já consideram a correção térmica informada (${S.tMin}°C a ${S.tMax}°C). Se a instalação não usar algum MPPT, desmarque-o.`),
      h('div', { class: 'tiles' },
        h('div', { class: 'tile' }, h('span', { class: 'lbl' }, 'Módulo'), h('span', { class: 'v' }, label(mod)), h('span', { class: 'small muted' }, `${fmt(mod.pnom, 0)} Wp`)),
        h('div', { class: 'tile' }, h('span', { class: 'lbl' }, 'Inversor'), h('span', { class: 'v' }, label(inv)),
          h('span', { class: 'small muted' }, `${fmt(inv.p_nom / 1000)} kW nominal · overload máx. ${fmt((inv.p_max_cc || 0) / 1000)} kW (+${fmt(catPct)}%)`)),
        h('div', { class: 'tile hl' }, h('span', { class: 'lbl' }, 'Potência do arranjo'), tKwp, tSub)),
      banners, mpptGrid,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => goStep(3) }, '← Voltar'), next))

    for (let i = 0; i < inv.num_mppt; i++) {
      const c = { i }
      c.limits = h('div', { class: 'limits' })
      c.series = h('input', { class: 'input', id: `series-${i}`, type: 'number', min: 0, inputmode: 'numeric' })
      c.strings = h('input', { class: 'input', id: `strings-${i}`, type: 'number', min: 0, inputmode: 'numeric' })
      c.kwp = h('p', { class: 'small muted' })
      c.warn = h('ul')
      c.warnWrap = h('div', { class: 'alert warn', hidden: true }, h('strong', null, 'Fora dos limites recomendados:'), c.warn)
      c.use = h('input', { type: 'checkbox', id: `use-${i}` })
      c.use.addEventListener('change', () => {
        S.mppt[i] = c.use.checked ? { ...(S.auto[i] || { series: 0, strings: 0 }) } : null
        sync(c); update()
      })
      for (const f of ['series', 'strings']) c[f].addEventListener('input', () => { S.mppt[i] = { ...(S.mppt[i] || { series: 0, strings: 0 }), [f]: Number(c[f].value) }; update() })
      c.card = h('div', { class: 'card mppt' },
        h('header', null, h('h3', null, `MPPT ${i + 1}`), S.noData[i] ? h('span', { class: 'small muted' }, 'sem dados no cadastro') : h('label', { class: 'check' }, c.use, 'Usar este MPPT')),
        c.limits,
        h('div', { class: 'two' },
          h('div', { class: 'field' }, h('label', { for: `series-${i}` }, 'Módulos em série'), c.series),
          h('div', { class: 'field' }, h('label', { for: `strings-${i}` }, 'Strings'), c.strings)),
        c.kwp, c.warnWrap)
      cards.push(c)
      mpptGrid.append(c.card)
      sync(c)
    }
    function sync(c) {
      const e = S.mppt[c.i]
      c.use.checked = !!e
      c.series.value = e && e.series ? e.series : ''
      c.strings.value = e && e.strings ? e.strings : ''
      c.series.disabled = c.strings.disabled = !e
      c.card.classList.toggle('off', !e)
    }

    function update() {
      let totalKw = 0
      for (const e of S.mppt) if (e) totalKw += e.series * e.strings * mod.pnom
      totalKw /= 1000
      const ratio = inv.p_nom > 0 ? (totalKw / (inv.p_nom / 1000)) * 100 : 0
      tKwp.textContent = `${fmt(totalKw, 2)} kWp`
      tSub.textContent = `${fmt(ratio)}% da potência nominal do inversor` + (ratio < minRatio ? ` — abaixo do mínimo de ${fmt(minRatio)}% exigido pela Fotus` : '')
      tSub.className = 'small ' + (ratio < minRatio ? 'warn-text' : 'muted')

      const limits = cards.map((c) => {
        if (S.noData[c.i]) return null
        try { return E.mpptLimitsForKit(inv, mod, S.tMin, S.tMax, c.i, totalKw, adj) } catch (e) { if (e instanceof E.ToolError) return null; throw e }
      })
      const applied = (limits.find((l) => l && l.applied_rules.length) || { applied_rules: [] }).applied_rules
      const overLimit = limits.filter((l, i) => l && S.mppt[i] && S.mppt[i].series > l.max_series).length

      clear(banners)
      if (overloadReplaced) {
        banners.append(alertBox('warn', 'Sobrecarga do catálogo substituída:', `a sobrecarga cadastrada deste inversor (+${fmt(catPct)}%, ${fmt(inv.p_max_cc / 1000)} kW) está sendo substituída por +${fmt(adj.overload_pct_override)}% (${fmt((inv.p_nom * (1 + adj.overload_pct_override / 100)) / 1000)} kW) pelos ajustes de cálculo; é esse limite que valerá na validação do kit.`))
      }
      if (applied.length) {
        const box = alertBox('warn', 'Regra condicional ativa — limites recalculados automaticamente:', h('ul', null, applied.map((r) => h('li', null, r.description))))
        if (overLimit) {
          box.append(h('button', { class: 'btn sm', onclick: () => {
            S.mppt = S.mppt.map((e, i) => (e && limits[i] && e.series > limits[i].max_series ? { ...e, series: limits[i].max_series } : e))
            cards.forEach(sync); update()
          } }, `Redimensionar módulos em série ao novo limite (${overLimit} MPPT)`))
        }
        banners.append(box)
      } else if (rules.length) {
        banners.append(h('p', { class: 'muted small' }, `Este inversor tem regras condicionais (${rules.map((r) => r.name).join('; ')}). Enquanto o kit não atingir as condições, valem os limites cadastrados; ao atingir, os limites por MPPT são recalculados automaticamente.`))
      }

      cards.forEach((c) => {
        const lim = limits[c.i], e = S.mppt[c.i]
        clear(c.limits)
        if (S.noData[c.i]) { c.limits.append(h('span', null, 'O cadastro deste inversor não traz as correntes deste MPPT.')) }
        else if (lim) {
          c.limits.append(h('span', null, 'Série permitida: ', h('strong', null, `${lim.min_series}–${lim.max_series}`)), h('span', null, 'Strings máx.: ', h('strong', null, lim.max_strings)), h('span', null, `Limitante: ${lim.limiting_factor}`))
        }
        clear(c.warn)
        let bad = false
        if (e && lim && e.series > 0 && e.strings > 0) {
          const sOk = e.series >= lim.min_series && e.series <= lim.max_series, stOk = e.strings >= 1 && e.strings <= lim.max_strings
          c.series.className = 'input ' + (sOk ? 'ok' : 'bad'); c.strings.className = 'input ' + (stOk ? 'ok' : 'bad')
          if (!sOk || !stOk) { bad = true; explainIssue(e, lim, inv).forEach((t) => c.warn.append(h('li', null, t))) }
          c.kwp.textContent = `${fmt((e.series * e.strings * mod.pnom) / 1000, 2)} kWp neste MPPT`
        } else { c.series.className = c.strings.className = 'input'; c.kwp.textContent = '' }
        c.warnWrap.hidden = !bad
      })
      const someUsed = S.mppt.some((e) => e)
      const complete = S.mppt.every((e) => !e || (e.series > 0 && e.strings > 0))
      next.disabled = !(someUsed && complete)
    }
    update()
  }

  // ----- resultado -----
  function summaryText(inv, mod, cfg, r) {
    const used = cfg.map((c, i) => (c ? `MPPT ${i + 1}: ${c.series} × ${c.strings}` : null)).filter(Boolean).join(' | ')
    return `Kit ${r.overall_badge}\n${label(mod)} (${fmt(mod.pnom, 0)} Wp) + ${label(inv)}\n${r.total_mods} módulos · ${fmt(r.total_kwp, 2)} kWp · ${fmt(r.ratio_cc_ca, 0)}% CC/CA · temperatura ${S.tMin}°C a ${S.tMax}°C\n${used}`
  }
  function groupCfg(cfg) {
    const groups = []
    cfg.forEach((c, i) => {
      if (!c) return
      const last = groups[groups.length - 1]
      if (last && last.series === c.series && last.strings === c.strings && last.to === i - 1 + 0) { last.to = i } else groups.push({ from: i, to: i, series: c.series, strings: c.strings })
    })
    return groups.map((g) => `${g.from === g.to ? `MPPT ${g.from + 1}` : `MPPT ${g.from + 1}–${g.to + 1}`}: ${g.series} × ${g.strings}`).join(' · ')
  }

  function stepResult(body) {
    const inv = invById.get(S.inverterId), mod = modById.get(S.moduleId), adj = adjFor(inv)
    if (!S.mppt) initMppt(inv, mod, adj)
    const cfg = S.mppt.map((c) => (c && c.series > 0 && c.strings > 0 ? c : null))
    let r
    try { r = E.buildValidationResponse(inv, mod, S.tMin, S.tMax, cfg, adj) } catch (e) {
      body.append(h('h2', null, '5. Resultado'), alertBox('bad', 'Não foi possível calcular:', e.message || String(e)), h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => goStep(4) }, '← Voltar')))
      return
    }
    const t = tone(r.overall_badge)
    const copyOut = h('span', { class: 'small muted', 'aria-live': 'polite' })
    const text = summaryText(inv, mod, cfg, r)
    body.append(
      h('h2', null, '5. Resultado'),
      h('div', { class: `verdict ${t}` },
        h('span', { class: 'title' }, r.overall_badge),
        h('div', null, h('p', { class: 'small' }, `${label(mod)} + ${label(inv)}`),
          h('div', { class: 'stats' },
            h('span', null, h('b', null, r.total_mods), ' módulos'), h('span', null, h('b', null, fmt(r.total_kwp, 2)), ' kWp'),
            h('span', null, h('b', null, fmt(r.ratio_cc_ca, 0) + '%'), ' CC/CA'), h('span', null, h('b', null, fmt(r.overload_kw)), ' kW de limite CC')))))
    if (r.overload_override) body.append(alertBox('warn', 'Sobrecarga do catálogo substituída:', r.overload_override.message))
    if (r.wiring_note) body.append(alertBox('bad', 'Atenção:', r.wiring_note))
    if (r.dc_ac_ratio_note) body.append(alertBox('bad', 'Atenção:', r.dc_ac_ratio_note))
    if (!r.rules_relaxed && r.applied_rules.length) body.append(alertBox('warn', 'Regras condicionais aplicadas:', h('ul', null, r.applied_rules.map((a) => h('li', null, a.description)))))
    if (r.ressalva_reasons.length) body.append(alertBox('warn', r.overall_badge === 'Aprovado com ressalva' ? 'Aprovado com ressalva:' : 'Ressalvas:', h('ul', null, r.ressalva_reasons.map((x) => h('li', null, x)))))
    body.append(
      h('h3', null, 'Detalhamento por MPPT'),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, ['MPPT', 'Configuração', 'Série permitida', 'Strings máx.', 'Voc arranjo (V)', 'Vmp arranjo (V)', 'Imp arranjo (A)', 'Status'].map((x, i) => h('th', { class: i >= 2 && i <= 6 ? 'num' : '' }, x)))),
        h('tbody', null, r.per_mppt.map((p) => h('tr', null,
          h('td', null, `MPPT ${p.mppt_idx + 1}`), h('td', null, `${p.series} em série × ${p.strings} string(s)`),
          h('td', { class: 'num' }, `${p.limits.min_series}–${p.limits.max_series} ${p.series_ok ? '✓' : '✗'}`),
          h('td', { class: 'num' }, `${p.limits.max_strings} ${p.strings_ok ? '✓' : '✗'}`),
          h('td', { class: 'num' }, fmt(p.voc_arranjo)), h('td', { class: 'num' }, fmt(p.vmp_arranjo)), h('td', { class: 'num' }, fmt(p.imp_arranjo)),
          h('td', null, pill(p.badge))))))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => goStep(4) }, '← Ajustar strings'),
        h('span', null, copyOut, ' ', h('button', { class: 'btn', onclick: async () => {
          try { await navigator.clipboard.writeText(text); copyOut.textContent = 'Resumo copiado.' } catch {
            const ta = h('textarea', { class: 'input', rows: 5, readonly: true }, text); copyOut.replaceChildren(ta); ta.select()
          }
        } }, 'Copiar resumo'))))
  }

  // ---------- SUGESTAO AUTOMATICA ----------
  function buildSug() {
    const v = views.sug
    const st = { mode: 'kwp', value: 10, region: 'Conservador' }
    const modBrands = [...new Set(D.modules.map((m) => m.brand))].sort(), invBrands = [...new Set(D.inverters.map((i) => i.brand))].sort()
    const fases = [...new Set(D.inverters.map((i) => i.fase).filter(Boolean))].sort()
    const results = h('div', { class: 'stack', 'aria-live': 'polite' })
    const f = {}
    const input = (id, type, props) => (f[id] = h('input', { class: 'input', id, type, ...props }))
    const selectEl = (id, opts, value) => (f[id] = h('select', { class: 'input', id }, opts.map(([val, t]) => h('option', { value: val, selected: val === value }, t))))
    v.append(
      h('h2', null, 'Sugestão automática'),
      h('p', { class: 'muted' }, 'Informe uma meta e a calculadora procura combinações módulo + inversor aprovadas em todo o catálogo.'),
      h('div', { class: 'card stack' },
        h('div', { class: 'row' },
          h('div', { class: 'field' }, h('label', { for: 'smode' }, 'Tipo de meta'),
            selectEl('smode', [['kwp', 'Meta em kWp dos módulos'], ['kw', 'Meta em kW do inversor']], 'kwp')),
          h('div', { class: 'field' }, h('label', { for: 'sval' }, 'Valor da meta'), input('sval', 'number', { min: 0, step: 'any', value: 10 })),
          h('div', { class: 'field' }, h('label', { for: 'sreg' }, 'Região térmica'),
            selectEl('sreg', D.regions.map((r) => [r.region_id, `${r.label} (${r.t_min}°C a ${r.t_max}°C)`]), 'Conservador'))),
        h('div', { class: 'row' },
          h('div', { class: 'field grow' }, h('label', { for: 'smb' }, 'Marca do módulo'), selectEl('smb', [['', 'Qualquer'], ...modBrands.map((b) => [b, b])], '')),
          h('div', { class: 'field grow' }, h('label', { for: 'sib' }, 'Marca do inversor'), selectEl('sib', [['', 'Qualquer'], ...invBrands.map((b) => [b, b])], '')),
          h('div', { class: 'field' }, h('label', { for: 'sfase' }, 'Fase'), selectEl('sfase', [['', 'Qualquer'], ...fases.map((x) => [x, x])], ''))),
        h('div', { class: 'actions' }, h('p', { class: 'muted small', id: 'shint' }), h('button', { class: 'btn primary', id: 'sgo' }, 'Buscar sugestões'))),
      results)
    const hint = () => {
      $('#shint').textContent = f.smode.value === 'kwp' ? 'Mostra kits dentro de ±5% da meta de kWp.' : 'Mostra só inversores com potência nominal igual à meta.'
    }
    f.smode.addEventListener('change', hint); hint()
    $('#sgo').addEventListener('click', () => {
      const val = Number(f.sval.value)
      clear(results)
      if (!(val > 0)) { results.append(alertBox('bad', null, 'Informe uma meta maior que zero.')); return }
      results.append(h('p', { class: 'muted' }, 'Calculando…'))
      const reg = D.regions.find((r) => r.region_id === f.sreg.value)
      setTimeout(() => {
        const opts = { [f.smode.value === 'kwp' ? 'target_kwp' : 'target_inverter_kw']: val, max_suggestions: 60 }
        if (f.smb.value) opts.module_brand = f.smb.value
        if (f.sib.value) opts.inverter_brand = f.sib.value
        if (f.sfase.value) opts.inverter_phase = f.sfase.value
        let list
        try { list = E.suggestKit(D.modules, D.inverters, reg.t_min, reg.t_max, opts, D.adjustments.byInverter, D.adjustments.default) } catch (e) { clear(results); results.append(alertBox('bad', 'Não foi possível buscar:', e.message)); return }
        clear(results)
        results.append(h('p', { class: 'muted' }, `${list.length} opç${list.length === 1 ? 'ão encontrada' : 'ões encontradas'} — ${f.smode.value === 'kwp' ? 'dentro de ±5% da meta de kWp informada.' : 'com inversor de potência igual à meta informada.'}`))
        if (!list.length) results.append(alertBox('warn', null, 'Nenhum kit aprovado nessa faixa. Tente outra meta, outra região térmica ou remova filtros de marca.'))
        for (const s of list) {
          const mod = modById.get(s.module_id), inv = invById.get(s.inverter_id), val2 = s.validation
          const cfg = new Array(inv.num_mppt).fill(null)
          s.mppt_config.forEach((c) => (cfg[c.mppt_idx] = { series: c.series, strings: c.strings }))
          results.append(h('div', { class: 'card sug' },
            h('div', { class: 'head' }, h('span', { class: 'kit' }, `${label(inv)} + ${label(mod)}`), pill(val2.overall_badge)),
            h('div', { class: 'nums' }, h('span', null, h('b', null, fmt(val2.total_kwp, 2)), ' kWp'), h('span', null, h('b', null, val2.total_mods), ' módulos'),
              h('span', null, h('b', null, fmt(val2.ratio_cc_ca, 0) + '%'), ' CC/CA'), h('span', null, h('b', null, fmt(inv.p_nom / 1000, inv.p_nom % 1000 ? 1 : 0)), ' kW de inversor')),
            h('div', { class: 'cfg' }, groupCfg(cfg)),
            val2.ressalva_reasons.length ? alertBox('warn', 'Aprovado com ressalva:', h('ul', null, val2.ressalva_reasons.map((x) => h('li', null, x)))) : null,
            h('div', null, h('button', { class: 'btn sm', onclick: () => {
              S.moduleId = mod.module_id; S.inverterId = inv.inverter_id; S.mppt = cfg; S.auto = cfg.map((c) => c && { ...c }); S.noData = cfg.map(() => false)
              S.manual = false; S.regionId = reg.region_id; S.tMin = reg.t_min; S.tMax = reg.t_max; S.example = false; S.step = 5
              setTab('dim'); window.scrollTo({ top: 0 })
            } }, 'Abrir no dimensionador'))))
        }
      }, 30)
    })
  }

  // ---------- COMPARATIVO DE AREA ----------
  function buildArea() {
    const v = views.area
    const picked = new Set()
    for (const p of [450, 550, 580, 620, 700]) { const m = D.modules.find((x) => Math.abs(x.pnom - p) < 8 && !picked.has(x.module_id)); if (m) picked.add(m.module_id) }
    const out = h('div', { class: 'stack' })
    const list = h('div', { class: 'list' })
    const q = h('input', { class: 'input', id: 'aq', type: 'search', placeholder: 'Buscar módulo para adicionar…' })
    const kwp = h('input', { class: 'input', id: 'akwp', type: 'number', min: 0, step: 'any', value: 10 })
    const area = h('input', { class: 'input', id: 'aarea', type: 'number', min: 0, step: 'any', value: 60 })
    const count = h('p', { class: 'muted small' })
    function paintList() {
      clear(list)
      const t = q.value.trim().toLowerCase()
      D.modules.filter((m) => !t || m.label.toLowerCase().includes(t)).slice(0, 40).forEach((m) => {
        list.append(h('button', { class: 'item', 'aria-pressed': String(picked.has(m.module_id)), onclick: () => { picked.has(m.module_id) ? picked.delete(m.module_id) : picked.add(m.module_id); paintList(); paintTable() } },
          h('span', { class: 'brand-tag' }, m.brand), h('span', { class: 'big' }, `${fmt(m.pnom, 0)} Wp`), h('span', { class: 'name' }, m.model),
          h('span', { class: 'spec' }, `${fmt((m.altura_mm * m.largura_mm) / 1e6, 2)} m² · ${fmt(m.peso_kg)} kg`)))
      })
    }
    function paintTable() {
      clear(out)
      count.textContent = `${picked.size} módulo(s) selecionado(s). Toque num módulo para adicionar ou remover.`
      if (!picked.size) { out.append(h('p', { class: 'muted' }, 'Selecione ao menos um módulo para comparar.')); return }
      const tk = kwp.value === '' ? null : Number(kwp.value), au = area.value === '' ? null : Number(area.value)
      const rows = E.compareModulesArea([...picked].map((id) => modById.get(id)), tk, au)
      const cols = [['Módulo', 0], ['Pot. (Wp)', 1], ['Efic.', 1], ['Área (m²)', 1], ['W/m²', 1], ['Peso (kg)', 1]]
      if (tk != null) cols.push(['Qtd p/ meta', 1], ['kWp atingido', 1], ['Área ocupada (m²)', 1])
      if (au != null) cols.push(['Qtd p/ área', 1], ['kWp na área', 1])
      out.append(h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, cols.map(([c, n]) => h('th', { class: n ? 'num' : '' }, c)))),
        h('tbody', null, rows.map((r) => h('tr', null,
          h('td', { class: 'wrap' }, r.label), h('td', { class: 'num' }, fmt(r.pnom, 0)), h('td', { class: 'num' }, r.efic ? fmt(r.efic * (r.efic < 1 ? 100 : 1), 2) + '%' : '—'),
          h('td', { class: 'num' }, fmt(r.area_m2, 3)), h('td', { class: 'num' }, fmt(r.w_por_m2, 1)), h('td', { class: 'num' }, fmt(r.peso_kg)),
          tk != null ? [h('td', { class: 'num' }, r.quantidade_kwp), h('td', { class: 'num' }, fmt(r.kwp_atingido, 2)), h('td', { class: 'num' }, fmt(r.area_ocupada_m2, 2))] : null,
          au != null ? [h('td', { class: 'num' }, r.quantidade_area), h('td', { class: 'num' }, fmt(r.kwp_atingido_area, 2))] : null))))))
    }
    q.addEventListener('input', paintList); kwp.addEventListener('input', paintTable); area.addEventListener('input', paintTable)
    v.append(h('h2', null, 'Comparativo de área'),
      h('p', { class: 'muted' }, 'Compare módulos por potência, área ocupada e quantidade necessária para uma meta de kWp e/ou para uma área útil de telhado.'),
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { for: 'akwp' }, 'Meta de potência (kWp)'), kwp),
        h('div', { class: 'field' }, h('label', { for: 'aarea' }, 'Área útil disponível (m²)'), area)),
      h('div', { class: 'field' }, h('label', { for: 'aq' }, 'Módulos'), q), count, list, out)
    paintList(); paintTable()
  }

  // ---------- AJUSTES APLICADOS ----------
  function buildAdj() {
    const v = views.adj
    const a = D.adjustments.default
    const cat = E.METRICS
    const ruleText = (r) => {
      const when = r.conditions.length ? r.conditions.map((c) => `${cat[c.metric].label} ${E.OPERATORS[c.op][0]} ${fmt(c.value, 0)} ${cat[c.metric].unit}`).join(' e ') : 'sempre'
      const then = r.effects.map((e) => `${E.TARGETS[e.target].label}: ${e.mode === 'percent' ? `variar ${fmt(e.value, 1)}%` : e.mode === 'delta' ? `somar ${fmt(e.value, 1)} ${E.TARGETS[e.target].unit}` : `passa a ${fmt(e.value, 1)} ${E.TARGETS[e.target].unit}`}`).join('; ')
      return `Quando ${when} → ${then}.`
    }
    const kv = (k, val) => [h('dt', null, k), h('dd', null, val)]
    const nSpecific = Object.keys(D.adjustments.byInverter).length
    v.append(h('h2', null, 'Ajustes aplicados'),
      h('p', { class: 'muted' }, `Estes são os ajustes e regras de cálculo vigentes na calculadora da Fotus no momento da cópia (${D.geradoEm}). Esta página não os altera: eles entram em todo resultado, sugestão e validação.`),
      h('div', { class: 'card stack' }, h('h3', null, 'Padrão global'),
        h('dl', { class: 'kv' },
          kv('Sobrecarga', a.overload_pct_override == null ? 'Usa a sobrecarga cadastrada de cada inversor' : `${fmt(a.overload_pct_override, 0)}% (substitui o cadastro)`),
          kv('Potência mínima de entrada (CC/CA)', a.dc_ac_ratio_min_pct_override == null ? `${fmt(E.DC_AC_RATIO_MIN_PCT_DEFAULT, 0)}% (padrão Fotus)` : `${fmt(a.dc_ac_ratio_min_pct_override, 0)}%`),
          kv('Tolerância de I max', `+${fmt(a.imax_tolerance_a)} A`), kv('Tolerância de Isc max', `+${fmt(a.isc_tolerance_a)} A`),
          kv('Ajuste de V max', `${fmt(a.vmax_delta_v, 0)} V`), kv('Ajuste de V MPP min', `${fmt(a.vmpp_min_delta_v, 0)} V`), kv('Ajuste de V MPP max', `${fmt(a.vmpp_max_delta_v, 0)} V`))),
      h('div', { class: 'card stack' }, h('h3', null, 'Regras condicionais'),
        a.rules.length ? a.rules.map((r) => h('div', { class: 'rule' }, h('strong', null, r.name + (r.enabled ? '' : ' (desativada)')), h('span', { class: 'muted small' }, ruleText(r)),
          h('span', { class: 'muted small' }, r.inverter_ids ? `Vale para ${r.inverter_ids.length} inversores.` : 'Vale para todos os inversores.'))) : h('p', { class: 'muted' }, 'Nenhuma regra condicional ativa.')),
      h('p', { class: 'muted small' }, nSpecific ? `${nSpecific} inversores têm ajustes próprios.` : 'Nenhum inversor tem ajuste próprio: todos usam o padrão global acima.'),
      h('div', { class: 'card stack' }, h('h3', null, 'O que há nesta cópia'),
        h('dl', { class: 'kv' }, kv('Módulos', String(D.modules.length)), kv('Inversores', String(D.inverters.length)), kv('Regiões térmicas', D.regions.map((r) => r.label).join(', ')), kv('Fonte do catálogo', D.fonte)),
        h('p', { class: 'muted small' }, 'Ficaram de fora desta cópia: Mismatch, edição da base de dados e das configurações (áreas restritas), usuários e histórico de alterações.')))
  }

  const initial = (location.hash || '').replace('#', '')
  setTab(TABS.some(([id]) => id === initial) ? initial : 'dim')
})()
