import type { ReactNode } from 'react'
import './Badge.css'

export type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral' | 'brand'

interface BadgeProps {
  tone: BadgeTone
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Badge({ tone, children, size = 'md' }: BadgeProps) {
  return <span className={`badge badge--${tone} badge--${size}`}>{children}</span>
}

/** Traduz um badge de status vindo da API ("OK"/"Verificar"/"Aprovado"/"Aprovado com ressalva"/"Reprovado") em tom visual. */
export function toneFromStatus(status: string): BadgeTone {
  const s = status.toLowerCase()
  if (s === 'ok' || s === 'aprovado' || s === 'match') return 'success'
  if (s === 'reprovado' || s === 'mismatch') return 'danger'
  if (s === 'verificar' || s === 'aprovado com ressalva') return 'warning'
  return 'neutral'
}
