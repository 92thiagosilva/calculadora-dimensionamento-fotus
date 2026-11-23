# Calculadora de Dimensionamento — Fotus

Aplicação web (React + Python) que substitui a planilha Excel de
dimensionamento módulo × inversor por uma interface moderna para o
time comercial, preservando 100% das fórmulas e regras de negócio da
planilha oficial da Fotus.

## Documentação

| Documento | Para quê |
|---|---|
| **este README** | Visão geral, como rodar e os comandos do dia a dia |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | **Leitura obrigatória para quem vai integrar ou mexer no cálculo**: os três artefatos (HTML canônico, projeto TypeScript, este repositório), como o motor funciona, a API, os dados, a integração com outra plataforma e as lacunas conhecidas |
| [`artifact/README.md`](artifact/README.md) | Cópia compartilhável da calculadora (página única, motor em JavaScript) |
| [`.claude/skills/calculadora-dimensionamento/SKILL.md`](.claude/skills/calculadora-dimensionamento/SKILL.md) | Resumo técnico para o Claude Code trabalhar neste projeto |

## Origem do cálculo (em uma tela)

Estes três artefatos nasceram um do outro. O resultado **oficial** é o do primeiro:

1. **Calculadora HTML canônica da Fotus** (`calculadora-dimensionamento.html`): fonte da verdade das fórmulas e do catálogo original.
2. **Projeto TypeScript `fotus-dimens`** (servidor MCP): primeiro porte do HTML, com testes que provam paridade bit a bit (inclusive os 61.070 pares módulo × inversor, segundo o README dele).
3. **Este repositório**: portou o motor do TypeScript para Python e acrescentou a aplicação web, o catálogo editável, ajustes configuráveis e regras novas.

Os arquivos 1 e 2 **não estão neste repositório** (ficam em um projeto separado). Os comentários do tipo "BIT-EXATA ... linhas 840-865 ... portada de fotus-dimens (TS)" em `backend/app/domain/calculo_solar/` apontam para essa cadeia. Detalhes e diferenças entre os três em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Estrutura

```
backend/    API Python (FastAPI) — motor de cálculo, catálogo, autenticação
frontend/   Interface React (Vite + TypeScript)
```

## O que a aplicação cobre

| Aba da planilha original | Onde está aqui |
|---|---|
| Dimensionamento Personalizado | Assistente "Dimensionar" (wizard) — aberto a todo o time comercial |
| Comparativo Área | Página "Comparativo de Área" — aberto a todo o time comercial |
| Mismatch | Página "Mismatch" — **área restrita** |
| BD (banco de dados de produtos) | Página "Base de Dados (BD)" — **área restrita**, com CRUD completo |
| *(novo, não existia na planilha)* Sugestão automática | Modo "Sugestão automática" do assistente — aberto a todo o time comercial |
| *(novo)* Ajustes e regras de cálculo | Página "Configurações" — **área restrita**: tolerâncias, mínimo CC/CA, regras condicionais por inversor e teste de regra |

O motor de cálculo (correção térmica, limites de MPPT, validação de
kit, sugestão automática) foi portado para Python a partir de um
motor TypeScript já validado bit-a-bit contra a calculadora HTML
canônica da Fotus (61.070 combinações módulo×inversor testadas). Os
37 testes de paridade (`backend/tests/golden`) confirmam que os
números batem exatamente com a referência.

