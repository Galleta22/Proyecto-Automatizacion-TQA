# Ejecutar con Windows PowerShell 5.1 o PowerShell 7.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

$qaPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $qaPython)) {
    $qaPython = (Get-Command python.exe).Source
    $localDependencies = Join-Path $PSScriptRoot '.deps'
    if (Test-Path -LiteralPath $localDependencies) {
        $env:PYTHONPATH = $localDependencies
    }
}
& $qaPython -c 'import uvicorn, fastapi, playwright, reportlab, email_validator'
if ($LASTEXITCODE -ne 0) { throw 'Instala las dependencias de QA según qa/README.md.' }

function Read-Password([string]$prompt) {
    $secret = Read-Host -Prompt $prompt -AsSecureString
    $buffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        [Runtime.InteropServices.Marshal]::PtrToStringBSTR($buffer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($buffer)
        $secret.Dispose()
    }
}

$gmail = (Read-Host 'Dirección Gmail remitente').Trim()
if ($gmail -notmatch '^[^\s@]+@gmail\.com$') { throw 'Ingresa una dirección @gmail.com.' }
$appPassword = (Read-Password 'Contraseña de aplicación de Google') -replace '\s', ''
if ($appPassword.Length -ne 16) { throw 'La contraseña de aplicación de Google debe tener 16 caracteres.' }
if (!$env:LUDISIST_QA_PASSWORD) {
    $env:LUDISIST_QA_PASSWORD = Read-Password 'Contraseña de Ludisist de prueba'
}
if (!$env:LUDISIST_QA_PASSWORD) { throw 'Falta la contraseña de Ludisist de prueba.' }

$listener = Get-NetTCPConnection -State Listen -LocalPort 8120 -ErrorAction SilentlyContinue
if ($listener) {
    $owner = $listener | Select-Object -First 1 -ExpandProperty OwningProcess
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$owner"
    if ($process.CommandLine -notmatch '\buvicorn\b.*\bpanel:app\b') {
        throw 'El puerto 8120 lo está usando otro servicio.'
    }
    $runs = Invoke-RestMethod 'http://127.0.0.1:8120/api/corridas' -TimeoutSec 5
    if ($runs | Where-Object { $_.estado -in @('Pendiente', 'En curso') -or $_.correo_estado -eq 'Enviando' }) {
        throw 'Espera a que finalice la ejecución o el envío antes de reiniciar.'
    }
    Stop-Process -Id $owner
    Wait-Process -Id $owner -Timeout 10 -ErrorAction SilentlyContinue
}

try {
    $env:LUDISIST_QA_SMTP_HOST = 'smtp.gmail.com'
    $env:LUDISIST_QA_SMTP_PORT = '587'
    $env:LUDISIST_QA_SMTP_SECURITY = 'starttls'
    $env:LUDISIST_QA_SMTP_USER = $gmail
    $env:LUDISIST_QA_SMTP_FROM = $gmail
    $env:LUDISIST_QA_SMTP_PASSWORD = $appPassword
    if (!$env:LUDISIST_QA_BROWSER -and (Test-Path "${env:ProgramFiles(x86)}/Microsoft/Edge/Application/msedge.exe")) {
        $env:LUDISIST_QA_BROWSER = 'msedge'
    }
    & $qaPython -m uvicorn --app-dir qa panel:app --host 127.0.0.1 --port 8120
} finally {
    Remove-Item Env:LUDISIST_QA_SMTP_PASSWORD -ErrorAction SilentlyContinue
    $appPassword = $null
}
