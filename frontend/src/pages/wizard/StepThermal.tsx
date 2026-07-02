import { useEffect, useState } from 'react'
import { getRegions } from '../../api/endpoints'
import { extractErrorMessage } from '../../api/client'
import type { ThermalRegion } from '../../types/api'
import { Spinner } from '../../components/Spinner'
import { ErrorAlert } from '../../components/ErrorAlert'
import './StepThermal.css'

interface StepThermalProps {
  tMin: number
  tMax: number
  regionId: string | null
  onChange: (v: { tMin: number; tMax: number; regionId: string | null }) => void
  onNext: () => void
}

export function StepThermal({ tMin, tMax, regionId, onChange, onNext }: StepThermalProps) {
  const [regions, setRegions] = useState<ThermalRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [manualMode, setManualMode] = useState(false)

  useEffect(() => {
    getRegions()
      .then(setRegions)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner label="Carregando presets térmicos…" />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="step-thermal">
      <h2>1. Local térmico</h2>
      <p className="muted">
        Escolha um preset regional (temperatura mínima e máxima esperadas) ou informe manualmente.
        Esses valores corrigem as especificações do módulo para o pior caso térmico.
      </p>

      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-toggle__btn ${!manualMode ? 'active' : ''}`}
          onClick={() => setManualMode(false)}
        >
          Presets regionais
        </button>
        <button
          type="button"
          className={`mode-toggle__btn ${manualMode ? 'active' : ''}`}
          onClick={() => setManualMode(true)}
        >
          Informar manualmente
        </button>
      </div>

      {!manualMode ? (
        <div className="region-grid">
          {regions.map((r) => {
            const isSelected = regionId === r.region_id
            return (
              <button
                type="button"
                key={r.region_id}
                className={`region-chip ${isSelected ? 'region-chip--selected' : ''}`}
                onClick={() =>
                  onChange({ tMin: r.t_min, tMax: r.t_max, regionId: r.region_id })
                }
              >
                <span className="region-chip__label">
                  {r.label}
                  {r.is_default && <span className="region-chip__default"> (padrão)</span>}
                </span>
                <span className="region-chip__range">
                  {r.t_min}°C a {r.t_max}°C
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="manual-inputs">
          <div className="field">
            <label htmlFor="t-min">Temperatura mínima (°C)</label>
            <input
              id="t-min"
              type="number"
              className="input"
              value={tMin}
              onChange={(e) =>
                onChange({ tMin: Number(e.target.value), tMax, regionId: null })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="t-max">Temperatura máxima (°C)</label>
            <input
              id="t-max"
              type="number"
              className="input"
              value={tMax}
              onChange={(e) =>
                onChange({ tMin, tMax: Number(e.target.value), regionId: null })
              }
            />
          </div>
        </div>
      )}

      <div className="step-actions">
        <button type="button" className="btn btn--primary" onClick={onNext}>
          Continuar →
        </button>
      </div>
    </div>
  )
}
