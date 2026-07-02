import { useEffect, useMemo, useState } from 'react'
import { autoConfigStrings, getMpptLimits } from '../../api/endpoints'
import { extractErrorMessage } from '../../api/client'
import type { Inverter, Module, MpptConfigEntry, MpptLimits } from '../../types/api'
import { Spinner } from '../../components/Spinner'
import { ErrorAlert } from '../../components/ErrorAlert'
import './StepStrings.css'

interface StepStringsProps {
  module: Module
  inverter: Inverter
  tMin: number
  tMax: number
  mpptConfig: (MpptConfigEntry | null)[]
  onChange: (config: (MpptConfigEntry | null)[]) => void
  onBack: () => void
  onNext: () => void
}

function fmt1(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function fmt2(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Regra comercial Fotus: tolerância de +2A no Imax do inversor (ver
// backend/app/domain/calculo_solar/commercial_rules.py — mesmo valor).
const IMAX_TOLERANCE_A = 2

/**
 * Explica em linguagem simples (para o time comercial, sem jargão de
 * engenharia) por que uma configuração de série/strings está fora do
 * permitido para o MPPT — sempre mostrando o valor real calculado do
 * arranjo ao lado do limite do inversor.
 */
function explainStringsIssue(
  entry: { series: number; strings: number },
  lim: MpptLimits,
  inverter: Inverter,
): string[] {
  const reasons: string[] = []

  if (entry.series > 0 && entry.series < lim.min_series) {
    const vmpArranjo = entry.series * lim.vmp_min
    const vMppMin = inverter.v_mpp_min
    reasons.push(
      `Poucos módulos em série (${entry.series} de no mínimo ${lim.min_series}). ` +
        `Tensão do arranjo (Vmp): ${fmt1(vmpArranjo)} V` +
        (vMppMin != null ? ` — abaixo do mínimo de ${fmt1(vMppMin)} V exigido pelo inversor.` : '.') +
        ' Com a tensão baixa, o inversor pode não conseguir aproveitar toda a energia gerada — ou nem ligar.',
    )
  }
  if (entry.series > lim.max_series) {
    const vocArranjo = entry.series * lim.voc_max
    const vMax = inverter.v_max
    reasons.push(
      `Módulos demais em série (${entry.series} acima do máximo de ${lim.max_series}). ` +
        `Tensão do arranjo (Voc): ${fmt1(vocArranjo)} V` +
        (vMax != null ? ` — acima do máximo de ${fmt1(vMax)} V suportado pelo inversor.` : '.') +
        ' Ultrapassar esse limite tem risco de danificar o equipamento.',
    )
  }
  if (entry.strings > lim.max_strings) {
    const impArranjo = entry.strings * lim.imp_max
    const iscOk = entry.strings <= lim.max_strings_by_isc
    const linOk = entry.strings <= lim.lin_max
    const overByImax = impArranjo > lim.imax_mppt
    const imaxToleranceLimit = lim.imax_mppt + IMAX_TOLERANCE_A
    const withinImaxTolerance = impArranjo <= imaxToleranceLimit

    if (!linOk) {
      reasons.push(
        `Fileiras (strings) demais nesse MPPT (${entry.strings} acima do máximo de ${lim.max_strings}). ` +
          `Essa entrada do inversor só aceita fisicamente ${lim.lin_max} fileira(s) conectada(s).`,
      )
    } else if (!iscOk) {
      const iscArranjo = entry.strings * lim.isc_max
      reasons.push(
        `Fileiras (strings) demais nesse MPPT (${entry.strings} acima do máximo de ${lim.max_strings}). ` +
          `Corrente do arranjo (Isc): ${fmt1(iscArranjo)} A — acima do máximo de ${fmt1(lim.isc_mppt)} A ` +
          'suportado por essa entrada do inversor.',
      )
    } else if (overByImax && withinImaxTolerance) {
      reasons.push(
        `Fileiras (strings) demais nesse MPPT pelo limite padrão (${entry.strings} acima do máximo de ${lim.max_strings}). ` +
          `Corrente do arranjo (Imp): ${fmt1(impArranjo)} A — acima do máximo de ${fmt1(lim.imax_mppt)} A, ` +
          `mas dentro da margem de tolerância de +${IMAX_TOLERANCE_A}A que a Fotus permite ` +
          `(até ${fmt1(imaxToleranceLimit)} A). O kit poderá ser aprovado com ressalva na tela de resultado.`,
      )
    } else {
      reasons.push(
        `Fileiras (strings) demais nesse MPPT (${entry.strings} acima do máximo de ${lim.max_strings}). ` +
          `Corrente do arranjo (Imp): ${fmt1(impArranjo)} A — acima do máximo de ${fmt1(lim.imax_mppt)} A ` +
          `suportado por essa entrada do inversor (mesmo com a tolerância de +${IMAX_TOLERANCE_A}A da Fotus).`,
      )
    }
  }

  return reasons
}

export function StepStrings({
  module,
  inverter,
  tMin,
  tMax,
  mpptConfig,
  onChange,
  onBack,
  onNext,
}: StepStringsProps) {
  const [limits, setLimits] = useState<(MpptLimits | null)[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // MPPTs marcados como "não utilizado" pelo usuário (ex.: inversor com 2
  // MPPTs mas a instalação só usa 1). Nao usar um MPPT e uma opcao valida.
  const [unused, setUnused] = useState<boolean[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        // Busca limites por MPPT (mesmos para todos os indices na pratica, mas
        // a API aceita mppt_idx entao respeitamos por indice).
        const limitPromises = Array.from({ length: inverter.num_mppt }, (_, idx) =>
          getMpptLimits({
            inverter_id: inverter.inverter_id,
            module_id: module.module_id,
            t_min: tMin,
            t_max: tMax,
            mppt_idx: idx,
          }),
        )
        const [autoConfig, limitsResult] = await Promise.all([
          mpptConfig.length === inverter.num_mppt && mpptConfig.every((c) => c)
            ? Promise.resolve(null)
            : autoConfigStrings({
                inverter_id: inverter.inverter_id,
                module_id: module.module_id,
                t_min: tMin,
                t_max: tMax,
              }),
          Promise.all(limitPromises),
        ])

        if (cancelled) return
        setLimits(limitsResult)
        setUnused(Array.from({ length: inverter.num_mppt }, () => false))

        if (autoConfig) {
          onChange(autoConfig.mppt_config)
        }
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module.module_id, inverter.inverter_id, tMin, tMax])

  function updateEntry(idx: number, field: 'series' | 'strings', value: number) {
    const next = [...mpptConfig]
    const current = next[idx] ?? { series: 0, strings: 0 }
    next[idx] = { ...current, [field]: value }
    onChange(next)
  }

  function toggleUnused(idx: number) {
    const nextUnused = [...unused]
    nextUnused[idx] = !nextUnused[idx]
    setUnused(nextUnused)

    const next = [...mpptConfig]
    next[idx] = nextUnused[idx] ? null : (next[idx] ?? { series: 0, strings: 0 })
    onChange(next)
  }

  const totalKwp = useMemo(() => {
    return mpptConfig.reduce((sum, c) => sum + (c ? c.series * c.strings * module.pnom : 0), 0) / 1000
  }, [mpptConfig, module.pnom])

  const ratioPercent = inverter.p_nom > 0 ? (totalKwp / (inverter.p_nom / 1000)) * 100 : 0
  const overloadPercent = inverter.p_max_cc != null ? (inverter.p_max_cc / inverter.p_nom - 1) * 100 : null

  if (loading) return <Spinner label="Calculando limites de MPPT…" />
  if (error) return <ErrorAlert message={error} />

  const someUsed = unused.some((u, idx) => !u && idx < inverter.num_mppt)
  const allFilled =
    mpptConfig.length === inverter.num_mppt &&
    someUsed &&
    mpptConfig.every((c, idx) => unused[idx] || (c && c.series > 0 && c.strings > 0))

  return (
    <div>
      <h2>4. Strings por MPPT</h2>
      <p className="muted">
        Ajuste a quantidade de módulos em série e o número de strings para cada MPPT do{' '}
        {inverter.brand} {inverter.model}. Os limites abaixo já consideram a correção térmica
        informada. Se a instalação não for usar algum MPPT, desmarque-o — não é obrigatório usar
        todos.
      </p>

      <div className="kit-summary">
        <div className="kit-summary__item">
          <span className="kit-summary__label">Módulo</span>
          <span className="kit-summary__value">
            {module.brand} {module.model}
          </span>
          <span className="kit-summary__sub">{module.pnom} Wp</span>
        </div>
        <div className="kit-summary__item">
          <span className="kit-summary__label">Inversor</span>
          <span className="kit-summary__value">
            {inverter.brand} {inverter.model}
          </span>
          <span className="kit-summary__sub">
            {(inverter.p_nom / 1000).toLocaleString('pt-BR')} kW nominal
            {inverter.p_max_cc != null && (
              <>
                {' '}
                · overload máx.: {(inverter.p_max_cc / 1000).toLocaleString('pt-BR')} kW
                {overloadPercent != null && ` (+${fmt1(overloadPercent)}%)`}
              </>
            )}
          </span>
        </div>
        <div className="kit-summary__item kit-summary__item--highlight">
          <span className="kit-summary__label">Potência do arranjo (até agora)</span>
          <span className="kit-summary__value kit-summary__value--big">{fmt2(totalKwp)} kWp</span>
          <span className={`kit-summary__sub ${ratioPercent < 70 ? 'kit-summary__sub--warn' : ''}`}>
            {fmt1(ratioPercent)}% da potência nominal do inversor
            {ratioPercent < 70 && ' — abaixo do mínimo de 70% exigido pela Fotus'}
          </span>
        </div>
      </div>

      <div className="strings-grid">
        {Array.from({ length: inverter.num_mppt }, (_, idx) => {
          const lim = limits[idx]
          const isUnused = unused[idx]
          const entry = mpptConfig[idx] ?? { series: 0, strings: 0 }
          const seriesOk = lim ? entry.series >= lim.min_series && entry.series <= lim.max_series : true
          const stringsOk = lim ? entry.strings >= 1 && entry.strings <= lim.max_strings : true

          return (
            <div key={idx} className={`card strings-card ${isUnused ? 'strings-card--unused' : ''}`}>
              <div className="strings-card__header">
                <h3 className="strings-card__title">MPPT {idx + 1}</h3>
                <label className="strings-card__toggle">
                  <input
                    type="checkbox"
                    checked={!isUnused}
                    onChange={() => toggleUnused(idx)}
                  />
                  Usar este MPPT
                </label>
              </div>

              {isUnused ? (
                <p className="muted strings-card__unused-note">Este MPPT não será utilizado nesta instalação.</p>
              ) : (
                <>
                  {lim && (
                    <div className="strings-card__limits">
                      <span>
                        Série permitida: <strong>{lim.min_series}–{lim.max_series}</strong>
                      </span>
                      <span>
                        Strings máx.: <strong>{lim.max_strings}</strong>
                      </span>
                      <span className="muted">Limitante: {lim.limiting_factor}</span>
                    </div>
                  )}

                  <div className="strings-card__inputs">
                    <div className="field">
                      <label htmlFor={`series-${idx}`}>Módulos em série</label>
                      <input
                        id={`series-${idx}`}
                        type="number"
                        className={`input ${entry.series ? (seriesOk ? 'input--ok' : 'input--error') : ''}`}
                        value={entry.series || ''}
                        min={0}
                        onChange={(e) => updateEntry(idx, 'series', Number(e.target.value))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`strings-${idx}`}>Strings</label>
                      <input
                        id={`strings-${idx}`}
                        type="number"
                        className={`input ${entry.strings ? (stringsOk ? 'input--ok' : 'input--error') : ''}`}
                        value={entry.strings || ''}
                        min={0}
                        onChange={(e) => updateEntry(idx, 'strings', Number(e.target.value))}
                      />
                    </div>
                  </div>

                  {entry.series > 0 && entry.strings > 0 && (
                    <p className="strings-card__kwp muted">
                      {fmt2((entry.series * entry.strings * module.pnom) / 1000)} kWp neste MPPT
                    </p>
                  )}

                  {lim && (!seriesOk || !stringsOk) && entry.series > 0 && entry.strings > 0 && (
                    <div className="alert alert--warning strings-card__warning">
                      <div>
                        <strong>Fora dos limites recomendados:</strong>
                        <ul className="strings-card__warning-list">
                          {explainStringsIssue(entry, lim, inverter).map((reason, i) => (
                            <li key={i}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="step-actions step-actions--split">
        <button type="button" className="btn btn--outline" onClick={onBack}>
          ← Voltar
        </button>
        <button type="button" className="btn btn--primary" onClick={onNext} disabled={!allFilled}>
          Ver resultado →
        </button>
      </div>
    </div>
  )
}
