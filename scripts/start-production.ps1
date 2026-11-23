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

# Propaga o codigo de saida do servidor: sem isso o script termina com 0
# (sucesso) mesmo quando o servidor morre, e o "reiniciar em caso de falha"
# da Tarefa Agendada nunca dispara.
$code = $LASTEXITCODE
Add-Content -Path $logFile -Value ("[{0}] Servidor encerrado (codigo {1})." -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $code)
if ($code -eq 0) { $code = 1 }  # servidor so deve parar por queda; encerramento "limpo" tambem conta como falha
exit $code
