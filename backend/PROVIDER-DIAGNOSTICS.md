# Diagnóstico temporal de Gemini — 23/09/2026

Autorizado por el usuario para el servicio que comunica como Live en Render.
No se han hecho llamadas reales a Gemini ni conexiones a Neon en estas pruebas.

Buscar exactamente el prefijo `GEMINI_PROVIDER_DIAGNOSTIC ` en los logs de Render
después de desplegar este commit y reproducir un fallo con consentimiento.
La línea contiene únicamente `exceptionName`, `httpStatus`, `googleStatus`,
`googleReasonOrCode`, `message` y `model`. El HTTP externo de AclaraDoc puede ser
503 para varias categorías: el código de Google es **httpStatus en esta línea**.

El SDK instalado conserva el HTTP en `ApiError.status` y el JSON de error en
`ApiError.message`. Antes de este cambio, 400, 401/403, 404 y 429 numéricos ya
tenían categorías distintas; solo 500/502/503 producían
`PROVIDER_TEMPORARY_ERROR`. El 504 ahora también se clasifica como temporal.
Los timeouts locales siguen siendo `TIMEOUT`. No se puede deducir la causa
concreta de Render solo por la duración o el código público.

El HTTP del SDK tiene prioridad; se admiten también cadenas numéricas y el código
del cuerpo JSON como alternativa. No se deduce HTTP a partir de texto libre.
Se conserva la pausa persistente por 429, sin reintentos ni cambio de modelo.

Privacidad: nunca se vuelca la excepción, stack, cuerpo, metadata, prompt,
adjuntos o respuesta del análisis. Nombre, status y reason usan listas
permitidas; un reason desconocido se sustituye por el código numérico de Google.
El mensaje se reduce a frases fijas reconocidas, máximo 240 caracteres; el texto
desconocido se omite por completo. No es una transcripción del mensaje original.
Esto evita depender de expresiones regulares para ocultar datos personales o
secretos arbitrarios. Un error de validación de la respuesta no genera esta línea.

Activado por defecto para este diagnóstico. Se puede desactivar inmediatamente
con `GEMINI_ERROR_DIAGNOSTICS=false` en el backend. Caduca automáticamente el
**30/09/2026 a las 00:00 UTC**. Retirar la instrumentación al terminar esta fase.

El repositorio conserva `autoDeployTrigger: off` en `render.yaml`. El push solo
desencadena un despliegue si el servicio existente tiene autodeploy activado;
en caso contrario, desplegar manualmente el commit desde Render.

Validación local: 10 pruebas focalizadas; `npm run verify` (tipos, ESLint,
20 pruebas frontend y 46 backend, compatibilidad Expo); compilación backend;
Expo Doctor 21/21; revisión de secretos de los archivos del diagnóstico.
Se corrigió una advertencia de importación duplicada y se repitió ESLint en
los archivos afectados. Las pruebas del SDK sustituyen `fetch`: comprueban
las nueve respuestas HTTP solicitadas, una sola llamada por error, extracción
de campos, privacidad, desactivación y caducidad. No verifican el servicio remoto.
