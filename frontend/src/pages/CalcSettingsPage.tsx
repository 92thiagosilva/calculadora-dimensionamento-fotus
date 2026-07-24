import { useEffect, useMemo, useState } from 'react'
import {
  deleteInverterCalcOverride,
  getCalcSettingsGlobal,
  listInverterCalcSettings,
  putCalcSettingsGlobal,
  putInverterCalcOverride,
} from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type { CalcSettingsGlobalOut, CalcSettingsIn, InverterCalcSettingsRow } from '../types/api'
import { Spinner } from '../components/Spinner'
import { ErrorAlert } from '../components/ErrorAlert'
import { Modal } from '../components/Modal'
import { AdjustmentField } from '../components/AdjustmentField'
import './CalcSettingsPage.css'

function fmt(n: number | null, digits = 1): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function overloadPct(pMaxCc: number | null, pNom: number): number | null {
  if (pMaxCc == null || pNom <= 0) return null
  return (pMaxCc / pNom - 1) * 100
}

export function CalcSettingsPage() {
  return (
    <div className="calc-settings-page">
      <h1>Configurações de Cálculo</h1>
      <div className="alert alert--warning calc-settings-page__banner">
        <strong>Área restrita</strong> — estes ajustes mudam o resultado do dimensionamento para
        todo o time comercial. Cada aprovação que dependeu de um ajuste aparece como "Aprovado com
        ressalva", com o motivo explicado.
      </div>

      <GlobalSettingsCard />
      <InverterSettingsTable />
    </div>
  )
}

function GlobalSettingsCard() {
  const [settings, setSettings] = useState<CalcSettingsGlobalOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    getCalcSettingsGlobal()
      .then(setSettings)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const body: CalcSettingsIn = {
        overload_pct_override: settings.overload_pct_override,
        imax_tolerance_a: settings.imax_tolerance_a,
        isc_tolerance_a: settings.isc_tolerance_a,
        vmax_delta_v: settings.vmax_delta_v,
        vmpp_min_delta_v: settings.vmpp_min_delta_v,
        vmpp_max_delta_v: settings.vmpp_max_delta_v,
        dc_ac_ratio_min_pct_override: settings.dc_ac_ratio_min_pct_override,
      }
      const updated = await putCalcSettingsGlobal(body)
      setSettings(updated)
      setSavedAt(Date.now())
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Carregando configurações globais…" />
  if (!settings) return <ErrorAlert message={error} />

  return (
    <div className="card calc-settings-card">
      <h2 className="card__title">Padrão global (aplica a todos os inversores sem ajuste próprio)</h2>
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      <div className="calc-settings-grid">
        <AdjustmentField
          label="Sobrecarga"
          hint="Substitui a sobrecarga cadastrada (Pot. Máx. CC / Pot. Nom. CA - 1) por um valor fixo."
          unit="%"
          value={settings.overload_pct_override}
          onChange={(v) => setSettings({ ...settings, overload_pct_override: v })}
          min={0}
          max={100}
          step={1}
          defaultLabel="Usar sobrecarga cadastrada de cada inversor"
        />
        <AdjustmentField
          label="Potência mínima de entrada (CC/CA)"
          hint="Mínimo de potência DC dos módulos em relação à potência nominal CA do inversor."
          unit="%"
          value={settings.dc_ac_ratio_min_pct_override}
          onChange={(v) => setSettings({ ...settings, dc_ac_ratio_min_pct_override: v })}
          min={0}
          max={100}
          step={1}
          defaultLabel="Usar padrão de 70%"
        />
        <AdjustmentField
          label="Tolerância de I max"
          hint="Somada ao I max [A] de cada MPPT."
          unit="A"
          value={settings.imax_tolerance_a}
          onChange={(v) => setSettings({ ...settings, imax_tolerance_a: v ?? 0 })}
          min={0}
          max={10}
          step={0.5}
          alwaysSet
        />
        <AdjustmentField
          label="Tolerância de Isc max"
          hint="Somada ao Isc max [A] de cada MPPT."
          unit="A"
          value={settings.isc_tolerance_a}
          onChange={(v) => setSettings({ ...settings, isc_tolerance_a: v ?? 0 })}
          min={0}
          max={10}
          step={0.5}
          alwaysSet
        />
        <AdjustmentField
          label="Ajuste de V max"
          hint="Somado (pode ser negativo) ao V max [V] cadastrado."
          unit="V"
          value={settings.vmax_delta_v}
          onChange={(v) => setSettings({ ...settings, vmax_delta_v: v ?? 0 })}
          min={-500}
          max={500}
          step={50}
          alwaysSet
        />
        <AdjustmentField
          label="Ajuste de V MPP min"
          hint="Somado (pode ser negativo) ao V MPP min [V] cadastrado."
          unit="V"
          value={settings.vmpp_min_delta_v}
          onChange={(v) => setSettings({ ...settings, vmpp_min_delta_v: v ?? 0 })}
          min={-500}
          max={500}
          step={50}
          alwaysSet
        />
        <AdjustmentField
          label="Ajuste de V MPP max"
          hint="Somado (pode ser negativo) ao V MPP max [V] cadastrado."
          unit="V"
          value={settings.vmpp_max_delta_v}
          onChange={(v) => setSettings({ ...settings, vmpp_max_delta_v: v ?? 0 })}
          min={-500}
          max={500}
          step={50}
          alwaysSet
        />
      </div>

      <div className="calc-settings-card__footer">
        {savedAt && !saving && <span className="muted">Salvo.</span>}
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar padrão global'}
        </button>
      </div>
    </div>
  )
}

