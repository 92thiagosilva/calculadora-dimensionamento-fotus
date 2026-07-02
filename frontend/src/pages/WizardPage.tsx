import { useState } from 'react'
import { getInverters, getModules } from '../api/endpoints'
import { extractErrorMessage } from '../api/client'
import type { KitSuggestion } from '../types/api'
import { Stepper } from '../components/Stepper'
import { ErrorAlert } from '../components/ErrorAlert'
import { Spinner } from '../components/Spinner'
import { StepThermal } from './wizard/StepThermal'
import { StepModule } from './wizard/StepModule'
import { StepInverter } from './wizard/StepInverter'
import { StepStrings } from './wizard/StepStrings'
import { StepResult } from './wizard/StepResult'
import { SuggestionMode } from './wizard/SuggestionMode'
import { initialWizardState, WIZARD_STEPS } from './wizard/wizardTypes'
import type { WizardState } from './wizard/wizardTypes'
import './WizardPage.css'

type FlowMode = 'manual' | 'suggestion'

export function WizardPage() {
  const [flowMode, setFlowMode] = useState<FlowMode>('manual')
  const [state, setState] = useState<WizardState>(initialWizardState)
  const [applyingSuggestion, setApplyingSuggestion] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)

  function goToStep(step: number) {
    setState((s) => ({ ...s, step, maxReached: Math.max(s.maxReached, step) }))
  }

  function restart() {
    setState(initialWizardState)
    setFlowMode('manual')
  }

  async function handleUseSuggestedKit(suggestion: KitSuggestion) {
    setApplyingSuggestion(true)
    setSuggestionError(null)
    try {
      const [modules, inverters] = await Promise.all([getModules(), getInverters()])
      const module = modules.find((m) => m.module_id === suggestion.module_id)
      const inverter = inverters.find((i) => i.inverter_id === suggestion.inverter_id)
      if (!module || !inverter) {
        throw new Error('Não foi possível localizar o módulo/inversor sugerido no catálogo.')
      }
      const mpptConfig = suggestion.mppt_config
        .slice()
        .sort((a, b) => a.mppt_idx - b.mppt_idx)
        .map((c) => ({ series: c.series, strings: c.strings }))

      setState({
        ...initialWizardState,
        tMin: state.tMin,
        tMax: state.tMax,
        regionId: state.regionId,
        module,
        inverter,
        mpptConfig,
        step: 4,
        maxReached: 4,
      })
    } catch (err) {
      setSuggestionError(extractErrorMessage(err))
    } finally {
      setApplyingSuggestion(false)
    }
  }

  const progressSteps = flowMode === 'suggestion' ? ['Local térmico', 'Sugestão automática'] : WIZARD_STEPS

  return (
    <div className="wizard-page">
      <div className="wizard-page__intro">
        <h1>Dimensionar kit fotovoltaico</h1>
        <p className="muted">
          Monte um kit passo a passo ou peça uma sugestão automática a partir de uma meta de
          potência.
        </p>
      </div>

      {state.step === 0 && (
        <div className="flow-toggle">
          <button
            type="button"
            className={`flow-toggle__btn ${flowMode === 'manual' ? 'active' : ''}`}
            onClick={() => setFlowMode('manual')}
          >
            Montar manualmente
          </button>
          <button
            type="button"
            className={`flow-toggle__btn ${flowMode === 'suggestion' ? 'active' : ''}`}
            onClick={() => setFlowMode('suggestion')}
          >
            Sugestão automática
          </button>
        </div>
      )}

      {state.step > 0 && (
        <Stepper
          steps={progressSteps}
          current={flowMode === 'suggestion' ? 1 : state.step}
          maxReached={state.maxReached}
          onStepClick={goToStep}
        />
      )}

      <div className="card wizard-card">
        {state.step === 0 && (
          <>
            <StepThermal
              tMin={state.tMin}
              tMax={state.tMax}
              regionId={state.regionId}
              onChange={({ tMin, tMax, regionId }) =>
                setState((s) => ({ ...s, tMin, tMax, regionId }))
              }
              onNext={() => goToStep(1)}
            />

            {flowMode === 'suggestion' && (
              <div className="wizard-suggestion-inline">
                <h2>Sugestão automática</h2>
                <p className="muted">
                  Informe uma meta de potência para receber kits já validados e aprovados.
                </p>
                {applyingSuggestion && <Spinner label="Carregando kit selecionado…" />}
                {suggestionError && <ErrorAlert message={suggestionError} />}
                {!applyingSuggestion && (
                  <SuggestionMode
                    tMin={state.tMin}
                    tMax={state.tMax}
                    onUseKit={handleUseSuggestedKit}
                  />
                )}
              </div>
            )}
          </>
        )}

        {state.step === 1 && (
          <StepModule
            module={state.module}
            onSelect={(module) => setState((s) => ({ ...s, module }))}
            onBack={() => goToStep(0)}
            onNext={() => goToStep(2)}
          />
        )}

        {state.step === 2 && (
          <StepInverter
            inverter={state.inverter}
            onSelect={(inverter) => setState((s) => ({ ...s, inverter }))}
            onBack={() => goToStep(1)}
            onNext={() => goToStep(3)}
          />
        )}

        {state.step === 3 && state.module && state.inverter && (
          <StepStrings
            module={state.module}
            inverter={state.inverter}
            tMin={state.tMin}
            tMax={state.tMax}
            mpptConfig={state.mpptConfig}
            onChange={(mpptConfig) => setState((s) => ({ ...s, mpptConfig }))}
            onBack={() => goToStep(2)}
            onNext={() => goToStep(4)}
          />
        )}

        {state.step === 4 && state.module && state.inverter && (
          <StepResult
            module={state.module}
            inverter={state.inverter}
            tMin={state.tMin}
            tMax={state.tMax}
            mpptConfig={state.mpptConfig}
            onBack={() => goToStep(3)}
            onRestart={restart}
          />
        )}
      </div>
    </div>
  )
}
