import { useEffect, useState } from 'react'
import { getRuleCatalog } from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type { AdjustmentRule, RuleCatalog, RuleCondition, RuleEffect } from '../types/api'
import { ErrorAlert } from './ErrorAlert'
import { RuleTester, type RuleTestInverter } from './RuleTester'
import { Spinner } from './Spinner'
import './ConditionalRulesEditor.css'

interface ConditionalRulesEditorProps {
  rules: AdjustmentRule[]
  onChange: (rules: AdjustmentRule[]) => void
  /** Regras herdadas (ex.: globais, exibidas no formulário de um inversor) — somente leitura. */
  inheritedRules?: AdjustmentRule[]
  /** Inversor fixo do teste (formulário de um inversor). Sem isso, o teste deixa escolher o inversor. */
  testInverter?: RuleTestInverter
}

/** Modelo pronto: o caso do fabricante que libera sobrecarga maior com V max reduzido. */
const OVERLOAD_EXTENSION_TEMPLATE: AdjustmentRule = {
  name: 'Sobrecarga estendida pelo fabricante',
  enabled: true,
  conditions: [{ metric: 'overload_pct', op: '>', value: 50 }],
  effects: [
    { target: 'overload_limit_pct', mode: 'set', value: 60 },
    { target: 'v_max', mode: 'percent', value: -15 },
  ],
}

function describeRule(rule: AdjustmentRule, catalog: RuleCatalog): string {
  const when = rule.conditions.length
    ? rule.conditions
        .map((c) => {
          const m = catalog.metrics.find((x) => x.key === c.metric)
          const o = catalog.operators.find((x) => x.key === c.op)
          return `${m?.label ?? c.metric} ${o?.label ?? c.op} ${c.value}${m ? ` ${m.unit}` : ''}`
        })
        .join(' e ')
    : 'sempre'
  const then = rule.effects
    .map((e) => {
      const t = catalog.targets.find((x) => x.key === e.target)
      const mode = e.mode === 'percent' ? `variar ${e.value}%` : e.mode === 'delta' ? `somar ${e.value} ${t?.unit ?? ''}` : `passa a ${e.value} ${t?.unit ?? ''}`
      return `${t?.label ?? e.target}: ${mode}`
    })
    .join('; ')
  return `Quando ${when} → ${then}.`
}

/**
 * Editor de regras condicionais de ajuste do inversor: "quando o kit
 * atender estas condições, altere estes valores do inversor". Os blocos
 * disponíveis (métricas, alvos, modos) vêm do backend (`/rule-catalog`),
 * então novos tipos de regra aparecem aqui sem mexer neste componente.
 */
