import { apiClient } from './client'
import type {
  AreaCompareResponse,
  AutoConfigResponse,
  BrandsOut,
  CorrectedModuleSpecs,
  Inverter,
  InverterIn,
  MeOut,
  MismatchResponse,
  Module,
  ModuleIn,
  MpptConfigEntry,
  MpptLimits,
  SuggestKitResponse,
  ThermalRegion,
  ValidateKitResponse,
} from '../types/api'

// ---- Auth ----
export const getMe = () => apiClient.get<MeOut>('/api/auth/me')

// ---- Catalog ----
export const getModules = (params?: { brand?: string; search?: string }) =>
  apiClient.get<Module[]>('/api/catalog/modules', params)

export const getInverters = (params?: { brand?: string; search?: string }) =>
  apiClient.get<Inverter[]>('/api/catalog/inverters', params)

export const getRegions = () => apiClient.get<ThermalRegion[]>('/api/catalog/regions')

export const getBrands = () => apiClient.get<BrandsOut>('/api/catalog/brands')

// ---- Dimensionamento ----
export const correctModuleSpecs = (body: { module_id: number; t_min: number; t_max: number }) =>
  apiClient.post<CorrectedModuleSpecs>('/api/dimensionamento/correct-module-specs', body)

export const getMpptLimits = (params: {
  inverter_id: number
  module_id: number
  t_min: number
  t_max: number
  mppt_idx: number
}) => apiClient.get<MpptLimits>('/api/dimensionamento/mppt-limits', params)

export const autoConfigStrings = (body: {
  inverter_id: number
  module_id: number
  t_min: number
  t_max: number
}) => apiClient.post<AutoConfigResponse>('/api/dimensionamento/auto-config-strings', body)

export const validateKit = (body: {
  inverter_id: number
  module_id: number
  t_min: number
  t_max: number
  mppt_config: (MpptConfigEntry | null)[]
}) => apiClient.post<ValidateKitResponse>('/api/dimensionamento/validate-kit', body)

export interface SuggestKitBody {
  target_kwp?: number
  target_inverter_kw?: number
  t_min: number
  t_max: number
  module_brand?: string
  inverter_brand?: string
  inverter_phase?: string
  inverter_min_kw?: number
  inverter_max_kw?: number
  max_suggestions?: number
}

export const suggestKit = (body: SuggestKitBody) =>
  apiClient.post<SuggestKitResponse>('/api/dimensionamento/suggest-kit', body)

// ---- Area ----
export const compareArea = (body: {
  module_ids: number[]
  target_kwp?: number
  area_util_m2?: number
}) => apiClient.post<AreaCompareResponse>('/api/area/compare', body)

// ---- Mismatch (restrito) ----
export const compareMismatch = (body: {
  original_module_id: number
  substituto_module_id: number
}) => apiClient.post<MismatchResponse>('/api/mismatch/compare', body)

// ---- BD (restrito) ----
export const bdListModules = () => apiClient.get<Module[]>('/api/bd/modules')
export const bdCreateModule = (body: ModuleIn) => apiClient.post<Module>('/api/bd/modules', body)
export const bdUpdateModule = (id: number, body: ModuleIn) =>
  apiClient.put<Module>(`/api/bd/modules/${id}`, body)
export const bdDeleteModule = (id: number) => apiClient.delete<unknown>(`/api/bd/modules/${id}`)

export const bdListInverters = () => apiClient.get<Inverter[]>('/api/bd/inverters')
export const bdCreateInverter = (body: InverterIn) =>
  apiClient.post<Inverter>('/api/bd/inverters', body)
export const bdUpdateInverter = (id: number, body: InverterIn) =>
  apiClient.put<Inverter>(`/api/bd/inverters/${id}`, body)
export const bdDeleteInverter = (id: number) =>
  apiClient.delete<unknown>(`/api/bd/inverters/${id}`)
