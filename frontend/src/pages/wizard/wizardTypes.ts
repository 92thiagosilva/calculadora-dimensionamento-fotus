import type { Inverter, Module, MpptConfigEntry, ValidateKitResponse } from '../../types/api'

export interface WizardState {
  step: number
  maxReached: number
  tMin: number
  tMax: number
  regionId: string | null
  module: Module | null
  inverter: Inverter | null
  mpptConfig: (MpptConfigEntry | null)[]
  result: ValidateKitResponse | null
}

export const initialWizardState: WizardState = {
  step: 0,
  maxReached: 0,
  tMin: 0,
  tMax: 60,
  regionId: 'Conservador',
  module: null,
  inverter: null,
  mpptConfig: [],
  result: null,
}

export const WIZARD_STEPS = ['Local térmico', 'Módulo', 'Inversor', 'Strings', 'Resultado']
