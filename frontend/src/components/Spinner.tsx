interface SpinnerProps {
  label?: string
  size?: 'md' | 'lg'
}

export function Spinner({ label, size = 'md' }: SpinnerProps) {
  return (
    <div className="spinner-row">
      <span className={`spinner ${size === 'lg' ? 'spinner--lg' : ''}`} aria-hidden="true" />
      {label && <span>{label}</span>}
    </div>
  )
}
