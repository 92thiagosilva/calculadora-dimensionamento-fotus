# Fixtures manuais (~20+ canonicas) — Golden Tests

Fixtures GERADAS off-line pelo `fixture-generator/` (executa o HTML
canonico em `node:vm` sandbox — dec-021). Esta pasta e versionada e
**NAO** deve ser modificada manualmente.

Em paralelo existe `generated/parity-all-pairs.json` (gerado por
`--all-pairs`) com 100% dos pares modulo x inversor para SC-007.

## Matriz canonica (dec-034 / CHK014 / dec-046)

### a) 1 fixture `corrections/` por marca de modulo distinta

Cobertura da variabilidade de `coef_v` (Voc/°C), `coef_pmp` (Pmp/°C) e
`coef_i` (Imp/Isc/°C) entre as ~25 marcas presentes em `MODULES` (155
entradas totais). Permite detectar regressao de aritmetica IEEE754 em
casos com coeficientes extremos.

### b) 1 fixture `mppt-limits/` por classe de potencia de inversor

| Classe alvo | Range `p_nom` (W) |
|-------------|-------------------|
| 1 kW        | [800, 1800)       |
| 3 kW        | [2800, 3500)      |
| 5 kW        | [4500, 5500)      |
| 8 kW        | [7500, 9500)      |
| 15 kW       | [14000, 17000)    |

Sempre com `p_max_cc != null` (inversor com overload declarado).

### c) Edge cases obrigatorios em `mppt-limits/` e `auto-config/`

- `edge-microinverter`: categoria `Microinversor` ou `p_nom <= 1500`.
  No futuro o handler MCP mapeia para `MICROINVERTER_WARNING`.
- `edge-no-vmpp-min`: inversor sem `v_mpp_min` declarado — HTML usa
  fallback `minSeries = 1`.
- `edge-no-vmpp-max`: inversor sem `v_mpp_max` declarado — HTML usa
  fallback `maxSeriesVmpp = maxSeriesVoc`.
- `edge-1mppt`: inversor com 1 MPPT (forca config simples + valida
  composicao validate-kit).
- `edge-multi-mppt`: inversor com >=4 MPPT (array `MpptConfig[]`
  com varios elementos).
- `edge-out-of-range`: `mpptIdx >= num_mppt` — HTML retorna `null`,
  MCP deve mapear para `MPPT_INDEX_OUT_OF_RANGE`.

### d) Cenarios obrigatorios de `overallBadge`

- `validate-kit-*-aprovado`: caminho feliz (auto config + sem overload).
- `validate-kit-overload-*`: forca `strings * 10` para estourar
  `p_max_cc` — `overallBadge = "Reprovado"`, `overloadFail = true`.
- `validate-kit-revisar-*`: `series = 1 < minSeries` — `overallBadge =
  "Verificar"`, `allMpptOk = false`.

### e) Cobertura de codigos de erro estruturados (FR-016)

Os 7 codigos do `ToolError.code` (dec-039) sao cobertos parcialmente
por fixtures e parcialmente por testes unitarios (alguns dependem do
SDK MCP, nao do dominio):

| Codigo | Cobertura |
|--------|-----------|
| `INVALID_INPUT_RANGE` | teste unitario do schema Zod (sem fixture) |
| `INVALID_THERMAL_RANGE` | teste unitario do schema Zod |
| `CATALOG_ITEM_NOT_FOUND` | teste unitario do catalogo |
| `MPPT_INDEX_OUT_OF_RANGE` | `mppt-limits/edge-out-of-range.json` |
| `MICROINVERTER_WARNING` | `edge-microinverter` (warning, nao erro fatal) |
| `CALCULATION_NUMERIC_ERROR` | teste unitario com `coef` sintetico |
| `INTERNAL_SDK_ERROR` | teste integracao SDK (fora deste escopo) |

## Layout

```
manual/
├── corrections/<scenario_id>.json    (1 por marca; ~25 fixtures)
├── mppt-limits/<scenario_id>.json    (5 classes potencia + 4 edge cases)
├── auto-config/<scenario_id>.json    (1 MPPT + multi-MPPT)
└── validate-kit/<scenario_id>.json   (aprovado + overload + revisar)
```

## Shape canonico de fixture

Todas as fixtures seguem o shape (dec-046):

```jsonc
{
  "header": {
    "scenario_id": "string-slug-curto",
    "descricao": "Texto curto do cenario.",
    "module_label": "BRAND | MODEL | XYW (eff)",
    "inverter_label": "BRAND | MODEL (N MPPT)",  // opcional para corrections/
    "preset": "Conservador",
    "autor": "fixture-generator",
    "html_sha256": "14e1ee1bcc32c002e83bda2511a9fdb3753f551d98a3061163576be8d6508ac7"
  },
  "inputs": { /* parametros literais passados a funcao do HTML */ },
  "outputs": { /* output bit-a-bit do HTML — Object.is em todos os fields */ }
}
```

`html_sha256` rastreia rigorosamente a versao do HTML que gerou cada
fixture. Mismatch em ondas futuras = re-geracao obrigatoria.

## Geracao

```bash
cd fixture-generator/
node --experimental-strip-types src/main.ts --manual
# Equivalente: npm run fixture:manual (apos npm install)
```

Output:
```
[fixture-generator] HTML SHA-256: 14e1ee1bcc32c002e83bda2511a9fdb3753f551d98a3061163576be8d6508ac7
[fixture-generator] Sandbox OK: 155 modulos, 394 inversores
[fixture-generator] Manual: 37 fixtures escritas — {"corrections":25,"mppt-limits":7,"auto-config":2,"validate-kit":3}
```

## Quando regenerar

- Apos atualizacao do HTML fonte (`docs/01-briefing-discovery/calculadora-dimensionamento.html`).
- Apos alteracao do `MODULES`/`INVERTERS` na fonte.
- Apos refactor de `buildFixtures` em `fixture-generator/src/generate-manual.ts`
  (a regeneracao DEVE preservar `scenario_id`s para nao invalidar testes
  golden existentes — qualquer remocao requer dec auditada).

## Refs

- dec-021 (node:vm sandbox)
- dec-034 (matriz canonica)
- dec-035 (paridade IEEE754 V8 sandbox vs browser)
- dec-046 (formato JSON por funcao)
- dec-047 (estrategia de extracao seletiva)
- dec-048 (strip-types + allowImportingTsExtensions)
- SC-001 (bit-a-bit identico ao HTML)
- SC-007 (paridade massiva)