export function ConditionalRulesEditor({
  rules,
  onChange,
  inheritedRules = [],
  testInverter,
}: ConditionalRulesEditorProps) {
  const [catalog, setCatalog] = useState<RuleCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getRuleCatalog()
      .then(setCatalog)
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  if (!catalog) {
    return error ? <ErrorAlert message={error} /> : <Spinner label="Carregando tipos de regra…" />
  }

  function updateRule(idx: number, patch: Partial<AdjustmentRule>) {
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function blankRule(): AdjustmentRule {
    const metric = catalog!.metrics[0]
    const target = catalog!.targets[0]
    return {
      name: 'Nova regra',
      enabled: true,
      conditions: [{ metric: metric.key, op: '>', value: 0 }],
      effects: [{ target: target.key, mode: 'delta', value: 0 }],
    }
  }

  return (
    <div className="rules-editor">
      <p className="muted rules-editor__intro">
        Regras que só valem quando o <strong>kit</strong> atende às condições — por exemplo, acima de uma
        certa sobrecarga o fabricante reduz o V max do inversor (o que muda quantos módulos cabem em
        série). Todo kit aprovado por causa de uma regra aparece como "Aprovado com ressalva".
      </p>

      {inheritedRules.length > 0 && (
        <div className="rules-editor__inherited">
          <strong>Regras globais que também valem para este inversor:</strong>
          <ul>
            {inheritedRules.map((r, i) => (
              <li key={r.id ?? i} className={r.enabled ? '' : 'rules-editor__off'}>
                <strong>{r.name}</strong>
                {!r.enabled && ' (desativada)'} — {describeRule(r, catalog)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rules.map((rule, idx) => (
        <RuleCard
          key={rule.id ?? `new-${idx}`}
          rule={rule}
          catalog={catalog}
          testInverter={testInverter}
          onChange={(patch) => updateRule(idx, patch)}
          onRemove={() => onChange(rules.filter((_, i) => i !== idx))}
        />
      ))}

      <div className="rules-editor__actions">
        <button type="button" className="btn btn--outline btn--sm" onClick={() => onChange([...rules, blankRule()])}>
          + Nova regra
        </button>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={() => onChange([...rules, structuredClone(OVERLOAD_EXTENSION_TEMPLATE)])}
          title="Acima de 50% de sobrecarga: libera até 60% e reduz o V max em 15%"
        >
          + Modelo: sobrecarga estendida (V max reduzido)
        </button>
      </div>
    </div>
  )
}

function RuleCard({
  rule,
  catalog,
  testInverter,
  onChange,
  onRemove,
}: {
  rule: AdjustmentRule
  catalog: RuleCatalog
  testInverter?: RuleTestInverter
  onChange: (patch: Partial<AdjustmentRule>) => void
  onRemove: () => void
}) {
  const [testing, setTesting] = useState(false)

  function patchCondition(i: number, patch: Partial<RuleCondition>) {
    onChange({ conditions: rule.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  }
  function patchEffect(i: number, patch: Partial<RuleEffect>) {
    onChange({ effects: rule.effects.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  }

  return (
    <div className={`rule-card ${rule.enabled ? '' : 'rule-card--off'}`}>
      <div className="rule-card__header">
        <label className="rule-card__toggle">
          <input type="checkbox" checked={rule.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
          Ativa
        </label>
        <input
          type="text"
          className="input rule-card__name"
          value={rule.name}
          placeholder="Nome da regra"
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <button type="button" className="btn btn--outline btn--sm" onClick={onRemove}>
          Remover
        </button>
      </div>

      <div className="rule-card__section">
        <span className="rule-card__label">Quando o kit atender a todas estas condições</span>
        {rule.conditions.length === 0 && <p className="muted rule-card__empty">Sem condições: a regra vale sempre.</p>}
        {rule.conditions.map((c, i) => {
          const metric = catalog.metrics.find((m) => m.key === c.metric)
          return (
            <div className="rule-row" key={i}>
              <select
                className="input rule-row__grow"
                value={c.metric}
                onChange={(e) => patchCondition(i, { metric: e.target.value })}
              >
                {catalog.metrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select className="input" value={c.op} onChange={(e) => patchCondition(i, { op: e.target.value })}>
                {catalog.operators.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="input-unit">
                <input
                  type="number"
                  className="input rule-row__value"
                  value={c.value}
                  step="any"
                  onChange={(e) => patchCondition(i, { value: Number(e.target.value) })}
                />
                <span className="input-unit__suffix">{metric?.unit}</span>
              </div>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                aria-label="Remover condição"
                onClick={() => onChange({ conditions: rule.conditions.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="btn btn--outline btn--sm rule-card__add"
          onClick={() =>
            onChange({ conditions: [...rule.conditions, { metric: catalog.metrics[0].key, op: '>', value: 0 }] })
          }
        >
          + Condição
        </button>
      </div>

      <div className="rule-card__section">
        <span className="rule-card__label">Então alterar no inversor</span>
        {rule.effects.map((e, i) => {
          const target = catalog.targets.find((t) => t.key === e.target)
          return (
            <div className="rule-row" key={i}>
              <select
                className="input rule-row__grow"
                value={e.target}
                onChange={(ev) => patchEffect(i, { target: ev.target.value })}
              >
                {catalog.targets.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select className="input" value={e.mode} onChange={(ev) => patchEffect(i, { mode: ev.target.value })}>
                {catalog.modes.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="input-unit">
                <input
                  type="number"
                  className="input rule-row__value"
                  value={e.value}
                  step="any"
                  onChange={(ev) => patchEffect(i, { value: Number(ev.target.value) })}
                />
                <span className="input-unit__suffix">{e.mode === 'percent' ? '%' : target?.unit}</span>
              </div>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                aria-label="Remover efeito"
                disabled={rule.effects.length <= 1}
                onClick={() => onChange({ effects: rule.effects.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="btn btn--outline btn--sm rule-card__add"
          onClick={() =>
            onChange({ effects: [...rule.effects, { target: catalog.targets[0].key, mode: 'delta', value: 0 }] })
          }
        >
          + Efeito
        </button>
      </div>

      <p className="rule-card__summary muted">{describeRule(rule, catalog)}</p>

      <div>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => setTesting((t) => !t)}>
          {testing ? 'Fechar teste' : '🧪 Testar regra'}
        </button>
      </div>
      {testing && <RuleTester rule={rule} fixedInverter={testInverter} />}
    </div>
  )
}