**Catálogo**: importado diretamente da aba `BD` da planilha
`2026 - Dimensionamento Módulo x Inversor - JUNHO 2 (1).xlsx` (173
módulos, 430 inversores). Ver [Atualizando o catálogo](#atualizando-o-catálogo).

## Como rodar localmente (desenvolvimento)

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m app.infra.import_excel "caminho\para\planilha.xlsx"   # popula o catálogo (1x, ou quando a planilha for atualizada)
.\.venv\Scripts\python -m app.infra.seed_admin seu-email@fotus.com.br           # dá acesso à área restrita ao seu e-mail
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8010 --app-dir .
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:5173`. Não há tela de login: todo visitante entra
como `comercial@fotus.com.br`. Para acessar a área restrita, use "Trocar de
usuário" no cabeçalho e informe o e-mail que você cadastrou com
`seed_admin.py` (ver seção SSO abaixo).

## Hospedagem na sua máquina (para o time acessar)

Este é o modo de operação combinado: a aplicação roda na sua máquina,
acessível pelo time na rede da Fotus.

1. Build do frontend (gera arquivos estáticos):
   ```powershell
   cd frontend
   npm run build
   ```
2. Suba o backend escutando na rede (não só localhost):
   ```powershell
   cd backend
   .\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --app-dir .
   ```
   Com o build do frontend presente em `frontend/dist`, o próprio
   backend passa a servir a interface — **um único endereço** para
   todo mundo: `http://<seu-ip-na-rede>:8010`.
3. Para descobrir seu IP na rede da Fotus: `ipconfig` (procure o
   adaptador Wi-Fi/Ethernet ativo, campo "Endereço IPv4").
4. Sua máquina precisa ficar ligada e com o processo rodando enquanto
   o time usa a aplicação. Considere deixar rodando em segundo plano
   (ex: `Start-Process` sem janela, ou uma tarefa agendada no Windows
   que inicie o comando acima no login).

## Autenticação — SSO Microsoft 365 (pendente)

Hoje a aplicação usa uma **identificação de desenvolvimento**: o backend
confia no cabeçalho `X-Dev-User-Email`, sem senha nem validação real.
**Isso não é segurança**; só pode rodar em rede confiável até a
configuração do SSO corporativo.

Para ativar o login real com as contas Microsoft 365 da Fotus, é
necessário:

1. Alguém com permissão de administrador no Microsoft Entra ID
   (portal.azure.com → Microsoft Entra ID → Registros de aplicativo)
   criar um **App Registration** para esta aplicação.
2. Me passar dois valores gerados nesse registro:
   - **Tenant ID** (ID do diretório)
   - **Client ID** (ID do aplicativo)
3. Configurar no App Registration a URL de redirecionamento
   (Redirect URI) apontando para onde a aplicação estiver hospedada
   (ex: `http://<seu-ip>:8010` se seguir a hospedagem local acima).
4. Com esses dados, eu configuro as variáveis de ambiente
   `AZURE_TENANT_ID` e `AZURE_CLIENT_ID` no backend (o código de
   validação do token já está pronto em `backend/app/api/auth.py`,
   só falta ligar) e troco a tela de login do frontend pelo botão
   "Entrar com Microsoft".

Até lá, quem tem acesso à área restrita é controlado pela tabela
`authorized_users` do banco local — adicione/remova e-mails com:

```powershell
.\.venv\Scripts\python -m app.infra.seed_admin outro-email@fotus.com.br
```

ou, já logado como usuário restrito, pela própria interface (página
BD → gestão de usuários) — endpoint `POST /api/auth/authorized-users`.

## Atualizando o catálogo

Quando a planilha de produtos da Fotus for atualizada, reimporte:

```powershell
cd backend
.\.venv\Scripts\python -m app.infra.import_excel "caminho\para\nova-planilha.xlsx"
```

Isso **substitui integralmente** as tabelas de módulos e inversores
pelo conteúdo atual da planilha (import é destrutivo/idempotente, não
faz merge). Produtos cadastrados manualmente pela interface (CRUD do
BD) desde a última importação da planilha serão perdidos se você
reimportar — combine com o time se o fluxo de atualização deve ser
"sempre a partir da planilha" ou "CRUD na aplicação é a fonte de
verdade dali em diante".

## Observação técnica encontrada durante a migração

Na aba **Mismatch** da planilha, a fórmula de `Imp_max` usa a janela
térmica `t_min` (0°C) em vez de `t_max` (60°C) — diferente da fórmula
canônica de `Imp_max` usada em todo o resto da calculadora (que usa
`t_max`). A célula até está rotulada "Imp max (Tmax)", sugerindo que
seja um erro de copiar-e-colar na planilha original. Por fidelidade
1:1, o código reproduz o comportamento exato da planilha (ver
`backend/app/domain/calculo_solar/mismatch.py`) — mas vale confirmar
com quem validou a planilha originalmente se isso deveria ser
corrigido.

## Testes

```powershell
cd backend
.\.venv\Scripts\python -m pytest -q          # todos os testes (80)
.\.venv\Scripts\python -m pytest tests/golden -v   # só a paridade do motor canônico (37)
```

O que cada suíte prova está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md#14-como-a-exatidão-é-garantida-testes-e-paridade).
