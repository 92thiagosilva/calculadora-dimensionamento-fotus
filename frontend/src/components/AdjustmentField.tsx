import './AdjustmentField.css'

interface AdjustmentFieldProps {
  label: string
  hint?: string
  unit: string
  value: number | null
  onChange: (value: number | null) => void
  min: number
  max: number
  step: number
  /** Quando true, o campo sempre tem um valor (nunca "herdar") — usado no formulário global. */
  alwaysSet?: boolean
  /** Rótulo do estado "sem ajuste" — por padrão "Usar cadastrado"/"Usar global". */
  defaultLabel?: string
}

/**
 * Campo de ajuste numérico com um checkbox "definir valor customizado".
 * Quando desmarcado, `value` é `null` (herda o padrão — global ou
 * cadastrado, dependendo do contexto).
 */
export function AdjustmentField({
  label,
  hint,
  unit,
  value,
  onChange,
  min,
  max,
  step,
  alwaysSet = false,
  defaultLabel = 'Usar padrão',
}: AdjustmentFieldProps) {
  const isSet = alwaysSet || value !== null

  return (
    <div className="adjustment-field">
      <div className="adjustment-field__header">
        <label>{label}</label>
        {!alwaysSet && (
          <label className="adjustment-field__toggle">
            <input
              type="checkbox"
              checked={isSet}
              onChange={(e) => onChange(e.target.checked ? 0 : null)}
            />
            Definir valor customizado
          </label>
        )}
      </div>
      {hint && <p className="adjustment-field__hint muted">{hint}</p>}
      {isSet ? (
        <div className="input-unit">
          <input
            type="number"
            className="input"
            value={value ?? 0}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className="input-unit__suffix">{unit}</span>
        </div>
      ) : (
        <p className="adjustment-field__default muted">{defaultLabel}</p>
      )}
    </div>
  )
}
