import { useState } from 'react'
import type { FormEvent } from 'react'
import { compareMismatch } from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type { MismatchResponse, Module } from '../types/api'
import { ModulePicker } from '../components/ModulePicker'
import { Spinner } from '../components/Spinner'
import { ErrorAlert } from '../components/ErrorAlert'
import { toneFromStatus } from '../components/Badge'
import './MismatchPage.css'

function fmt(n: number, digits = 2): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** `pct` vem da API como fração (0.0038 = 0,38%) — nunca já em "por cento". */
function DeltaCheck({ pct }: { pct: number }) {
  const percent = pct * 100
  const ok = Math.abs(percent) <= 3
  return (
    <span className={`delta-check ${ok ? 'delta-check--ok' : 'delta-check--bad'}`}>
      {ok ? '✓' : '✕'} {fmt(percent)}%
    </span>
  )
}

export function MismatchPage() {
  const [original, setOriginal] = useState<Module | null>(null)
  const [substituto, setSubstituto] = useState<Module | null>(null)
  const [result, setResult] = useState<MismatchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!original || !substituto) {
      setError('Selecione o módulo original e o substituto.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await compareMismatch({
        original_module_id: original.module_id,
        substituto_module_id: substituto.module_id,
      })
      setResult(res)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mismatch-page">
      <h1>Mismatch de Módulos</h1>
      <p className="muted">
        Compare um módulo original com um substituto para avaliar se a troca é segura
        eletricamente (Voc, Vmp, Imp corrigidos e demais parâmetros).
      </p>

      <div className="mismatch-pickers">
        <div className="card">
          <h2>Módulo original</h2>
          <ModulePicker selectedId={original?.module_id ?? null} onSelect={setOriginal} />
        </div>
        <div className="card">
          <h2>Módulo substituto</h2>
          <ModulePicker selectedId={substituto?.module_id ?? null} onSelect={setSubstituto} />
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <button type="submit" className="btn btn--primary" disabled={loading || !original || !substituto}>
          {loading ? 'Comparando…' : 'Comparar módulos'}
        </button>
      </form>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      {loading && <Spinner label="Comparando módulos…" />}

      {result && (
        <div className="mismatch-result">
          <div className={`verdict-banner verdict-banner--${toneFromStatus(result.veredito)}`}>
            <span className="verdict-banner__label">{result.veredito}</span>
            <span className="verdict-banner__subtitle">
              {result.original_label} → {result.substituto_label}
            </span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Parâmetro</th>
                  <th>Original</th>
                  <th>Substituto</th>
                  <th>Delta %</th>
                </tr>
              </thead>
              <tbody>
                {result.params.map((p) => (
                  <tr key={p.label}>
                    <td>{p.label}</td>
                    <td>{fmt(p.original)}</td>
                    <td>{fmt(p.substituto)}</td>
                    <td>{fmt(p.delta_pct * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Valores corrigidos (comparação crítica)</h3>
          <div className="corrected-grid">
            <div className="card corrected-card">
              <span className="corrected-card__label">Voc máx.</span>
              <div className="corrected-card__values">
                <span>{fmt(result.voc_max_original)} V</span>
                <span>→</span>
                <span>{fmt(result.voc_max_substituto)} V</span>
              </div>
              <DeltaCheck pct={result.voc_max_delta_pct} />
            </div>
            <div className="card corrected-card">
              <span className="corrected-card__label">Vmp mín.</span>
              <div className="corrected-card__values">
                <span>{fmt(result.vmp_min_original)} V</span>
                <span>→</span>
                <span>{fmt(result.vmp_min_substituto)} V</span>
              </div>
              <DeltaCheck pct={result.vmp_min_delta_pct} />
            </div>
            <div className="card corrected-card">
              <span className="corrected-card__label">Imp máx.</span>
              <div className="corrected-card__values">
                <span>{fmt(result.imp_max_original)} A</span>
                <span>→</span>
                <span>{fmt(result.imp_max_substituto)} A</span>
              </div>
              <DeltaCheck pct={result.imp_max_delta_pct} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
