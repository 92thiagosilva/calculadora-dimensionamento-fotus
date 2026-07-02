import { useEffect, useMemo, useState } from 'react'
import { getInverters } from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type { Inverter } from '../types/api'
import { Spinner } from './Spinner'
import { ErrorAlert } from './ErrorAlert'
import { INVERTER_POWER_RANGES } from '../utils/powerRanges'
import './Picker.css'

interface InverterPickerProps {
  selectedId?: number | null
  onSelect: (inverter: Inverter) => void
}

export function InverterPicker({ selectedId, onSelect }: InverterPickerProps) {
  const [inverters, setInverters] = useState<Inverter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('')
  const [powerRangeKey, setPowerRangeKey] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getInverters()
      .then((data) => {
        if (!cancelled) setInverters(data)
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
    () => Array.from(new Set(inverters.map((i) => i.brand))).sort(),
    [inverters],
  )

  const powerRange = useMemo(
    () => INVERTER_POWER_RANGES.find((r) => r.key === powerRangeKey) ?? INVERTER_POWER_RANGES[0],
    [powerRangeKey],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return inverters.filter((i) => {
      if (brand && i.brand !== brand) return false
      const kw = i.p_nom / 1000
      if (powerRange.min != null && kw < powerRange.min) return false
      if (powerRange.max != null && kw > powerRange.max) return false
      if (!term) return true
      return `${i.brand} ${i.model}`.toLowerCase().includes(term)
    })
  }, [inverters, search, brand, powerRange])

  if (loading) return <Spinner label="Carregando inversores…" />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="picker">
      <div className="picker__filters">
        <input
          type="text"
          className="input"
          placeholder="Buscar inversor por marca ou modelo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select"
          value={powerRangeKey}
          onChange={(e) => setPowerRangeKey(e.target.value)}
        >
          {INVERTER_POWER_RANGES.map((r) => (
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
        <div className="empty-state">Nenhum inversor encontrado.</div>
      ) : (
        <div className="picker__grid">
          {filtered.map((inv) => {
            const isSelected = selectedId === inv.inverter_id
            return (
              <button
                type="button"
                key={inv.inverter_id}
                className={`picker__card ${isSelected ? 'picker__card--selected' : ''}`}
                onClick={() => onSelect(inv)}
              >
                <div className="picker__card-header">
                  <div className="picker__card-title">
                    <strong>{inv.brand}</strong>
                    <span className="muted">{inv.model}</span>
                  </div>
                  <span className="picker__power-badge">
                    {(inv.p_nom / 1000).toFixed(1)}
                    <small>kW</small>
                  </span>
                </div>
                <div className="picker__tags">
                  <span className="tag">{inv.num_mppt} MPPT</span>
                  {inv.fase && <span className="tag">{inv.fase}</span>}
                  {inv.categoria && <span className="tag">{inv.categoria}</span>}
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
