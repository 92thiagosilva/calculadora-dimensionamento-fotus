import { useEffect, useMemo, useState } from 'react'
import { getInverters, getModules, testRule } from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type {
  Inverter,
  Module,
  RuleTestOutcome,
  RuleTestRequest,
  RuleTestResponse,
} from '../types/api'
import { Badge, toneFromStatus } from './Badge'
import { toApiRule, type EditableRule } from './ruleScope'
import { ErrorAlert } from './ErrorAlert'
import { Spinner } from './Spinner'
import './RuleTester.css'

export interface RuleTestInverter {
  inverter_id: number
  label: string
}

interface RuleTesterProps {
  rule: EditableRule
  /** Quando informado (formulário de um inversor), o teste usa esse inversor; senão o usuário escolhe. */
  fixedInverter?: RuleTestInverter
}

const STORAGE_KEY = 'fotus_rule_test_prefs'

interface Prefs {
  module?: string
  inverter?: string
}

function loadPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Prefs
  } catch {
    return {}
  }
}

function savePrefs(patch: Prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadPrefs(), ...patch }))
  } catch {
    /* preferência é só conveniência */
  }
}

const num = (n: number | null | undefined, digits = 1) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const labelOf = (x: { brand: string; model: string }) => `${x.brand} ${x.model}`

/**
 * "Testar regra": simula a regra que está sendo editada (ainda não salva)
 * contra um kit escolhido e mostra, lado a lado, o resultado sem e com a
 * regra. Não grava nada.
 */
