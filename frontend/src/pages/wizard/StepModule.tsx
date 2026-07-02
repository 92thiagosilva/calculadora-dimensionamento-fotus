import { ModulePicker } from '../../components/ModulePicker'
import type { Module } from '../../types/api'

interface StepModuleProps {
  module: Module | null
  onSelect: (m: Module) => void
  onBack: () => void
  onNext: () => void
}

export function StepModule({ module, onSelect, onBack, onNext }: StepModuleProps) {
  return (
    <div>
      <h2>2. Módulo fotovoltaico</h2>
      <p className="muted">Selecione o módulo que será utilizado no kit.</p>

      <ModulePicker selectedId={module?.module_id ?? null} onSelect={onSelect} />

      <div className="step-actions step-actions--split">
        <button type="button" className="btn btn--outline" onClick={onBack}>
          ← Voltar
        </button>
        <button type="button" className="btn btn--primary" onClick={onNext} disabled={!module}>
          Continuar →
        </button>
      </div>
    </div>
  )
}
