import { useEffect, useState } from 'react'
import { validateKit } from '../../api/endpoints'
import { extractErrorMessage } from '../../api/client'
import type { Inverter, Module, MpptConfigEntry, ValidateKitResponse } from '../../types/api'
import { Spinner } from '../../components/Spinner'
import { ErrorAlert } from '../../components/ErrorAlert'
import { ResultPanel } from '../../components/ResultPanel'

interface StepResultProps {
  module: Module
  inverter: Inverter
  tMin: number
  tMax: number
  mpptConfig: (MpptConfigEntry | null)[]
  onBack: () => void
  onRestart: () => void
}

export function StepResult({
  module,
  inverter,
  tMin,
  tMax,
  mpptConfig,
  onBack,
  onRestart,
}: StepResultProps) {
  const [result, setResult] = useState<ValidateKitResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    validateKit({
      inverter_id: inverter.inverter_id,
      module_id: module.module_id,
      t_min: tMin,
      t_max: tMax,
      mppt_config: mpptConfig,
    })
      .then((data) => {
        if (!cancelled) setResult(data)
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
  }, [module.module_id, inverter.inverter_id, tMin, tMax, mpptConfig])

  return (
    <div>
      <h2>5. Resultado</h2>

      {loading && <Spinner label="Validando kit…" size="lg" />}
      {error && <ErrorAlert message={error} />}
      {result && <ResultPanel result={result} module={module} inverter={inverter} />}

      <div className="step-actions step-actions--split" style={{ marginTop: '1.5rem' }}>
        <button type="button" className="btn btn--outline" onClick={onBack}>
          ← Ajustar strings
        </button>
        <button type="button" className="btn btn--secondary" onClick={onRestart}>
          Recomeçar
        </button>
      </div>
    </div>
  )
}
