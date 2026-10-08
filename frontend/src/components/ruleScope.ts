import type { AdjustmentRule } from '../types/api'

/** 'this' = só o inversor aberto; 'all' = todos os inversores; 'selected' = os escolhidos. */
export type RuleScope = 'this' | 'all' | 'selected'

/**
 * Regra em edição. `scope` só existe no formulário de um inversor (onde a regra
 * pode ser exclusiva dele ou passar para a lista global); no editor global o
 * escopo é dado por `inverter_ids` (null = todos).
 */
export type EditableRule = AdjustmentRule & { scope?: RuleScope }

/** Converte para o formato da API (sem o campo só-da-tela `scope`). */
export function toApiRule(rule: EditableRule): AdjustmentRule {
  const { scope, ...rest } = rule
  return { ...rest, inverter_ids: scope === 'this' ? null : rest.inverter_ids }
}
