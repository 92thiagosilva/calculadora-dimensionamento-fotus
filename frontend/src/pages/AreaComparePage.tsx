import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { compareArea } from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type { AreaCompareResultRow, Module } from '../types/api'
import { ModulePicker } from '../components/ModulePicker'
import { Spinner } from '../components/Spinner'
import { ErrorAlert } from '../components/ErrorAlert'
import './AreaComparePage.css'

type SortKey = 'w_por_m2' | 'pnom' | 'area_m2' | 'peso_kg'

export function AreaComparePage() {
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [selectedModules, setSelectedModules] = useState<Map<number, Module>>(new Map())
  const [targetKwp, setTargetKwp] = useState('')
  const [areaUtil, setAreaUtil] = useState('')
  const [results, setResults] = useState<AreaCompareResultRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('w_por_m2')
  const [sortDesc, setSortDesc] = useState(true)

  function handleToggle(module: Module) {
    setSelectedIds((ids) =>
      ids.includes(module.module_id)
        ? ids.filter((id) => id !== module.module_id)
        : [...ids, module.module_id],
    )
    setSelectedModules((map) => {
      const next = new Map(map)
      if (next.has(module.module_id)) {
        next.delete(module.module_id)
      } else {
        next.set(module.module_id, module)
      }
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (selectedIds.length === 0) {
      setError('Selecione ao menos um módulo para comparar.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const kwp = targetKwp ? Number(targetKwp) : undefined
      const area = areaUtil ? Number(areaUtil) : undefined
      const res = await compareArea({
        module_ids: selectedIds,
        target_kwp: kwp,
        area_util_m2: area,
      })
      setResults(res.results)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d)
    } else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const sortedResults = useMemo(() => {
    if (!results) return null
    const copy = [...results]
    copy.sort((a, b) => {
      const diff = (a[sortKey] ?? 0) - (b[sortKey] ?? 0)
      return sortDesc ? -diff : diff
    })
    return copy
  }, [results, sortKey, sortDesc])

  const hasKwp = results?.some((r) => r.quantidade_kwp != null)
  const hasArea = results?.some((r) => r.quantidade_area != null)

  return (
    <div className="area-page">
      <h1>Comparativo de Área</h1>
      <p className="muted">
        Compare a densidade de potência (W/m²) entre diferentes módulos e estime quantos módulos
        cabem em uma área ou são necessários para atingir uma meta de kWp.
      </p>

      <div className="card">
        <h2>1. Selecione os módulos</h2>
        {selectedModules.size > 0 && (
          <div className="area-page__selected-chips">
            {Array.from(selectedModules.values()).map((m) => (
              <span key={m.module_id} className="tag">
                {m.brand} {m.model}
              </span>
            ))}
          </div>
        )}
        <ModulePicker
          multiple
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onSelect={() => {}}
        />
      </div>

      <form className="card area-form" onSubmit={handleSubmit}>
        <h2>2. Parâmetros (opcionais)</h2>
        <div className="area-form__row">
          <div className="field">
            <label htmlFor="target-kwp">kWp desejado</label>
            <input
              id="target-kwp"
              type="number"
              className="input"
              placeholder="ex: 10"
              value={targetKwp}
              onChange={(e) => setTargetKwp(e.target.value)}
            />
            <span className="hint">Calcula quantos módulos e área ocupada para atingir a meta.</span>
          </div>
          <div className="field">
            <label htmlFor="area-util">Área útil do telhado (m²)</label>
            <input
              id="area-util"
              type="number"
              className="input"
              placeholder="ex: 50"
              value={areaUtil}
              onChange={(e) => setAreaUtil(e.target.value)}
            />
            <span className="hint">Calcula quantos módulos cabem e o kWp atingido.</span>
          </div>
        </div>
        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? 'Calculando…' : 'Comparar'}
        </button>
      </form>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      {loading && <Spinner label="Comparando módulos…" />}

      {sortedResults && sortedResults.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Módulo</th>
                <th onClick={() => toggleSort('pnom')}>Potência (Wp)</th>
                <th onClick={() => toggleSort('w_por_m2')}>W/m² {sortKey === 'w_por_m2' ? (sortDesc ? '↓' : '↑') : ''}</th>
                <th onClick={() => toggleSort('area_m2')}>Área unitária (m²)</th>
                <th onClick={() => toggleSort('peso_kg')}>Peso (kg)</th>
                {hasKwp && (
                  <>
                    <th>Módulos p/ meta kWp</th>
                    <th>kWp atingido</th>
                    <th>Área ocupada (m²)</th>
                  </>
                )}
                {hasArea && (
                  <>
                    <th>Módulos na área</th>
                    <th>kWp atingido (área)</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((r) => (
                <tr key={r.module_id}>
                  <td>{r.label}</td>
                  <td>{r.pnom}</td>
                  <td>
                    <strong>{r.w_por_m2.toFixed(1)}</strong>
                  </td>
                  <td>{r.area_m2.toFixed(2)}</td>
                  <td>{r.peso_kg}</td>
                  {hasKwp && (
                    <>
                      <td>{r.quantidade_kwp ?? '—'}</td>
                      <td>{r.kwp_atingido != null ? r.kwp_atingido.toFixed(2) : '—'}</td>
                      <td>{r.area_ocupada_m2 != null ? r.area_ocupada_m2.toFixed(2) : '—'}</td>
                    </>
                  )}
                  {hasArea && (
                    <>
                      <td>{r.quantidade_area ?? '—'}</td>
                      <td>{r.kwp_atingido_area != null ? r.kwp_atingido_area.toFixed(2) : '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
