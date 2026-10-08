---
name: calculadora-dimensionamento
description: Conhecimento do projeto Calculadora de Dimensionamento Fotus (kits fotovoltaicos módulo × inversor; backend FastAPI + frontend React). Use ao alterar, depurar, testar ou operar essa calculadora — motor de cálculo (MPPT, overload, CC/CA), ajustes e regras condicionais configuráveis, sugestão automática, API, tela de Configurações, hospedagem na porta 8010 — ou quando o usuário falar de V max, sobrecarga, ressalva, kit, string/MPPT ou "calculadora".
---

# Calculadora de Dimensionamento Fotus

Aplicação web que substitui a planilha Excel de dimensionamento módulo × inversor para o time comercial da Fotus. O motor de cálculo foi portado de um projeto TypeScript e é **bit-exato** com a calculadora HTML canônica da Fotus. Tudo que é regra nova entra como **camada por cima** do motor, nunca dentro dele.

Raiz do projeto: `C:\Users\thiago.silva\OneDrive - FOTUS ENERGIA SOLAR LTDA\Documentos\Claude\Projects\Calculadora-de-dimensionamento` (repositório git; remoto `92thiagosilva/calculadora-dimensionamento-fotus`, branch `main`).

## Mapa do código

```
backend/app/
  main.py                      FastAPI; startup = create_all + run_lightweight_migrations; serve frontend/dist se existir
  domain/calculo_solar/
    corrections.py             correção térmica do módulo (CANÔNICO)
    mppt_limits.py             limites por MPPT (CANÔNICO)
    validate_kit.py            validação do kit (CANÔNICO)
    auto_config.py             configuração inicial de strings (CANÔNICO)
    calc_adjustments.py        ajustes estáticos + orquestra regras (validate_kit_with_rules)
    conditional_rules.py       motor de regras condicionais
    commercial_rules.py        regra CC/CA mínima + recompute_badge_from_per_mppt
    suggestion.py              sugestão automática
    area.py / mismatch.py      Comparativo de Área / Mismatch (lógica nova, da planilha)
  domain/catalogo/             dataclasses Module, Inverter, ThermalRegion (6 regiões)
  api/                         routes_*.py, schemas.py (Pydantic), auth.py, error_mapper.py
  infra/                       models.py, db.py, repository.py, import_excel.py, seed_admin.py
backend/tests/golden/          37 testes de paridade do motor canônico
backend/tests/                 test_conditional_rules.py, test_rule_tester_api.py
frontend/src/
  pages/WizardPage + pages/wizard/   Step{Thermal,Module,Inverter,Strings,Result}, SuggestionMode
  pages/CalcSettingsPage.tsx         Configurações de Cálculo (área restrita)
  components/ConditionalRulesEditor, RuleTester, AdjustmentField, ResultPanel, ...
  api/client.ts, api/endpoints.ts, types/api.ts
scripts/start-production.ps1   sobe o servidor de produção
```

## Motor canônico — NÃO alterar

Não reordene operações nem "simplifique" fórmulas: ponto flutuante não é associativo e a paridade bit-a-bit é requisito de negócio. Qualquer mudança passa pelos 37 testes golden.

- Correção térmica (`corrections.py`), com `t_min`/`t_max` da região:
  `voc_max = voc·(1+(t_min−25)·coef_v/100)`, `vmp_min = vmp·(1+(t_max−25)·coef_pmp/100)`, `imp_max = imp·(1+(t_max−25)·coef_i/100)`, `isc_max = isc·(1+(t_max−25)·coef_i/100)`.
- Limites do MPPT (`mppt_limits.py`): `lin_max = inv.lin_max[i] or 99`; `max_series_voc = floor(v_max/voc_max)`; `max_series_vmpp = floor(v_mpp_max/vmp)` (usa o **vmp de STC** do módulo; sem `v_mpp_max` vale `max_series_voc`); `min_series = ceil(v_mpp_min/vmp_min)` (sem `v_mpp_min` vale 1); `max_series = min(max_series_voc, max_series_vmpp)`; `max_strings = min(floor(imax/imp_max), floor(isc/isc_max), lin_max)` (corrente ≤ 0 vale 99). Índice de MPPT fora de `mppt_currents` → `MPPT_INDEX_OUT_OF_RANGE`; inversor sem `v_max` → `CALCULATION_NUMERIC_ERROR`.
- Validação (`validate_kit.py`): `overload_fail = total_kwp > p_max_cc/1000` → "Reprovado". MPPT sem configuração ou fora dos limites → "Verificar". `ratio_cc_ca` é arredondado com semântica `toFixed(0)` do JS. Inversor sem `p_max_cc` → erro.
- `recompute_badge_from_per_mppt` (commercial_rules): não usar um MPPT é válido; considera só os MPPTs configurados.
- `mismatch.py` reproduz de propósito uma inconsistência da planilha original (Imp_max com `t_min`); ver README — não "corrigir" sem decisão do operador.

