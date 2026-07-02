export interface PowerRange {
  key: string
  label: string
  min: number | null
  max: number | null
}

// Faixas calibradas pela distribuição real do catálogo Fotus (módulos
// 330–725 Wp, concentrados em 550–650 Wp).
export const MODULE_POWER_RANGES: PowerRange[] = [
  { key: 'all', label: 'Todas as potências', min: null, max: null },
  { key: '0-400', label: 'Até 400 Wp', min: null, max: 400 },
  { key: '400-500', label: '400 – 500 Wp', min: 400, max: 500 },
  { key: '500-600', label: '500 – 600 Wp', min: 500, max: 600 },
  { key: '600-700', label: '600 – 700 Wp', min: 600, max: 700 },
  { key: '700+', label: 'Acima de 700 Wp', min: 700, max: null },
]

// Faixas calibradas pela distribuição real do catálogo Fotus (inversores
// 1,5–333 kW).
export const INVERTER_POWER_RANGES: PowerRange[] = [
  { key: 'all', label: 'Todas as potências', min: null, max: null },
  { key: '0-5', label: 'Até 5 kW', min: null, max: 5 },
  { key: '5-10', label: '5 – 10 kW', min: 5, max: 10 },
  { key: '10-15', label: '10 – 15 kW', min: 10, max: 15 },
  { key: '15-20', label: '15 – 20 kW', min: 15, max: 20 },
  { key: '20-30', label: '20 – 30 kW', min: 20, max: 30 },
  { key: '30-50', label: '30 – 50 kW', min: 30, max: 50 },
  { key: '50-75', label: '50 – 75 kW', min: 50, max: 75 },
  { key: '75-100', label: '75 – 100 kW', min: 75, max: 100 },
  { key: '100+', label: 'Acima de 100 kW', min: 100, max: null },
]
