# Proyecto de Automatización TQA

Ludisist QA ejecuta pruebas funcionales y de rendimiento sobre una instancia local de Ludisist. Desde el panel puedes elegir una suite o casos específicos, consultar el resultado y obtener un PDF con evidencias y un resumen HTML. Si configuras SMTP, el panel envía ambos archivos al destinatario indicado.

## Instalación y demostración

Sigue la [guía de instalación y ejecución](qa/README.md). El panel se abre en `http://127.0.0.1:8120` y la aplicación bajo prueba en `http://127.0.0.1:3101`. La API de prueba utiliza una base SQLite temporal y crea sus cuentas y datos en cada arranque.

En el panel, elige **Funcional → Smoke**, selecciona el caso de inicio de sesión e ingresa el correo destinatario. Al terminar, abre **Historial** para ver los resultados y los adjuntos. También puedes ejecutar Sanity, Regression, Integration, E2E y Rendimiento.

| Ruta | Contenido |
| --- | --- |
| [qa/](qa/) | Panel web, orquestador, suites, informes y configuración del correo. |
| [backend/](backend/) y [frontend/](frontend/) | Código de Ludisist utilizado como aplicación bajo prueba. |
| [evidencias/](evidencias/) | Ejemplos de PDF y HTML generados en ejecuciones verificadas. |

## Evidencias

| Ejecución | Informe PDF | Resumen HTML |
| --- | --- | --- |
| Smoke aprobado | [PDF](evidencias/smoke-pass/informe.pdf) | [HTML](evidencias/smoke-pass/resumen.html) |
| Smoke con fallo controlado | [PDF](evidencias/smoke-fallo-controlado/informe.pdf) | [HTML](evidencias/smoke-fallo-controlado/resumen.html) |
| Rendimiento del catálogo | [PDF](evidencias/rendimiento/informe.pdf) | [HTML](evidencias/rendimiento/resumen.html) |

Los archivos HTML se pueden descargar y abrir en el navegador. Los ejemplos usan cuentas y datos sintéticos del ambiente QA.