## Camadas por cima do motor (ordem de aplicação em um kit)

1. **Ajustes estáticos** (`CalcAdjustments` → `build_adjusted_inverter`): copia congelada do inversor com tolerâncias/deltas somados.
2. **Regras condicionais** (`conditional_rules.apply_rules`): avaliadas sobre o kit (potência total dos módulos), alteram o inversor já ajustado.
3. `validate_kit` com esse inversor → `recompute_badge_from_per_mppt`.
4. **Ressalvas**: com qualquer ajuste ativo, roda também com o inversor cru do catálogo e compara; cada coisa que só passa por causa de ajuste/regra vira um motivo em `ressalva_reasons` e o badge "Aprovado" vira "Aprovado com ressalva". Nunca se aprova silenciosamente algo fora do cadastro.
5. **Aviso de sobrecarga substituída** (`calc_adjustments.overload_override_note`): quando `overload_pct_override` (global ou do inversor) difere da sobrecarga do catálogo, `/validate-kit` e `/test-rule` devolvem `overload_override` (`message`, limites do catálogo e efetivo, `source` = global/inverter). `ResultPanel`, `StepStrings`, o testador e o campo Sobrecarga das Configurações exibem o aviso.
6. **Regra comercial CC/CA mínima** (`routes_dimensionamento._apply_dc_ac_ratio_rule`): potência dos módulos ≥ X% da potência nominal CA do inversor, X = 70 por padrão; abaixo disso → "Reprovado" com `dc_ac_ratio_note`. O motor original é preservado em `formula_badge`.

`build_validation_response` (routes_dimensionamento.py) é o pipeline completo; é compartilhado por `/validate-kit` e pelo teste de regras.

## Ajustes configuráveis (`calc_adjustments.py`)

Global (`CalcSettingsGlobal`, linha única id=1) + override por inversor (`CalcSettingsInverterOverride`; campo nulo = herda o global). Faixas validadas em `schemas.CalcSettingsIn`:

| Campo | Efeito | Faixa |
|---|---|---|
| `overload_pct_override` | substitui a sobrecarga do catálogo (`p_max_cc = p_nom·(1+x/100)`) | 0–100 %; nulo = usa o cadastro |
| `imax_tolerance_a`, `isc_tolerance_a` | somados a I max / Isc max de cada MPPT | 0–10 A; global de `imax` começa em 2.0 |
| `vmax_delta_v`, `vmpp_min_delta_v`, `vmpp_max_delta_v` | somados a V max / V MPP min / V MPP max | −500 a +500 V |
| `dc_ac_ratio_min_pct_override` | substitui o mínimo CC/CA de 70 % | 0–100 %; nulo = 70 |
| `conditional_rules` | regras condicionais (abaixo) | JSON |

## Regras condicionais (`conditional_rules.py`)

Servem para casos em que o fabricante muda limites conforme o tamanho do kit. Exemplo do projeto: Solplanet ASW 110K-LT (10 MPPT): até 50 % de sobrecarga o V max fica em 1100 V; acima disso, até 60 % (aprovado pelo fabricante), o V max cai 15 % (935 V), o que reduz os módulos em série por MPPT.

