import { useEffect, useMemo, useState } from 'react'
import { getModules } from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type { Module } from '../types/api'
import { Spinner } from './Spinner'
import { ErrorAlert } from './ErrorAlert'
import { MODULE_POWER_RANGES } from '../utils/powerRanges'
import './Picker.css'

interface ModulePickerProps {
  selectedId?: number | null
  onSelect: (module: Module) => void
  /** Permite selecao multipla (usado no Comparativo de Área). */
  multiple?: boolean
  selectedIds?: number[]
  onToggle?: (module: Module) => void
}

export function ModulePicker({
  selectedId,
  onSelect,
  multiple = false,
  selectedIds = [],
  onToggle,
}: ModulePickerProps) {
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('')
  const [powerRangeKey, setPowerRangeKey] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getModules()
      .then((data) => {
        if (!cancelled) setModules(data)
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const brands = useMemo(
    () => Array.from(new Set(modules.map((m) => m.brand))).sort(),
    [modules],
  )

  const powerRange = useMemo(
    () => MODULE_POWER_RANGES.find((r) => r.key === powerRangeKey) ?? MODULE_POWER_RANGES[0],
    [powerRangeKey],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return modules.filter((m) => {
      if (brand && m.brand !== brand) return false
      if (powerRange.min != null && m.pnom < powerRange.min) return false
      if (powerRange.max != null && m.pnom > powerRange.max) return false
      if (!term) return true
      return m.label.toLowerCase().includes(term)
    })
  }, [modules, search, brand, powerRange])

  if (loading) return <Spinner label="Carregando módulos…" />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="picker">
      <div className="picker__filters">
        <input
          type="text"
          className="input"
          placeholder="Buscar módulo por marca ou modelo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select"
          value={powerRangeKey}
          onChange={(e) => setPowerRangeKey(e.target.value)}
        >
          {MODULE_POWER_RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">Todas as marcas</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">Nenhum módulo encontrado.</div>
      ) : (
        <div className="picker__grid">
          {filtered.map((m) => {
            const isSelected = multiple
              ? selectedIds.includes(m.module_id)
              : selectedId === m.module_id
            return (
              <button
                type="button"
                key={m.module_id}
                className={`picker__card ${isSelected ? 'picker__card--selected' : ''}`}
                onClick={() => (multiple ? onToggle?.(m) : onSelect(m))}
              >
                <div className="picker__card-header">
                  <div className="picker__card-title">
                    <strong>{m.brand}</strong>
                    <span className="muted">{m.model}</span>
                  </div>
                  <span className="picker__power-badge">
                    {m.pnom}
                    <small>Wp</small>
                  </span>
                </div>
                <div className="picker__tags">
                  <span className="tag">Voc {m.voc} V</span>
                  <span className="tag">Vmp {m.vmp} V</span>
                  <span className="tag">Isc {m.isc} A</span>
                  <span className="tag">Imp {m.imp} A</span>
                  {m.efic != null && <span className="tag">{(m.efic * 100).toFixed(2)}%</span>}
                </div>
                {isSelected && <span className="picker__check">✓ Selecionado</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
