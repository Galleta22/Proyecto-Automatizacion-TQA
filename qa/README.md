# Ludisist QA

Panel de ejecución con seis suites, informes descargables y entrega opcional por SMTP. El caso inicial de Smoke, `TC-SMK-001`, abre el formulario real de Ludisist e inicia sesión con un jugador de prueba.

## Ejecutar en Windows

Requisitos probados en Windows: Python 3.12, Node.js 24 y npm. Desde la raíz, instala las dependencias una vez:

```powershell
python -m venv backend/venv
.\backend\venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm.cmd --prefix frontend ci
python -m venv qa/.venv
.\qa\.venv\Scripts\python.exe -m pip install -r qa/requirements.txt
.\qa\.venv\Scripts\python.exe -m playwright install chromium
npm.cmd --prefix qa/frontend ci
npm.cmd --prefix qa/frontend run build
```

Usa tres terminales PowerShell desde la raíz del repositorio. Puedes elegir una contraseña de demostración y escribir la misma en las terminales 1 y 3.

**Terminal 1 · API de prueba**

```powershell
$claveQa = Read-Host 'Contraseña de la cuenta QA' -AsSecureString
$env:LUDISIST_QA_PASSWORD = ([pscredential]::new('qa', $claveQa)).GetNetworkCredential().Password
.\backend\venv\Scripts\python.exe qa/target.py
```

El proceso escucha en `127.0.0.1:8110`. En cada arranque crea una base SQLite temporal, el jugador verificado `jugador_qa`, la cuenta administrativa `organizador_qa` y el juego `Ajedrez QA`. Las cuentas comparten la contraseña de prueba que defines para ese proceso. Las suites crean torneos aislados con nombres únicos. Las mediciones corresponden a esta instancia local y sus datos de prueba.

**Terminal 2 · Frontend de Ludisist**

```powershell
Set-Location frontend
$env:REACT_APP_API_URL = 'http://127.0.0.1:8110'
$env:HOST = '127.0.0.1'
$env:PORT = '3101'
$env:BROWSER = 'none'
npm.cmd start
```

**Terminal 3 · Panel web de Ludisist QA**

```powershell
$claveQa = Read-Host 'Misma contraseña de la cuenta QA' -AsSecureString
$env:LUDISIST_QA_PASSWORD = ([pscredential]::new('qa', $claveQa)).GetNetworkCredential().Password
.\qa\.venv\Scripts\python.exe -m uvicorn --app-dir qa panel:app --host 127.0.0.1 --port 8120
```

Si ya tienes Microsoft Edge instalado, puedes usar `$env:LUDISIST_QA_BROWSER = 'msedge'` en lugar de descargar Chromium.

Para ejecutar Smoke desde consola con las terminales 1 y 2 activas, usa `.\qa\.venv\Scripts\python.exe qa/smoke_login.py` en una terminal con la misma contraseña configurada. La salida es 0 para `PASS`, 1 para `FAIL` y 2 para un error de ejecución.

Abre [Ludisist QA](http://127.0.0.1:8120). Selecciona el tipo de prueba y la suite, indica si quieres ejecutar todos los casos o solo algunos, y escribe el correo destinatario. En Smoke puedes activar **Demostrar un fallo controlado** para enviar una contraseña incorrecta a la cuenta de prueba durante esa corrida. El historial conserva los resultados por caso, las métricas de rendimiento, los informes descargables y el estado del correo. Los archivos y las evidencias se guardan en `qa/artifacts/`, agrupados por corrida y caso.

| Tipo | Suite | Casos |
| --- | --- | --- |
| Funcional | Smoke | Login válido desde el navegador y acceso a una página protegida. |
| Funcional | Sanity | Editar la descripción de un juego, comprobar la ficha con una nueva petición y restaurar la descripción. |
| Funcional | Regression | Repetir el login válido, comprobar el rechazo de credenciales incorrectas y recargar la clasificación pública de un torneo. |
| Funcional | Integration | Registrar un resultado y comprobar en una petición nueva que se conservan el ganador, los puntos y la posición. |
| Funcional | E2E | Iniciar sesión, crear un torneo, inscribir participantes, iniciar una ronda, registrar una victoria y consultar la clasificación desde el navegador. |
| No funcional | Rendimiento | Consultar el catálogo con 5 clientes concurrentes y 12 peticiones por cliente. El caso exige p95 de hasta 750 ms y hasta 1 % de errores. |

### Envío SMTP

Configura estas variables en la terminal del panel antes de iniciarlo:

| Variable | Valor |
| --- | --- |
| `LUDISIST_QA_SMTP_HOST` | Host de tu servidor SMTP |
| `LUDISIST_QA_SMTP_PORT` | Puerto del servidor, por defecto 587 para STARTTLS o 465 para SSL |
| `LUDISIST_QA_SMTP_SECURITY` | `starttls` por defecto, `ssl` para TLS implícito o `none` para un servidor de captura local |
| `LUDISIST_QA_SMTP_FROM` | Remitente autorizado por tu servidor |
| `LUDISIST_QA_SMTP_USER` | Usuario SMTP, cuando el servidor requiere autenticación |
| `LUDISIST_QA_SMTP_PASSWORD` | Contraseña SMTP, cuando el servidor requiere autenticación |

Para una demostración local puedes usar un buzón SMTP de captura en `127.0.0.1` con el puerto que tengas configurado y seguridad `none`. Para una entrega externa configura el servidor SMTP de tu cuenta. Cuando falla el envío, los archivos quedan disponibles y el botón **Reintentar envío** vuelve a utilizar los mismos adjuntos.

### Gmail desde PowerShell

Activa la verificación en dos pasos en la cuenta remitente y crea una [contraseña de aplicación de Google](https://myaccount.google.com/apppasswords). Con la instancia de pruebas de Ludisist activa, ejecuta desde la raíz:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\qa\start-gmail.ps1
```

Ingresa la dirección remitente, la contraseña de aplicación de Google y, si se solicita, la contraseña de Ludisist QA. El script configura SMTP solo para el proceso del panel. Mantén abierta la terminal y vuelve a `http://127.0.0.1:8120`. Selecciona Smoke e ingresa tu correo destinatario. Si ya tienes una ejecución con el destinatario correcto, puedes usar **Reintentar envío** desde su historial.
