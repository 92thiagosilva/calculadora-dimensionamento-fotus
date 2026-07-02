import './Stepper.css'

interface StepperProps {
  steps: string[]
  current: number
  onStepClick?: (index: number) => void
  maxReached: number
}

export function Stepper({ steps, current, onStepClick, maxReached }: StepperProps) {
  return (
    <ol className="stepper">
      {steps.map((label, idx) => {
        const isDone = idx < current
        const isActive = idx === current
        const isClickable = idx <= maxReached && onStepClick
        return (
          <li
            key={label}
            className={`stepper__item ${isActive ? 'stepper__item--active' : ''} ${
              isDone ? 'stepper__item--done' : ''
            } ${isClickable ? 'stepper__item--clickable' : ''}`}
            onClick={() => isClickable && onStepClick?.(idx)}
          >
            <span className="stepper__index">{isDone ? '✓' : idx + 1}</span>
            <span className="stepper__label">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
