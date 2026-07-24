import type { Inverter, Module, ValidateKitResponse } from '../types/api'
import { Badge, toneFromStatus } from './Badge'
import './ResultPanel.css'

interface ResultPanelProps {
  result: ValidateKitResponse
  module: Module | null
  inverter: Inverter | null
}

function fmt(n: number, digits = 2): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function ResultPanel({ result, module, inverter }: ResultPanelProps) {
  const tone = toneFromStatus(result.overall_badge)
  const ressalvaReasons = result.ressalva_reasons ?? []

  return (
    <div className="result-panel">
      <div className={`result-banner result-banner--${tone}`}>
        <div className="result-banner__badge">{result.overall_badge}</div>
        <div className="result-banner__summary">
          {module && inverter && (
            <p className="result-banner__kit">
              {module.brand} {module.model} + {inverter.brand} {inverter.model}
            </p>
          )}
          <div className="result-banner__stats">
            <span>
              <strong>{result.total_mods}</strong> módulos
            </span>
            <span>
              <strong>{fmt(result.total_kwp)}</strong> kWp
            </span>
            <span>
              <strong>{fmt(result.ratio_cc_ca, 0)}%</strong> ratio CC/CA
            </span>
            <span>
              <strong>{fmt(result.overload_kw)}</strong> kW overload
            </span>
          </div>
        </div>
      </div>

      {result.wiring_note && (
        <div className="alert alert--danger result-note">
          <strong>Atenção: </strong>
          {result.wiring_note}
        </div>
      )}

      {result.dc_ac_ratio_note && (
        <div className="alert alert--danger result-note">
          <strong>Atenção: </strong>
          {result.dc_ac_ratio_note}
        </div>
      )}

      {ressalvaReasons.length > 0 && (
        <div className="alert alert--warning result-note">
          <strong>Aprovado com ressalva: </strong>
          <ul className="result-note__reasons">
            {ressalvaReasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="result-panel__section-title">Detalhamento por MPPT</h3>
      <div className="mppt-grid">
        {result.per_mppt.map((mppt) => {
          const mpptTone = toneFromStatus(mppt.badge)
          return (
            <div key={mppt.mppt_idx} className="card mppt-card">
              <div className="mppt-card__header">
                <span className="mppt-card__title">MPPT {mppt.mppt_idx + 1}</span>
                <Badge tone={mpptTone} size="sm">
                  {mppt.badge}
                </Badge>
              </div>

              <div className="mppt-card__config">
                <span>
                  {mppt.series} módulos em série × {mppt.strings} string(s)
                </span>
              </div>

              <table className="mppt-card__table">
                <tbody>
                  <tr>
                    <td>Faixa de série permitida</td>
                    <td>
                      {mppt.limits.min_series}–{mppt.limits.max_series}
                      {' '}
                      <StatusDot ok={mppt.series_ok} />
                    </td>
                  </tr>
                  <tr>
                    <td>Strings máx.</td>
                    <td>
                      {mppt.limits.max_strings} <StatusDot ok={mppt.strings_ok} />
                    </td>
                  </tr>
                  <tr>
                    <td>Voc arranjo</td>
                    <td>{fmt(mppt.voc_arranjo)} V</td>
                  </tr>
                  <tr>
                    <td>Vmp arranjo</td>
                    <td>{fmt(mppt.vmp_arranjo)} V</td>
                  </tr>
                  <tr>
                    <td>Imp arranjo</td>
                    <td>{fmt(mppt.imp_arranjo)} A</td>
                  </tr>
                  <tr>
                    <td>Fator limitante</td>
                    <td className="muted">{mppt.limits.limiting_factor}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`status-dot ${ok ? 'status-dot--ok' : 'status-dot--warn'}`} title={ok ? 'OK' : 'Verificar'}>
      {ok ? '✓' : '!'}
    </span>
  )
}
