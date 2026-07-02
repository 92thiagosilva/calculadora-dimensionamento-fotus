interface ErrorAlertProps {
  message: string | null
  onDismiss?: () => void
}

export function ErrorAlert({ message, onDismiss }: ErrorAlertProps) {
  if (!message) return null
  return (
    <div className="alert alert--danger" role="alert">
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onDismiss}
          aria-label="Fechar aviso"
        >
          ✕
        </button>
      )}
    </div>
  )
}