- **Regra** = `id`, `name`, `enabled`, `conditions` (todas verdadeiras — E lógico; vazia = sempre vale) e `effects`.
- **Condição**: `metric` ∈ `overload_pct` (sobrecarga do kit = CC/CA − 1, em %) | `total_kwp`; `op` ∈ `>`, `>=`, `<`, `<=`; `value`. Comparação arredondada a 9 casas para um kit exatamente no limite não cair do lado errado. **"Ultrapassar 50 %" é `>`; `>=` já aplica a regra a exatamente 50 %.**
- **Efeito**: `target` ∈ `v_max`, `v_mpp_min`, `v_mpp_max`, `imax`, `isc` (todos os MPPTs), `overload_limit_pct`; `mode` ∈ `set` (valor absoluto), `delta` (soma), `percent` (variação %, > −100). Resultado nunca negativo. Efeito em campo que o inversor não tem é ignorado.
- **Escopo por inversor (SKU)**: a regra tem `inverter_ids` (lista de `inverter_id`; `null` = todos). Regra global com `null` vale para todos os inversores; com lista, só para os listados (lista vazia é rejeitada). O filtro acontece em `repository._merge_adjustments` via `rule_in_scope`, então `effective-adjustments`, validação, `mppt-limits` e sugestão já veem só as regras que alcançam aquele inversor. Regras gravadas no override de um inversor sempre valem para ele (o `inverter_ids` delas é ignorado/zerado).
- **Mescla**: globais que alcançam o inversor + próprias dele; mesmo `id` → a do inversor substitui a global (serve para desativar uma global num modelo). **Regras se empilham**: duas regras de V max −15% aplicáveis ao mesmo inversor dão −27,75% (1100 → ~795 V). Ao criar uma regra nova que substitui outra, edite/desative a antiga.
- **Escolher onde aplicar na tela**: cada regra tem o seletor "Aplicar esta regra em" (`InverterScopePicker`): no editor global → todos / escolher inversores (busca, filtro por marca, "marcar os N da lista"); dentro de "Ajustar" de um inversor → só neste / todos / escolher (o atual fica sempre marcado). Ao salvar o modal, regras marcadas como todos/escolhidos **saem da lista do inversor e vão para a lista global** com o escopo (uma única fonte de verdade); `EditableRule.scope` é só estado de tela, removido por `toApiRule`.
- **Extensão**: para um novo tipo de regra, registre uma métrica em `METRICS` e/ou um alvo em `TARGETS`; `GET /api/admin/calc-settings/rule-catalog` expõe os registros e o editor da tela os oferece sem mudar o frontend.
- Regras inválidas gravadas são ignoradas com aviso no log (`rules_from_json`), não derrubam o cálculo.
- Persistência: coluna JSON `conditional_rules` nas duas tabelas, criada por `run_lightweight_migrations` (não há Alembic).
- O `ressalva` de regra só é gerado quando a regra **liberou** algo (`rules_relaxed`); regra que só restringe aparece em `applied_rules` e em "Regras condicionais aplicadas" no `ResultPanel`.
- **Tempo real no assistente**: `GET /mppt-limits?...&total_kwp=` avaliam as regras para o kit atual; `StepStrings` rechama com debounce de 250 ms conforme o kit muda e oferece o botão "Redimensionar módulos em série ao novo limite" (não troca os valores sozinho — reduzir módulos pode tirar o kit da faixa da regra).
- **Testar antes de salvar**: botão "🧪 Testar regra" → `POST /api/admin/calc-settings/test-rule` (restrito, somente leitura). Kit por `series`×`strings`(×`mppt_count`) **ou** `total_kwp`; compara "sem a regra" × "com a regra" (só a regra testada entra). Informa `rule_in_scope` (inversor fora do escopo → a regra não se aplica) e `overload_override`.

## Sugestão automática (`suggestion.py`)

- Exige `target_kwp` **ou** `target_inverter_kw` (nunca os dois; nenhum → `INVALID_INPUT_RANGE`).
- **Meta em kWp**: só kits com `total_kwp` em `[0,95·alvo ; 1,05·alvo]`. **Meta em kW do inversor**: só inversores com `|p_nom/1000 − alvo| ≤ 0,01` (`INVERTER_KW_EXACT_TOLERANCE`).
- Exclui `Microinversor`; ignora inversor sem `p_max_cc`/`v_max`. Filtros opcionais: marcas, fase, `inverter_min_kw`/`inverter_max_kw`.
- Candidatos por par módulo×inversor: série (min/meio/max) × strings (1/max) calculados sobre o inversor ajustado, **mais** os candidatos dentro dos limites de cada regra condicional ativa (`rule_variant_inverters`) — sem isso não existiria sugestão no regime de V max reduzido. A validação real checa as condições.
- Só entram "Aprovado" / "Aprovado com ressalva" que também passam a regra CC/CA; deduplica por kWp (2 casas); ordena por `score` = distância ao alvo; `max_suggestions` padrão 100 (1–500).

## API (prefixo `/api`)

