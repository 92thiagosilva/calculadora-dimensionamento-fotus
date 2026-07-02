import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Inverter, InverterIn, MpptCurrents } from '../../types/api'

interface InverterFormProps {
  initial?: Inverter | null
  onSubmit: (data: InverterIn) => Promise<void>
  onCancel: () => void
}

function emptyForm(): InverterIn {
  return {
    brand: '',
    model: '',
    categoria: null,
    p_nom: 0,
    p_max_cc: null,
    v_max: null,
    v_mpp_min: null,
    v_mpp_max: null,
    num_mppt: 1,
    num_inputs: null,
    mppt_currents: [{ imax: 0, isc: 0 }],
    lin_max: [0],
    tensao: null,
    fase: null,
    protection: null,
  }
}

export function InverterForm({ initial, onSubmit, onCancel }: InverterFormProps) {
  const [form, setForm] = useState<InverterIn>(
    initial
      ? {
          brand: initial.brand,
          model: initial.model,
          categoria: initial.categoria,
          p_nom: initial.p_nom,
          p_max_cc: initial.p_max_cc,
          v_max: initial.v_max,
          v_mpp_min: initial.v_mpp_min,
          v_mpp_max: initial.v_mpp_max,
          num_mppt: initial.num_mppt,
          num_inputs: initial.num_inputs,
          mppt_currents: initial.mppt_currents.length
            ? initial.mppt_currents
            : [{ imax: 0, isc: 0 }],
          lin_max: initial.lin_max.length ? initial.lin_max : [0],
          tensao: initial.tensao,
          fase: initial.fase,
          protection: initial.protection,
        }
      : emptyForm(),
  )
  const [submitting, setSubmitting] = useState(false)

  function setField<K extends keyof InverterIn>(key: K, value: InverterIn[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addMpptRow() {
    setForm((f) => ({
      ...f,
      mppt_currents: [...f.mppt_currents, { imax: 0, isc: 0 }],
      lin_max: [...f.lin_max, 0],
    }))
  }

  function removeMpptRow(idx: number) {
    setForm((f) => ({
      ...f,
      mppt_currents: f.mppt_currents.filter((_, i) => i !== idx),
      lin_max: f.lin_max.filter((_, i) => i !== idx),
    }))
  }

  function updateMpptCurrent(idx: number, field: keyof MpptCurrents, value: number) {
    setForm((f) => ({
      ...f,
      mppt_currents: f.mppt_currents.map((c, i) => (i === idx ? { ...c, [field]: value } : c)),
    }))
  }

  function updateLinMax(idx: number, value: number) {
    setForm((f) => ({
      ...f,
      lin_max: f.lin_max.map((v, i) => (i === idx ? value : v)),
    }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit(form)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="bd-form" onSubmit={handleSubmit}>
      <div className="bd-form__grid">
        <div className="field">
          <label htmlFor="i-brand">Marca</label>
          <input
            id="i-brand"
            className="input"
            required
            value={form.brand}
            onChange={(e) => setField('brand', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="i-model">Modelo</label>
          <input
            id="i-model"
            className="input"
            required
            value={form.model}
            onChange={(e) => setField('model', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="i-categoria">Categoria</label>
          <input
            id="i-categoria"
            className="input"
            value={form.categoria ?? ''}
            onChange={(e) => setField('categoria', e.target.value || null)}
          />
        </div>
        <div className="field">
          <label htmlFor="i-pnom">P nominal (W)</label>
          <input
            id="i-pnom"
            type="number"
            step="any"
            className="input"
            required
            value={form.p_nom}
            onChange={(e) => setField('p_nom', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="i-pmaxcc">P máx. CC (W)</label>
          <input
            id="i-pmaxcc"
            type="number"
            step="any"
            className="input"
            value={form.p_max_cc ?? ''}
            onChange={(e) => setField('p_max_cc', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="i-vmax">V máx. (V)</label>
          <input
            id="i-vmax"
            type="number"
            step="any"
            className="input"
            value={form.v_max ?? ''}
            onChange={(e) => setField('v_max', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="i-vmppmin">V MPP mín. (V)</label>
          <input
            id="i-vmppmin"
            type="number"
            step="any"
            className="input"
            value={form.v_mpp_min ?? ''}
            onChange={(e) => setField('v_mpp_min', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="i-vmppmax">V MPP máx. (V)</label>
          <input
            id="i-vmppmax"
            type="number"
            step="any"
            className="input"
            value={form.v_mpp_max ?? ''}
            onChange={(e) => setField('v_mpp_max', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="i-nummppt">Número de MPPTs</label>
          <input
            id="i-nummppt"
            type="number"
            className="input"
            required
            min={1}
            value={form.num_mppt}
            onChange={(e) => setField('num_mppt', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="i-numinputs">Número de entradas</label>
          <input
            id="i-numinputs"
            type="number"
            className="input"
            value={form.num_inputs ?? ''}
            onChange={(e) => setField('num_inputs', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="i-tensao">Tensão (V CA)</label>
          <input
            id="i-tensao"
            type="number"
            step="any"
            className="input"
            value={form.tensao ?? ''}
            onChange={(e) => setField('tensao', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="i-fase">Fase</label>
          <select
            id="i-fase"
            className="select"
            value={form.fase ?? ''}
            onChange={(e) => setField('fase', e.target.value || null)}
          >
            <option value="">—</option>
            <option value="Monofásico">Monofásico</option>
            <option value="Bifásico">Bifásico</option>
            <option value="Trifásico">Trifásico</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="i-protection">Proteção</label>
          <input
            id="i-protection"
            className="input"
            value={form.protection ?? ''}
            onChange={(e) => setField('protection', e.target.value || null)}
          />
        </div>
      </div>

      <div className="bd-form__mppts">
        <div className="bd-form__mppts-header">
          <h3>Correntes por MPPT e Lin máx.</h3>
          <button type="button" className="btn btn--outline btn--sm" onClick={addMpptRow}>
            + Adicionar MPPT
          </button>
        </div>

        {form.mppt_currents.map((c, idx) => (
          <div key={idx} className="bd-form__mppt-row">
            <span className="bd-form__mppt-label">MPPT {idx + 1}</span>
            <div className="field">
              <label htmlFor={`mppt-imax-${idx}`}>Imax (A)</label>
              <input
                id={`mppt-imax-${idx}`}
                type="number"
                step="any"
                className="input"
                value={c.imax}
                onChange={(e) => updateMpptCurrent(idx, 'imax', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor={`mppt-isc-${idx}`}>Isc (A)</label>
              <input
                id={`mppt-isc-${idx}`}
                type="number"
                step="any"
                className="input"
                value={c.isc}
                onChange={(e) => updateMpptCurrent(idx, 'isc', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor={`mppt-linmax-${idx}`}>Lin máx.</label>
              <input
                id={`mppt-linmax-${idx}`}
                type="number"
                step="any"
                className="input"
                value={form.lin_max[idx] ?? 0}
                onChange={(e) => updateLinMax(idx, Number(e.target.value))}
              />
            </div>
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => removeMpptRow(idx)}
              disabled={form.mppt_currents.length <= 1}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <div className="bd-form__actions">
        <button type="button" className="btn btn--outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Salvando…' : 'Salvar inversor'}
        </button>
      </div>
    </form>
  )
}