function InverterSettingsTable() {
  const [rows, setRows] = useState<InverterCalcSettingsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<InverterCalcSettingsRow | null>(null)

  function reload() {
    setLoading(true)
    setError(null)
    listInverterCalcSettings()
      .then(setRows)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((r) => `${r.brand} ${r.model}`.toLowerCase().includes(term))
  }, [rows, search])

  return (
    <div className="card calc-settings-card">
      <h2 className="card__title">Ajustes por inversor</h2>
      <input
        type="text"
        className="input"
        placeholder="Buscar inversor…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      {loading ? (
        <Spinner label="Carregando inversores…" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Sobrecarga cadastrada</th>
                <th>I max / MPPT</th>
                <th>V max</th>
                <th>V MPP min–max</th>
                <th>Ajuste próprio?</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const hasOverride = r.override != null
                return (
                  <tr key={r.inverter_id}>
                    <td>{r.brand}</td>
                    <td>{r.model}</td>
                    <td>{fmt(overloadPct(r.p_max_cc, r.p_nom), 0)}%</td>
                    <td>{r.mppt_currents.map((c) => fmt(c.imax)).join(' / ')} A</td>
                    <td>{fmt(r.v_max, 0)} V</td>
                    <td>
                      {fmt(r.v_mpp_min, 0)}–{fmt(r.v_mpp_max, 0)} V
                    </td>
                    <td>
                      {hasOverride ? (
                        <span className="badge badge--warning badge--sm">Customizado</span>
                      ) : (
                        <span className="muted">Usa global</span>
                      )}
                    </td>
                    <td className="bd-tab__row-actions">
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        onClick={() => setEditing(r)}
                      >
                        Ajustar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty-state">Nenhum inversor encontrado.</div>}
        </div>
      )}

      {editing && (
        <Modal title={`Ajustar ${editing.brand} ${editing.model}`} onClose={() => setEditing(null)}>
          <InverterOverrideForm
            row={editing}
            onSaved={() => {
              setEditing(null)
              reload()
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  )
}

function InverterOverrideForm({
  row,
  onSaved,
  onCancel,
}: {
  row: InverterCalcSettingsRow
  onSaved: () => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<CalcSettingsIn>({
    overload_pct_override: row.override?.overload_pct_override ?? null,
    imax_tolerance_a: row.override?.imax_tolerance_a ?? null,
    isc_tolerance_a: row.override?.isc_tolerance_a ?? null,
    vmax_delta_v: row.override?.vmax_delta_v ?? null,
    vmpp_min_delta_v: row.override?.vmpp_min_delta_v ?? null,
    vmpp_max_delta_v: row.override?.vmpp_max_delta_v ?? null,
    dc_ac_ratio_min_pct_override: row.override?.dc_ac_ratio_min_pct_override ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await putInverterCalcOverride(row.inverter_id, values)
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    setError(null)
    try {
      await deleteInverterCalcOverride(row.inverter_id)
      onSaved()
    } catch (err) {
      // 404 aqui so significa que nao havia override — tudo bem, so recarrega
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bd-form">
      <p className="muted">
        Campos não marcados usam o padrão global. Cadastrado: sobrecarga{' '}
        {fmt(overloadPct(row.p_max_cc, row.p_nom), 0)}%, I max {row.mppt_currents.map((c) => fmt(c.imax)).join('/')} A,
        V max {fmt(row.v_max, 0)} V, V MPP {fmt(row.v_mpp_min, 0)}–{fmt(row.v_mpp_max, 0)} V.
      </p>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      <div className="calc-settings-grid">
        <AdjustmentField
          label="Sobrecarga"
          unit="%"
          value={values.overload_pct_override ?? null}
          onChange={(v) => setValues({ ...values, overload_pct_override: v })}
          min={0}
          max={100}
          step={1}
          defaultLabel="Usar padrão global"
        />
        <AdjustmentField
          label="Potência mínima de entrada (CC/CA)"
          unit="%"
          value={values.dc_ac_ratio_min_pct_override ?? null}
          onChange={(v) => setValues({ ...values, dc_ac_ratio_min_pct_override: v })}
          min={0}
          max={100}
          step={1}
          defaultLabel="Usar padrão global"
        />
        <AdjustmentField
          label="Tolerância de I max"
          unit="A"
          value={values.imax_tolerance_a ?? null}
          onChange={(v) => setValues({ ...values, imax_tolerance_a: v })}
          min={0}
          max={10}
          step={0.5}
          defaultLabel="Usar padrão global"
        />
        <AdjustmentField
          label="Tolerância de Isc max"
          unit="A"
          value={values.isc_tolerance_a ?? null}
          onChange={(v) => setValues({ ...values, isc_tolerance_a: v })}
          min={0}
          max={10}
          step={0.5}
          defaultLabel="Usar padrão global"
        />
        <AdjustmentField
          label="Ajuste de V max"
          unit="V"
          value={values.vmax_delta_v ?? null}
          onChange={(v) => setValues({ ...values, vmax_delta_v: v })}
          min={-500}
          max={500}
          step={50}
          defaultLabel="Usar padrão global"
        />
        <AdjustmentField
          label="Ajuste de V MPP min"
          unit="V"
          value={values.vmpp_min_delta_v ?? null}
          onChange={(v) => setValues({ ...values, vmpp_min_delta_v: v })}
          min={-500}
          max={500}
          step={50}
          defaultLabel="Usar padrão global"
        />
        <AdjustmentField
          label="Ajuste de V MPP max"
          unit="V"
          value={values.vmpp_max_delta_v ?? null}
          onChange={(v) => setValues({ ...values, vmpp_max_delta_v: v })}
          min={-500}
          max={500}
          step={50}
          defaultLabel="Usar padrão global"
        />
      </div>

      <div className="bd-form__actions">
        <button type="button" className="btn btn--outline" onClick={handleClear} disabled={saving}>
          Remover ajustes (usar global)
        </button>
        <button type="button" className="btn btn--outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
