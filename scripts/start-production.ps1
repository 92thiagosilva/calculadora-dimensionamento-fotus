# Inicia a Calculadora de Dimensionamento Fotus em modo producao:
# um unico processo (backend FastAPI) servindo a API e o frontend
# buildado, acessivel por toda a rede da Fotus na porta 8010.
#
# Usado pela Tarefa Agendada "Fotus Calculadora Dimensionamento" para
# iniciar automaticamente no logon do Windows. Pode tambem ser rodado
# manualmente a qualquer momento (fica bloqueado neste terminal —
# feche a janela ou Ctrl+C para parar).

$root = "C:\Users\thiago.silva\OneDrive - FOTUS ENERGIA SOLAR LTDA\Documentos\Claude\Projects\Calculadora-de-dimensionamento"
$backend = Join-Path $root "backend"
$python = Join-Path $backend ".venv\Scripts\python.exe"
$logDir = Join-Path $root "logs"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "server.log"

Set-Location $backend
& $python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --app-dir $backend *>> $logFile
