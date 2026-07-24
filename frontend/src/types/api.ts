// Tipos espelhando as respostas da API Fotus (ver /docs no backend).

export type Role = 'comercial' | 'restrito'

export interface MeOut {
  email: string
  name: string
  role: Role
}

export interface Module {
  module_id: number
  brand: string
  model: string
  label: string
  pnom: number
  isc: number
  voc: number
  imp: number
  vmp: number
  coef_v: number
  coef_i: number
  coef_pmp: number
  efic: number | null
  altura_mm: number
  largura_mm: number
  espessura_mm: number
  peso_kg: number
}

export type ModuleIn = Omit<Module, 'module_id' | 'label'>

export interface MpptCurrents {
  imax: number
  isc: number
}

export type InverterPhase = 'Monofásico' | 'Bifásico' | 'Trifásico' | string

export interface Inverter {
  inverter_id: number
  brand: string
  model: string
  categoria: string | null
  p_nom: number
  p_max_cc: number | null
  v_max: number | null
  v_mpp_min: number | null
  v_mpp_max: number | null
  num_mppt: number
  num_inputs: number | null
  mppt_currents: MpptCurrents[]
  lin_max: number[]
  tensao: number | null
  fase: InverterPhase | null
  protection: string | null
}

export type InverterIn = Omit<Inverter, 'inverter_id'>

export interface ThermalRegion {
  region_id: string
  label: string
  t_min: number
  t_max: number
  is_default: boolean
}

export interface BrandsOut {
  module_brands: string[]
  inverter_brands: string[]
}

export interface CorrectedModuleSpecs {
  voc_max: number
  vmp_min: number
  imp_max: number
  isc_max: number
}

export interface MpptLimits extends CorrectedModuleSpecs {
  max_series_voc: number
  max_series_vmpp: number
  min_series: number
  max_series: number
  max_strings: number
  max_strings_by_imax: number
  max_strings_by_isc: number
  lin_max: number
  imax_mppt: number
  isc_mppt: number
  limiting_factor: string
}

export interface MpptConfigEntry {
  series: number
  strings: number
}

export interface AutoConfigResponse {
  mppt_config: MpptConfigEntry[]
}

export interface PerMpptResult {
  mppt_idx: number
  series: number
  strings: number
  limits: MpptLimits
  series_ok: boolean
  strings_ok: boolean
  badge: 'OK' | 'Verificar' | string
  voc_arranjo: number
  vmp_arranjo: number
  imp_arranjo: number
}

export type OverallBadge = 'Aprovado' | 'Reprovado' | 'Verificar' | 'Aprovado com ressalva'

export interface ValidateKitResponse {
  per_mppt: PerMpptResult[]
  total_mods: number
  total_kwp: number
  ratio_cc_ca: number
  overload_kw: number
  overload_fail: boolean
  all_mppt_ok: boolean
  overall_badge: OverallBadge
  wiring_note: string | null
  /** Badge calculado só pelo motor canônico, antes da regra comercial dos 70%. */
  formula_badge?: OverallBadge
  dc_ac_ratio_ok?: boolean
  dc_ac_min_kwp_required?: number
  dc_ac_ratio_note?: string | null
  /** Explicações de quais ajustes configurados (Imax/Isc/V max/V MPP min/max/sobrecarga) foram decisivos para a aprovação. */
  ressalva_reasons?: string[]
}

export interface CalcAdjustmentsOut {
  overload_pct_override: number | null
  imax_tolerance_a: number
  isc_tolerance_a: number
  vmax_delta_v: number
  vmpp_min_delta_v: number
  vmpp_max_delta_v: number
}

export interface CalcSettingsIn {
  overload_pct_override?: number | null
  imax_tolerance_a?: number | null
  isc_tolerance_a?: number | null
  vmax_delta_v?: number | null
  vmpp_min_delta_v?: number | null
  vmpp_max_delta_v?: number | null
}

export interface CalcSettingsGlobalOut {
  overload_pct_override: number | null
  imax_tolerance_a: number
  isc_tolerance_a: number
  vmax_delta_v: number
  vmpp_min_delta_v: number
  vmpp_max_delta_v: number
  updated_at: string | null
  updated_by: string | null
}

export interface InverterOverrideOut {
  inverter_id: number
  overload_pct_override: number | null
  imax_tolerance_a: number | null
  isc_tolerance_a: number | null
  vmax_delta_v: number | null
  vmpp_min_delta_v: number | null
  vmpp_max_delta_v: number | null
  updated_at: string | null
  updated_by: string | null
}

export interface InverterCalcSettingsRow {
  inverter_id: number
  brand: string
  model: string
  p_nom: number
  p_max_cc: number | null
  v_max: number | null
  v_mpp_min: number | null
  v_mpp_max: number | null
  num_mppt: number
  mppt_currents: MpptCurrents[]
  override: InverterOverrideOut | null
}

export interface SuggestKitEntryMpptConfig {
  mppt_idx: number
  series: number
  strings: number
}

export interface KitSuggestion {
  module_id: number
  inverter_id: number
  mppt_config: SuggestKitEntryMpptConfig[]
  validation: ValidateKitResponse
  score: number
}

export interface SuggestKitResponse {
  suggestions: KitSuggestion[]
}

export interface AreaCompareResultRow {
  module_id: number
  label: string
  pnom: number
  efic: number
  area_m2: number
  w_por_m2: number
  peso_kg: number
  quantidade_kwp: number | null
  kwp_atingido: number | null
  area_ocupada_m2: number | null
  quantidade_area: number | null
  kwp_atingido_area: number | null
}

export interface AreaCompareResponse {
  results: AreaCompareResultRow[]
}

export interface MismatchParamRow {
  label: string
  original: number
  substituto: number
  delta_pct: number
}

export type MismatchVerdict = 'MATCH' | 'MISMATCH'

export interface MismatchResponse {
  original_module_id: number
  substituto_module_id: number
  original_label: string
  substituto_label: string
  params: MismatchParamRow[]
  voc_max_original: number
  voc_max_substituto: number
  voc_max_delta_pct: number
  vmp_min_original: number
  vmp_min_substituto: number
  vmp_min_delta_pct: number
  imp_max_original: number
  imp_max_substituto: number
  imp_max_delta_pct: number
  veredito: MismatchVerdict
}
