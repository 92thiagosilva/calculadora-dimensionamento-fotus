import { useEffect, useMemo, useState } from 'react'
import {
  bdCreateInverter,
  bdCreateModule,
  bdDeleteInverter,
  bdDeleteModule,
  bdListInverters,
  bdListModules,
  bdUpdateInverter,
  bdUpdateModule,
} from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type { Inverter, InverterIn, Module, ModuleIn } from '../types/api'
import { Spinner } from '../components/Spinner'
import { ErrorAlert } from '../components/ErrorAlert'
import { Modal } from '../components/Modal'
import { ModuleForm } from './bd/ModuleForm'
import { InverterForm } from './bd/InverterForm'
import './BdPage.css'

type Tab = 'modules' | 'inverters'

export function BdPage() {
  const [tab, setTab] = useState<Tab>('modules')

  return (
    <div className="bd-page">
      <h1>Base de Dados (BD)</h1>
      <div className="alert alert--warning bd-page__banner">
        <strong>Área restrita</strong> — alterações aqui afetam todo o catálogo usado pelo time
        comercial.
      </div>

      <div className="tabs">
        <button
          type="button"
          className={`tabs__btn ${tab === 'modules' ? 'active' : ''}`}
          onClick={() => setTab('modules')}
        >
          Módulos
        </button>
        <button
          type="button"
          className={`tabs__btn ${tab === 'inverters' ? 'active' : ''}`}
          onClick={() => setTab('inverters')}
        >
          Inversores
        </button>
      </div>

      {tab === 'modules' ? <ModulesTab /> : <InvertersTab />}
    </div>
  )
}

function ModulesTab() {
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<keyof Module>('brand')
  const [sortDesc, setSortDesc] = useState(false)
  const [editing, setEditing] = useState<Module | null | 'new'>(null)
  const [deleting, setDeleting] = useState<Module | null>(null)

  function reload() {
    setLoading(true)
    setError(null)
    bdListModules()
      .then(setModules)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = term ? modules.filter((m) => m.label.toLowerCase().includes(term)) : modules
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null || bv == null) return 0
      if (typeof av === 'number' && typeof bv === 'number') return av - bv
      return String(av).localeCompare(String(bv))
    })
    return sortDesc ? sorted.reverse() : sorted
  }, [modules, search, sortKey, sortDesc])

  function toggleSort(key: keyof Module) {
    if (sortKey === key) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(false)
    }
  }

  async function handleSave(data: ModuleIn) {
    try {
      if (editing && editing !== 'new') {
        await bdUpdateModule(editing.module_id, data)
      } else {
        await bdCreateModule(data)
      }
      setEditing(null)
      reload()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      await bdDeleteModule(deleting.module_id)
      setDeleting(null)
      reload()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <div className="bd-tab">
      <div className="bd-tab__toolbar">
        <input
          type="text"
          className="input"
          placeholder="Buscar módulo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          + Novo módulo
        </button>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      {loading ? (
        <Spinner label="Carregando módulos…" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('brand')}>Marca</th>
                <th onClick={() => toggleSort('model')}>Modelo</th>
                <th onClick={() => toggleSort('pnom')}>Pnom</th>
                <th onClick={() => toggleSort('voc')}>Voc</th>
                <th onClick={() => toggleSort('vmp')}>Vmp</th>
                <th onClick={() => toggleSort('isc')}>Isc</th>
                <th onClick={() => toggleSort('imp')}>Imp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.module_id}>
                  <td>{m.brand}</td>
                  <td>{m.model}</td>
                  <td>{m.pnom}</td>
                  <td>{m.voc}</td>
                  <td>{m.vmp}</td>
                  <td>{m.isc}</td>
                  <td>{m.imp}</td>
                  <td className="bd-tab__row-actions">
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(m)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleting(m)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty-state">Nenhum módulo encontrado.</div>}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? 'Novo módulo' : `Editar ${editing.label}`}
          onClose={() => setEditing(null)}
        >
          <ModuleForm
            initial={editing === 'new' ? null : editing}
            onSubmit={handleSave}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <Modal title="Confirmar exclusão" onClose={() => setDeleting(null)}>
          <p>
            Tem certeza que deseja excluir <strong>{deleting.label}</strong>? Esta ação não pode
            ser desfeita.
          </p>
          <div className="bd-form__actions">
            <button type="button" className="btn btn--outline" onClick={() => setDeleting(null)}>
              Cancelar
            </button>
            <button type="button" className="btn btn--danger" onClick={handleDelete}>
              Excluir
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function InvertersTab() {
  const [inverters, setInverters] = useState<Inverter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<keyof Inverter>('brand')
  const [sortDesc, setSortDesc] = useState(false)
  const [editing, setEditing] = useState<Inverter | null | 'new'>(null)
  const [deleting, setDeleting] = useState<Inverter | null>(null)

  function reload() {
    setLoading(true)
    setError(null)
    bdListInverters()
      .then(setInverters)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = term
      ? inverters.filter((i) => `${i.brand} ${i.model}`.toLowerCase().includes(term))
      : inverters
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null || bv == null) return 0
      if (typeof av === 'number' && typeof bv === 'number') return av - bv
      return String(av).localeCompare(String(bv))
    })
    return sortDesc ? sorted.reverse() : sorted
  }, [inverters, search, sortKey, sortDesc])

  function toggleSort(key: keyof Inverter) {
    if (sortKey === key) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(false)
    }
  }

  async function handleSave(data: InverterIn) {
    try {
      if (editing && editing !== 'new') {
        await bdUpdateInverter(editing.inverter_id, data)
      } else {
        await bdCreateInverter(data)
      }
      setEditing(null)
      reload()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      await bdDeleteInverter(deleting.inverter_id)
      setDeleting(null)
      reload()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <div className="bd-tab">
      <div className="bd-tab__toolbar">
        <input
          type="text"
          className="input"
          placeholder="Buscar inversor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          + Novo inversor
        </button>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      {loading ? (
        <Spinner label="Carregando inversores…" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('brand')}>Marca</th>
                <th onClick={() => toggleSort('model')}>Modelo</th>
                <th onClick={() => toggleSort('p_nom')}>P nom (W)</th>
                <th onClick={() => toggleSort('num_mppt')}>MPPTs</th>
                <th onClick={() => toggleSort('fase')}>Fase</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.inverter_id}>
                  <td>{inv.brand}</td>
                  <td>{inv.model}</td>
                  <td>{inv.p_nom}</td>
                  <td>{inv.num_mppt}</td>
                  <td>{inv.fase ?? '—'}</td>
                  <td className="bd-tab__row-actions">
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(inv)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleting(inv)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty-state">Nenhum inversor encontrado.</div>}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? 'Novo inversor' : `Editar ${editing.brand} ${editing.model}`}
          onClose={() => setEditing(null)}
        >
          <InverterForm
            initial={editing === 'new' ? null : editing}
            onSubmit={handleSave}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <Modal title="Confirmar exclusão" onClose={() => setDeleting(null)}>
          <p>
            Tem certeza que deseja excluir{' '}
            <strong>
              {deleting.brand} {deleting.model}
            </strong>
            ? Esta ação não pode ser desfeita.
          </p>
          <div className="bd-form__actions">
            <button type="button" className="btn btn--outline" onClick={() => setDeleting(null)}>
              Cancelar
            </button>
            <button type="button" className="btn btn--danger" onClick={handleDelete}>
              Excluir
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