export function RuleTester({ rule, fixedInverter }: RuleTesterProps) {
  const [modules, setModules] = useState<Module[]>([])
  const [inverters, setInverters] = useState<Inverter[]>([])
  const [loadingLists, setLoadingLists] = useState(true)
  const [moduleText, setModuleText] = useState(() => loadPrefs().module ?? '')
  const [inverterText, setInverterText] = useState(() => loadPrefs().inverter ?? '')
  const [tMin, setTMin] = useState(0)
  const [tMax, setTMax] = useState(60)
  const [mode, setMode] = useState<'config' | 'kwp'>('config')
  const [series, setSeries] = useState(15)
  const [strings, setStrings] = useState(2)
  const [mpptCount, setMpptCount] = useState<number | ''>('')
  const [totalKwp, setTotalKwp] = useState(170)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RuleTestResponse | null>(null)

  const hasFixedInverter = fixedInverter != null

  useEffect(() => {
    Promise.all([getModules(), hasFixedInverter ? Promise.resolve([] as Inverter[]) : getInverters()])
      .then(([m, i]) => {
        setModules(m)
        setInverters(i)
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoadingLists(false))
  }, [hasFixedInverter])

  const moduleByLabel = useMemo(() => new Map(modules.map((m) => [labelOf(m), m])), [modules])
  const inverterByLabel = useMemo(() => new Map(inverters.map((i) => [labelOf(i), i])), [inverters])

  const pickedModule = moduleByLabel.get(moduleText)
  const pickedInverterId = fixedInverter?.inverter_id ?? inverterByLabel.get(inverterText)?.inverter_id

  async function run() {
    if (!pickedModule || pickedInverterId == null) {
      setError('Escolha um inversor e um módulo da lista para testar.')
      return
    }
    const body: RuleTestRequest = {
      inverter_id: pickedInverterId,
      module_id: pickedModule.module_id,
      t_min: tMin,
      t_max: tMax,
      rule: toApiRule(rule),
      ...(mode === 'kwp'
        ? { total_kwp: totalKwp }
        : { series, strings, ...(mpptCount === '' ? {} : { mppt_count: mpptCount }) }),
    }
    setRunning(true)
    setError(null)
    try {
      setResult(await testRule(body))
      savePrefs({ module: moduleText, ...(fixedInverter ? {} : { inverter: inverterText }) })
    } catch (err) {
      setResult(null)
      setError(extractErrorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  if (loadingLists) return <Spinner label="Carregando catálogo para o teste…" />

  return (
    <div className="rule-tester">
      <p className="muted rule-tester__intro">
        Simula esta regra <strong>sem salvar nada</strong>: escolha um inversor, um módulo e o tamanho do kit e
        compare o resultado sem e com a regra. Só esta regra entra no teste (as outras regras do inversor ficam de fora
        para isolar o efeito).
      </p>

      <div className="rule-tester__grid">
        <div className="field">
          <label>Inversor</label>
          {fixedInverter ? (
            <input className="input" value={fixedInverter.label} disabled />
          ) : (
            <>
              <input
                className="input"
                list="rule-tester-inverters"
                value={inverterText}
                placeholder="Digite para buscar…"
                onChange={(e) => setInverterText(e.target.value)}
              />
              <datalist id="rule-tester-inverters">
                {inverters.map((i) => (
                  <option key={i.inverter_id} value={labelOf(i)} />
                ))}
              </datalist>
            </>
          )}
        </div>
        <div className="field">
          <label>Módulo</label>
          <input
            className="input"
            list="rule-tester-modules"
            value={moduleText}
            placeholder="Digite para buscar…"
            onChange={(e) => setModuleText(e.target.value)}
          />
          <datalist id="rule-tester-modules">
            {modules.map((m) => (
              <option key={m.module_id} value={labelOf(m)} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Temperatura mín. / máx. (°C)</label>
          <div className="rule-tester__pair">
            <input className="input" type="number" value={tMin} onChange={(e) => setTMin(Number(e.target.value))} />
            <input className="input" type="number" value={tMax} onChange={(e) => setTMax(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="rule-tester__kit">
        <div className="rule-tester__modes" role="radiogroup" aria-label="Como informar o kit">
          <label>
            <input type="radio" checked={mode === 'config'} onChange={() => setMode('config')} /> Por módulos por MPPT
          </label>
          <label>
            <input type="radio" checked={mode === 'kwp'} onChange={() => setMode('kwp')} /> Por potência total (kWp)
          </label>
        </div>
        {mode === 'config' ? (
          <div className="rule-tester__pair rule-tester__pair--wide">
            <div className="field">
              <label>Módulos em série</label>
              <input className="input" type="number" min={1} value={series} onChange={(e) => setSeries(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Strings por MPPT</label>
              <input className="input" type="number" min={1} value={strings} onChange={(e) => setStrings(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>MPPTs usados</label>
              <input
                className="input"
                type="number"
                min={1}
                value={mpptCount}
                placeholder="todos"
                onChange={(e) => setMpptCount(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
          </div>
        ) : (
          <div className="field rule-tester__kwp">
            <label>Potência total dos módulos</label>
            <div className="input-unit">
              <input className="input" type="number" min={0} step="any" value={totalKwp} onChange={(e) => setTotalKwp(Number(e.target.value))} />
              <span className="input-unit__suffix">kWp</span>
            </div>
            <span className="muted rule-tester__hint">Útil para sondar o limite exato de uma condição (ex.: 165 e 165,1 kWp).</span>
          </div>
        )}
      </div>

      <div>
        <button type="button" className="btn btn--primary btn--sm" onClick={run} disabled={running}>
          {running ? 'Testando…' : 'Executar teste'}
        </button>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      {result && <RuleTestResult result={result} />}
    </div>
  )
}

function RuleTestResult({ result }: { result: RuleTestResponse }) {
  const { kit, with_rule: withRule, without_rule: withoutRule } = result
  const hasVerdict = withRule.validation != null

  const verdict = !result.rule_in_scope
    ? { tone: 'muted', text: 'Este inversor está FORA do escopo da regra — ela não seria aplicada a ele.' }
    : !result.rule_enabled
    ? { tone: 'muted', text: 'A regra está DESATIVADA — não seria aplicada em nenhum kit.' }
    : result.rule_applies
      ? { tone: 'warning', text: 'A regra SE APLICA a este kit.' }
      : { tone: 'ok', text: 'A regra NÃO se aplica a este kit — os limites cadastrados continuam valendo.' }

  return (
    <div className="rule-tester__result">
      <div className={`rule-tester__verdict rule-tester__verdict--${verdict.tone}`}>{verdict.text}</div>

      {result.overload_override && (
        <div className="alert alert--warning">
          <strong>Sobrecarga do catálogo substituída: </strong>
          {result.overload_override.message}
        </div>
      )}

      <p className="rule-tester__kitline">
        {result.inverter.brand} {result.inverter.model} · kit de <strong>{num(kit.total_kwp, 2)} kWp</strong>
        {kit.total_mods != null && <> ({kit.total_mods} módulos)</>} · sobrecarga <strong>{num(kit.overload_pct, 1)}%</strong>
      </p>

      <div className="rule-tester__cols">
        <div>
          <h4 className="rule-tester__h">Condições</h4>
          <ul className="rule-tester__list">
            {result.conditions.length === 0 && <li className="muted">Sem condições (sempre vale).</li>}
            {result.conditions.map((c, i) => (
              <li key={i} className={c.ok ? 'rule-tester__ok' : 'rule-tester__no'}>
                {c.ok ? '✓' : '✗'} {c.label}: <strong>{num(c.measured, 2)} {c.unit}</strong> — precisa ser {c.op_label}{' '}
                {num(c.threshold, 2)} {c.unit}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="rule-tester__h">{result.rule_applies ? 'Efeitos aplicados' : 'Efeitos (se a regra se aplicasse)'}</h4>
          <ul className="rule-tester__list">
            {result.effects.length === 0 && <li className="muted">Nenhum valor do inversor muda.</li>}
            {result.effects.map((e, i) => (
              <li key={i}>
                {e.label}: {[...new Set(e.before.map((v) => num(v)))].join('/')} → <strong>{[...new Set(e.after.map((v) => num(v)))].join('/')} {e.unit}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <table className="rule-tester__table">
        <thead>
          <tr>
            <th></th>
            <th>Sem a regra</th>
            <th>Com a regra</th>
          </tr>
        </thead>
        <tbody>
          <CompareRow label="V max usado" a={num(withoutRule.limits.v_max, 0) + ' V'} b={num(withRule.limits.v_max, 0) + ' V'} />
          <CompareRow
            label="Série permitida (MPPT 1)"
            a={`${withoutRule.limits.min_series}–${withoutRule.limits.max_series}`}
            b={`${withRule.limits.min_series}–${withRule.limits.max_series}`}
          />
          <CompareRow label="Strings máx. (MPPT 1)" a={String(withoutRule.limits.max_strings)} b={String(withRule.limits.max_strings)} />
          <CompareRow
            label="Limite de sobrecarga"
            a={num(withoutRule.limits.overload_limit_kw, 1) + ' kW'}
            b={num(withRule.limits.overload_limit_kw, 1) + ' kW'}
          />
          {hasVerdict && (
            <tr>
              <th>Resultado do kit</th>
              <td>
                <Verdict outcome={withoutRule} />
              </td>
              <td>
                <Verdict outcome={withRule} />
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {withRule.validation?.ressalva_reasons.length ? (
        <div className="alert alert--warning">
          <strong>Ressalvas com a regra:</strong>
          <ul className="rule-tester__list">
            {withRule.validation.ressalva_reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function CompareRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr className={a !== b ? 'rule-tester__changed' : ''}>
      <th>{label}</th>
      <td>{a}</td>
      <td>{b}</td>
    </tr>
  )
}

function Verdict({ outcome }: { outcome: RuleTestOutcome }) {
  const v = outcome.validation
  if (!v) return null
  return <Badge tone={toneFromStatus(v.overall_badge)} size="sm">{v.overall_badge}</Badge>
}