Autenticação: header `X-Dev-User-Email` (modo dev; `AUTH_MODE=production` só com `AZURE_TENANT_ID` + `AZURE_CLIENT_ID`, código pronto mas inativo). Papel `restrito` = e-mail na tabela `authorized_users`; demais = `comercial`. O frontend entra sozinho como `comercial@fotus.com.br`; "Trocar de usuário" no cabeçalho muda a identidade.

- Qualquer usuário: `auth/me`, `auth/mode`, `catalog/{modules,inverters,regions,brands}`, `area/compare`, `dimensionamento/{correct-module-specs, effective-adjustments, mppt-limits, auto-config-strings, validate-kit, suggest-kit}`.
- Só `restrito`: `mismatch/compare`, `bd/*` (CRUD de módulos/inversores, auditado), `auth/authorized-users`, `admin/calc-settings/{global, inverters, inverters/{id}, rule-catalog, test-rule}`.
- Erros do domínio (`ToolError`) viram HTTP via `error_mapper`: `*_NOT_FOUND` 404; `MPPT_INDEX_OUT_OF_RANGE`/`INVALID_*` 400; `CALCULATION_NUMERIC_ERROR` 422.

## Operação (Windows)

- Produção: Tarefa Agendada **"Fotus Calculadora Dimensionamento"** (gatilho: logon) executa `scripts/start-production.ps1` → uvicorn `0.0.0.0:8010`, servindo API + `frontend/dist`; log em `logs/server.log`. Dev: `.claude/launch.json` (backend com `--reload` na 8010, Vite na 5173).
- **Sem hot reload em produção.** Depois de mudar backend: reiniciar a tarefa. Depois de mudar frontend: `npm run build` em `frontend/` e reiniciar. Reiniciar: `Stop-ScheduledTask` + `Start-ScheduledTask` (sem admin); a subida leva alguns segundos — verifique `GET /api/health`.
- A tarefa **não reinicia sozinha** se o processo morrer (já ocorreu com código de saída `0xC000013A`, encerramento externo); só volta no próximo logon.
- Ao parar o servidor, mate apenas o processo dono da porta 8010 (`Get-NetTCPConnection -LocalPort 8010`). Há outros `python.exe` na máquina que não são desta aplicação.
- Banco: SQLite em `backend/data/fotus.db` (ignorado pelo git; variável `FOTUS_DB_PATH` troca o caminho — útil para testar com uma cópia). Catálogo vem da planilha: `python -m app.infra.import_excel "<planilha>"` **substitui** módulos e inversores (destrutivo). Primeiro admin: `python -m app.infra.seed_admin <email>`.

## Armadilhas conhecidas

- **Sobrecarga global em 0 %**: no `AdjustmentField`, marcar "Definir valor customizado" preenche **0**; salvar assim substitui a sobrecarga de todos os inversores por 0 % (kit acima da potência nominal reprova). Agora a tela avisa (campo Sobrecarga, resultado, passo de strings e testador), mas confira os ajustes globais ao investigar reprovações por overload.
- `Base.metadata.create_all` não adiciona colunas a tabelas existentes: toda coluna nova precisa entrar em `run_lightweight_migrations` (`infra/db.py`).
- `frontend/src/api/client.ts` fixa `API_BASE_URL = 'http://127.0.0.1:8010'`. Pelo código, um navegador em outra máquina da rede chamaria o próprio localhost para a API; confirme o acesso pela rede antes de assumir que funciona.
- URL direta de rota do frontend (ex.: `/calc-settings`) dá 404 no servidor de produção (sem fallback de SPA); entre pela raiz e navegue pelo menu.
- PowerShell 5.1: `git commit -m` com texto de várias linhas quebra; grave a mensagem num arquivo e use `git commit -F <arquivo>`. O `git push` imprime o progresso no stderr, e o PowerShell o mostra como erro (`NativeCommandError`) mesmo com sucesso — confira a linha `a..b main -> main`.

## Como validar uma mudança

```powershell
cd backend
.\.venv\Scripts\python -m pytest -q          # golden (37) + regras + teste de regra
cd ..\frontend
npm run build                                 # tsc -b + vite build
```

- Mudança no motor canônico: os 37 testes golden precisam continuar idênticos; se mudaram, a mudança está no lugar errado — mova para uma camada.
- Para exercitar a interface de ponta a ponta sem tocar nas configurações reais: copie `fotus.db`, suba uvicorn com `FOTUS_DB_PATH` apontando para a cópia (o frontend só fala com a porta 8010, então a produção precisa estar parada durante o teste) e restaure a produção ao final.
