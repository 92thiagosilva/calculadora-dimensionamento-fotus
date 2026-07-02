import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Module, ModuleIn } from '../../types/api'

interface ModuleFormProps {
  initial?: Module | null
  onSubmit: (data: ModuleIn) => Promise<void>
  onCancel: () => void
}

const emptyForm: ModuleIn = {
  brand: '',
  model: '',
  pnom: 0,
  isc: 0,
  voc: 0,
  imp: 0,
  vmp: 0,
  coef_v: 0,
  coef_i: 0,
  coef_pmp: 0,
  efic: null,
  altura_mm: 0,
  largura_mm: 0,
  espessura_mm: 0,
  peso_kg: 0,
}

export function ModuleForm({ initial, onSubmit, onCancel }: ModuleFormProps) {
  const [form, setForm] = useState<ModuleIn>(
    initial
      ? {
          brand: initial.brand,
          model: initial.model,
          pnom: initial.pnom,
          isc: initial.isc,
          voc: initial.voc,
          imp: initial.imp,
          vmp: initial.vmp,
          coef_v: initial.coef_v,
          coef_i: initial.coef_i,
          coef_pmp: initial.coef_pmp,
          efic: initial.efic,
          altura_mm: initial.altura_mm,
          largura_mm: initial.largura_mm,
          espessura_mm: initial.espessura_mm,
          peso_kg: initial.peso_kg,
        }
      : emptyForm,
  )
  const [submitting, setSubmitting] = useState(false)

  function setField<K extends keyof ModuleIn>(key: K, value: ModuleIn[K]) {
    setForm((f) => ({ ...f, [key]: value }))
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
          <label htmlFor="m-brand">Marca</label>
          <input
            id="m-brand"
            className="input"
            required
            value={form.brand}
            onChange={(e) => setField('brand', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="m-model">Modelo</label>
          <input
            id="m-model"
            className="input"
            required
            value={form.model}
            onChange={(e) => setField('model', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="m-pnom">Pnom (Wp)</label>
          <input
            id="m-pnom"
            type="number"
            step="any"
            className="input"
            required
            value={form.pnom}
            onChange={(e) => setField('pnom', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-isc">Isc (A)</label>
          <input
            id="m-isc"
            type="number"
            step="any"
            className="input"
            required
            value={form.isc}
            onChange={(e) => setField('isc', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-voc">Voc (V)</label>
          <input
            id="m-voc"
            type="number"
            step="any"
            className="input"
            required
            value={form.voc}
            onChange={(e) => setField('voc', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-imp">Imp (A)</label>
          <input
            id="m-imp"
            type="number"
            step="any"
            className="input"
            required
            value={form.imp}
            onChange={(e) => setField('imp', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-vmp">Vmp (V)</label>
          <input
            id="m-vmp"
            type="number"
            step="any"
            className="input"
            required
            value={form.vmp}
            onChange={(e) => setField('vmp', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-coefv">Coef. V (%/°C)</label>
          <input
            id="m-coefv"
            type="number"
            step="any"
            className="input"
            required
            value={form.coef_v}
            onChange={(e) => setField('coef_v', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-coefi">Coef. I (%/°C)</label>
          <input
            id="m-coefi"
            type="number"
            step="any"
            className="input"
            required
            value={form.coef_i}
            onChange={(e) => setField('coef_i', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-coefpmp">Coef. Pmp (%/°C)</label>
          <input
            id="m-coefpmp"
            type="number"
            step="any"
            className="input"
            required
            value={form.coef_pmp}
            onChange={(e) => setField('coef_pmp', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-efic">Eficiência (fração, ex: 0.213)</label>
          <input
            id="m-efic"
            type="number"
            step="any"
            className="input"
            value={form.efic ?? ''}
            onChange={(e) => setField('efic', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-altura">Altura (mm)</label>
          <input
            id="m-altura"
            type="number"
            step="any"
            className="input"
            required
            value={form.altura_mm}
            onChange={(e) => setField('altura_mm', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-largura">Largura (mm)</label>
          <input
            id="m-largura"
            type="number"
            step="any"
            className="input"
            required
            value={form.largura_mm}
            onChange={(e) => setField('largura_mm', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-espessura">Espessura (mm)</label>
          <input
            id="m-espessura"
            type="number"
            step="any"
            className="input"
            required
            value={form.espessura_mm}
            onChange={(e) => setField('espessura_mm', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="m-peso">Peso (kg)</label>
          <input
            id="m-peso"
            type="number"
            step="any"
            className="input"
            required
            value={form.peso_kg}
            onChange={(e) => setField('peso_kg', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="bd-form__actions">
        <button type="button" className="btn btn--outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Salvando…' : 'Salvar módulo'}
        </button>
      </div>
    </form>
  )
}
