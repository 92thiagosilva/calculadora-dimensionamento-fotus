import { useEffect, useMemo, useState } from 'react'
import { getInverters } from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type { Inverter } from '../types/api'
import { ErrorAlert } from './ErrorAlert'
import { Spinner } from './Spinner'
import type { RuleScope } from './ruleScope'
import './InverterScopePicker.css'

export interface CurrentInverter {
  inverter_id: number
  label: string
}

interface InverterScopePickerProps {
  scope: RuleScope
  ids: number[]
  onChange: (scope: RuleScope, ids: number[]) => void
  /**
   * Formulário de um inversor: habilita a opção "só este inversor" e mantém o
   * inversor atual sempre marcado na escolha. Sem isso (editor global) só há
   * "todos" e "escolher".
   */
  currentInverter?: CurrentInverter
}

const MAX_ROWS = 150

const labelOf = (i: Inverter) => `${i.brand} ${i.model}`

/** "Aplicar em": todos os inversores (SKUs) ou só os escolhidos. */
export function InverterScopePicker({ scope, ids, onChange, currentInverter }: InverterScopePickerProps) {
  const [inverters, setInverters] = useState<Inverter[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)

  useEffect(() => {
    if (scope !== 'selected' || inverters) return
    getInverters()
      .then(setInverters)
      .catch((err) => setError(extractErrorMessage(err)))
  }, [scope, inverters])

  const locked = currentInverter?.inverter_id
  const selected = useMemo(() => new Set(ids), [ids])
  const brands = useMemo(() => [...new Set((inverters ?? []).map((i) => i.brand))].sort(), [inverters])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (inverters ?? []).filter(
      (i) =>
        (!brand || i.brand === brand) &&
        (!term || labelOf(i).toLowerCase().includes(term)) &&
        (!onlySelected || selected.has(i.inverter_id)),
    )
  }, [inverters, search, brand, onlySelected, selected])

  function setScope(next: RuleScope) {
    if (next === 'selected') {
      onChange(next, locked != null ? [...new Set([...ids, locked])] : ids)
    } else {
      onChange(next, ids)
    }
  }

  function toggle(id: number) {
    if (id === locked) return
    onChange('selected', selected.has(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }

  function selectFiltered() {
    onChange('selected', [...new Set([...ids, ...filtered.map((i) => i.inverter_id)])])
  }

  function clearFiltered() {
    const drop = new Set(filtered.map((i) => i.inverter_id))
    onChange('selected', ids.filter((id) => !drop.has(id) || id === locked))
  }

  return (
    <div className="scope-picker">
      <span className="rule-card__label">Aplicar esta regra em</span>
      <div className="scope-picker__modes" role="radiogroup" aria-label="Escopo da regra">
        {currentInverter && (
          <label>
            <input type="radio" checked={scope === 'this'} onChange={() => setScope('this')} /> Só neste inversor
            <span className="muted"> ({currentInverter.label})</span>
          </label>
        )}
        <label>
          <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} /> Todos os inversores
        </label>
        <label>
          <input type="radio" checked={scope === 'selected'} onChange={() => setScope('selected')} /> Escolher inversores
          {scope === 'selected' && <strong> ({ids.length} selecionado{ids.length === 1 ? '' : 's'})</strong>}
        </label>
      </div>

      {scope === 'all' && currentInverter && (
        <p className="muted scope-picker__note">
          Ao salvar, a regra passa para a lista global e vale para todos os inversores (e deixa de ser exclusiva deste).
        </p>
      )}
      {scope === 'selected' && currentInverter && (
        <p className="muted scope-picker__note">
          Ao salvar, a regra passa para a lista global, restrita aos inversores marcados (este fica sempre incluído).
        </p>
      )}

      {scope === 'selected' && (
        <div className="scope-picker__box">
          {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
          {!inverters && !error && <Spinner label="Carregando inversores…" />}
          {inverters && (
            <>
              <div className="scope-picker__filters">
                <input
                  className="input"
                  type="text"
                  placeholder="Buscar marca ou modelo…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select className="input" value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="">Todas as marcas</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <label className="scope-picker__only">
                  <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} /> Só os marcados
                </label>
              </div>
              <div className="scope-picker__actions">
                <button type="button" className="btn btn--outline btn--sm" onClick={selectFiltered} disabled={filtered.length === 0}>
                  Marcar os {filtered.length} da lista
                </button>
                <button type="button" className="btn btn--outline btn--sm" onClick={clearFiltered} disabled={filtered.length === 0}>
                  Desmarcar os da lista
                </button>
              </div>
              <ul className="scope-picker__list">
                {filtered.slice(0, MAX_ROWS).map((i) => (
                  <li key={i.inverter_id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(i.inverter_id)}
                        disabled={i.inverter_id === locked}
                        onChange={() => toggle(i.inverter_id)}
                      />{' '}
                      {labelOf(i)} <span className="muted">· {(i.p_nom / 1000).toLocaleString('pt-BR')} kW</span>
                    </label>
                  </li>
                ))}
              </ul>
              {filtered.length > MAX_ROWS && (
                <p className="muted scope-picker__note">
                  Mostrando {MAX_ROWS} de {filtered.length}. Refine a busca ou use "Marcar os {filtered.length} da lista".
                </p>
              )}
              {filtered.length === 0 && <p className="muted scope-picker__note">Nenhum inversor encontrado.</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
