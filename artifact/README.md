# Artefato compartilhável da calculadora

Cópia **somente leitura** da calculadora para compartilhar como um Artefato do Claude (uma página HTML única, hospedada no claude.ai, sem acesso ao servidor da Fotus). Em vez de chamar a API, a página traz:

- o **motor de cálculo portado para JavaScript** (`src/engine.js`), espelhando função por função o motor Python de `backend/app/domain/calculo_solar` (inclusive os arredondamentos de cada trecho);
- o **catálogo e os ajustes/regras de cálculo vigentes**, embutidos como JSON na página.

Abas: Dimensionar (assistente de 5 passos, com regras condicionais em tempo real), Sugestão automática, Comparativo de área e Ajustes aplicados. Ficam de fora as áreas restritas (Mismatch, edição da base e das configurações), usuários autorizados e o histórico de alterações.

## Estrutura

```
src/engine.js          motor de cálculo (JavaScript)
src/app.js, app.css    interface (vanilla JS, tema claro/escuro, cores da marca)
export_data.py         lê o banco local e gera data.json (catálogo + ajustes efetivos por inversor)
build.py               junta CSS + motor + app + data.json  ->  dist/page.html
parity/gen_parity.py   roda o motor PYTHON sobre milhares de kits e grava as saídas esperadas
parity/parity.test.js  compara o motor JavaScript com essas saídas
```

## Regenerar (a partir da raiz do repositório)

```powershell
$env:PYTHONPATH = "backend"
backend/.venv/Scripts/python.exe artifact/export_data.py            # gera artifact/data.json a partir de backend/data/fotus.db
backend/.venv/Scripts/python.exe artifact/parity/gen_parity.py       # gera os casos de referência (Python)
node artifact/parity/parity.test.js                                  # precisa terminar em "PARIDADE TOTAL com o motor Python."
python artifact/build.py                                             # gera artifact/dist/page.html (e test.html para abrir localmente)
```

`dist/page.html` é o arquivo que se publica como Artefato (a plataforma acrescenta o esqueleto `<html>`); `dist/test.html` é a mesma página já com o esqueleto, para abrir num servidor local (`python -m http.server`) ao testar.

## Atenção

- **O repositório é público.** `data.json`, `parity/cases.json` e `dist/` são gerados a partir da base local (o catálogo da planilha da Fotus) e **ficam fora do git** (`.gitignore` desta pasta). Não os versione.
- A página é uma **foto**: qualquer mudança no catálogo, nos ajustes ou nas regras só aparece depois de regenerar e republicar.
- Mudou o motor Python (`backend/app/domain/calculo_solar`)? Replique em `src/engine.js` e rode a paridade: ela só passa se os dois motores produzirem os mesmos números e os mesmos textos (a única exceção combinada é a frase do aviso de sobrecarga que manda abrir a tela de Configurações, que não existe no Artefato).
