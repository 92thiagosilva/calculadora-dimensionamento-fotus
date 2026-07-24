import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { getBrands, getInverters, getModules, suggestKit } from '../../api/endpoints'
import { extractErrorMessage } from '../../api/client'
import type { BrandsOut, Inverter, KitSuggestion, Module } from '../../types/api'
import { Spinner } from '../../components/Spinner'
import { ErrorAlert } from '../../components/ErrorAlert'
import { Badge, toneFromStatus } from '../../components/Badge'
import './SuggestionMode.css'

interface SuggestionModeProps {
  tMin: number
  tMax: number
  onUseKit: (s: KitSuggestion) => void
}

type TargetMode = 'kwp' | 'inverter_kw'
type SortOrder = 'relevance' | 'kwp_asc' | 'kwp_desc'

// Pede o maximo de opcoes ao backend — o objetivo e mostrar toda a faixa
// valida (70% da potencia nominal ate o overload maximo do inversor),
// nao so as "melhores" segundo um criterio unico.
const MAX_SUGGESTIONS = 500

export function SuggestionMode({ tMin, tMax, onUseKit }: SuggestionModeProps) {
  const [brands, setBrands] = useState<BrandsOut | null>(null)
  const [modulesById, setModulesById] = useState<Map<number, Module>>(new Map())
  const [invertersById, setInvertersById] = useState<Map<number, Inverter>>(new Map())
  const [targetMode, setTargetMode] = useState<TargetMode>('kwp')
  const [targetValue, setTargetValue] = useState<string>('10')
  const [moduleBrand, setModuleBrand] = useState('')
  const [inverterBrand, setInverterBrand] = useState('')
  const [inverterPhase, setInverterPhase] = useState('')

  const [suggestions, setSuggestions] = useState<KitSuggestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<SortOrder>('kwp_asc')

  const sortedSuggestions = useMemo(() => {
    if (!suggestions) return suggestions
    if (sortOrder === 'relevance') return suggestions
    const sorted = [...suggestions]
    sorted.sort((a, b) =>
      sortOrder === 'kwp_asc'
        ? a.validation.total_kwp - b.validation.total_kwp
        : b.validation.total_kwp - a.validation.total_kwp,
    )
    return sorted
  }, [suggestions, sortOrder])

  useEffect(() => {
    getBrands()
      .then(setBrands)
      .catch(() => {
        // filtros de marca ficam vazios se falhar; nao bloqueia o fluxo
      })
    getModules()
      .then((mods) => setModulesById(new Map(mods.map((m) => [m.module_id, m]))))
      .catch(() => {})
    getInverters()
      .then((invs) => setInvertersById(new Map(invs.map((i) => [i.inverter_id, i]))))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(targetValue)
    if (!value || value <= 0) {
      setError('Informe um valor de meta maior que zero.')
      return
    }
    setLoading(true)
    setError(null)
    setSuggestions(null)
    try {
      const body = {
        t_min: tMin,
        t_max: tMax,
        module_brand: moduleBrand || undefined,
        inverter_brand: inverterBrand || undefined,
        inverter_phase: inverterPhase || undefined,
        max_suggestions: MAX_SUGGESTIONS,
        ...(targetMode === 'kwp' ? { target_kwp: value } : { target_inverter_kw: value }),
      }
      const res = await suggestKit(body)
      setSuggestions(res.suggestions)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="suggestion-mode">
      <form className="suggestion-form" onSubmit={handleSubmit}>
        <div className="mode-toggle">
          <button
            type="button"
            className={`mode-toggle__btn ${targetMode === 'kwp' ? 'active' : ''}`}
            onClick={() => setTargetMode('kwp')}
          >
            Meta em kWp
          </button>
          <button
            type="button"
            className={`mode-toggle__btn ${targetMode === 'inverter_kw' ? 'active' : ''}`}
            onClick={() => setTargetMode('inverter_kw')}
          >
            Meta em kW do inversor
          </button>
        </div>

        <div className="suggestion-form__row">
          <div className="field">
            <label htmlFor="target-value">
              {targetMode === 'kwp' ? 'kWp desejado' : 'Potência do inversor (kW)'}
            </label>
            <input
              id="target-value"
              type="number"
              className="input"
              value={targetValue}
              min={0}
              step="0.1"
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="module-brand">Marca do módulo (opcional)</label>
            <select
              id="module-brand"
              className="select"
              value={moduleBrand}
              onChange={(e) => setModuleBrand(e.target.value)}
            >
              <option value="">Qualquer marca</option>
              {brands?.module_brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="inverter-brand">Marca do inversor (opcional)</label>
            <select
              id="inverter-brand"
              className="select"
              value={inverterBrand}
              onChange={(e) => setInverterBrand(e.target.value)}
            >
              <option value="">Qualquer marca</option>
              {brands?.inverter_brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="inverter-phase">Fase (opcional)</label>
            <select
              id="inverter-phase"
              className="select"
              value={inverterPhase}
              onChange={(e) => setInverterPhase(e.target.value)}
            >
              <option value="">Qualquer</option>
              <option value="Monofásico">Monofásico</option>
              <option value="Bifásico">Bifásico</option>
              <option value="Trifásico">Trifásico</option>
            </select>
          </div>
        </div>

        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? 'Buscando kits…' : 'Buscar sugestões'}
        </button>
      </form>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      {loading && <Spinner label="Buscando as melhores combinações…" />}

      {suggestions && suggestions.length === 0 && (
        <div className="empty-state">Nenhuma sugestão encontrada para os critérios informados.</div>
      )}

      {sortedSuggestions && sortedSuggestions.length > 0 && (
        <>
          <div className="suggestion-toolbar">
            <p className="muted suggestion-count">
              {sortedSuggestions.length} opções encontradas — de 70% até o overload máximo de cada inversor.
            </p>
            <div className="field suggestion-toolbar__sort">
              <label htmlFor="sort-order">Ordenar por</label>
              <select
                id="sort-order"
                className="select"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              >
                <option value="kwp_asc">Potência: menor → maior</option>
                <option value="kwp_desc">Potência: maior → menor</option>
                <option value="relevance">Relevância (padrão)</option>
              </select>
            </div>
          </div>
          <div className="suggestion-list">
            {sortedSuggestions.map((s, idx) => {
              const tone = toneFromStatus(s.validation.overall_badge)
              const mod = modulesById.get(s.module_id)
              const inv = invertersById.get(s.inverter_id)
              return (
                <div key={idx} className="card suggestion-card">
                  <div className="suggestion-card__header">
                    <Badge tone={tone}>{s.validation.overall_badge}</Badge>
                    <span className="suggestion-card__kwp">
                      {s.validation.total_kwp.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      kWp
                    </span>
                  </div>
                  <div className="suggestion-card__kit">
                    <p>
                      <strong>Módulo:</strong> {mod ? `${mod.brand} ${mod.model} (${mod.pnom} Wp)` : `#${s.module_id}`}
                    </p>
                    <p>
                      <strong>Inversor:</strong>{' '}
                      {inv
                        ? `${inv.brand} ${inv.model} (${(inv.p_nom / 1000).toLocaleString('pt-BR')} kW)`
                        : `#${s.inverter_id}`}
                    </p>
                  </div>
                  <div className="suggestion-card__stats">
                    <span>{s.validation.total_mods} módulos</span>
                    <span>ratio CC/CA {s.validation.ratio_cc_ca.toFixed(0)}%</span>
                  </div>
                  {s.validation.ressalva_reasons && s.validation.ressalva_reasons.length > 0 && (
                    <div className="alert alert--warning suggestion-card__ressalva">
                      <strong>Aprovado com ressalva:</strong>
                      <ul className="suggestion-card__ressalva-list">
                        {s.validation.ressalva_reasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => onUseKit(s)}
                  >
                    Usar este kit →
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
