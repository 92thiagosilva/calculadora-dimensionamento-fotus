import { InverterPicker } from '../../components/InverterPicker'
import type { Inverter } from '../../types/api'

interface StepInverterProps {
  inverter: Inverter | null
  onSelect: (i: Inverter) => void
  onBack: () => void
  onNext: () => void
}

export function StepInverter({ inverter, onSelect, onBack, onNext }: StepInverterProps) {
  return (
    <div>
      <h2>3. Inversor</h2>
      <p className="muted">Selecione o inversor que será utilizado no kit.</p>

      <InverterPicker selectedId={inverter?.inverter_id ?? null} onSelect={onSelect} />

      <div className="step-actions step-actions--split">
        <button type="button" className="btn btn--outline" onClick={onBack}>
          ← Voltar
        </button>
        <button type="button" className="btn btn--primary" onClick={onNext} disabled={!inverter}>
          Continuar →
        </button>
      </div>
    </div>
  )
}
