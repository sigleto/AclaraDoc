# Verificación de la segunda fase — 20 de septiembre de 2026

## Diagnóstico de errores del proveedor — 21 de septiembre de 2026

El mensaje genérico de indisponibilidad ocultaba tanto rechazos HTTP 400 como errores temporales de Google. Se añadieron categorías públicas fijas para petición rechazada, esquema rechazado, nivel gratuito no disponible y fallos 500/502/503. Los textos internos del proveedor solo se inspeccionan en memoria para clasificar un 400; no se registran ni se envían al cliente. El frontend usa su propia lista de mensajes permitidos.

Se comprobó la serialización y lectura de respuestas del SDK `@google/genai` instalado, interceptando `fetch` con datos sintéticos y sin tráfico externo. Esta prueba descarta un fallo local en ese recorrido, pero no demuestra que Google acepte la solicitud real ni identifica el error anterior del usuario: queda pendiente el resultado del siguiente intento manual con los mensajes nuevos.

Comprobaciones: 13 pruebas de cliente y 20 de backend aprobadas, tipos, ESLint y compatibilidad Expo mediante `npm run verify`; exportaciones Android/iOS/web, compilación backend y Expo Doctor (21/21) aprobados. Se mantuvieron modelo, configuración de cuenta y límites; no se abrieron `.env` ni se hicieron llamadas reales a Gemini. Las comprobaciones Expo usaron `EXPO_NO_DOTENV=1`.

## Cambio autorizado de modelo — 21 de septiembre de 2026

El usuario confirmó que su proyecto está sin facturación y autorizó sustituir `gemini-2.5-flash-lite` por `gemini-3.1-flash-lite`. Se actualizaron el valor predeterminado, la restricción a un único modelo, el ejemplo de configuración, README y AGENTS.md. En `backend/.env` se sustituyó exclusivamente la línea conocida `GEMINI_MODEL`, mediante un parche sin mostrar ni revisar el archivo de secretos. No se modificó la clave ni se activó facturación.

Se comprobó el [nivel gratuito publicado](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite), la compatibilidad con [imágenes, PDF y JSON estructurado](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), y la [guía de Gemini 3](https://ai.google.dev/gemini-api/docs/gemini-3). Se usa `thinkingLevel=MINIMAL` en lugar de `thinkingBudget=0` y se omite `temperature` para emplear el valor predeterminado recomendado. Se conservan 6000 tokens de salida, el consentimiento, todos los límites locales, la pausa por 429, un único intento y la ausencia de herramientas, caché y Files API.

Verificación aprobada: `npm run verify` (12 pruebas de cliente y 18 de backend), `npm run export:all`, `npm run build --workspace backend` y `npx expo-doctor` (21/21). Las pruebas comprueban el nuevo modelo/parámetros, el rechazo del modelo anterior y la ausencia de fallback/reintentos ante un 404; usan proveedor sustituido. Se usó `EXPO_NO_DOTENV=1` en las comprobaciones Expo. No se realizaron llamadas reales a Gemini ni se comprobó técnicamente la cuenta, facturación o cuota del usuario. La disponibilidad del nuevo modelo para esa cuenta sigue pendiente de la prueba manual.

## Corrección de subida nativa — 21 de septiembre de 2026

El `fetch` global de Expo 57 usa el serializador de `expo/fetch`, que rechaza las partes antiguas `{ uri, type, name }`. El fallo se producía antes de la petición HTTP y el cliente lo presentaba como un error de conexión. La subida nativa ahora aporta `bytes()` mediante `File` de `expo-file-system`, con nombre generado y MIME explícito. Comprueba existencia y tamaño real sin crear copias adicionales en disco.

Se añadieron tres pruebas con el parche FormData y el serializador de la versión instalada de Expo: reproducción del rechazo anterior, decodificación multipart del nuevo formato con bytes/MIME/nombres genéricos, y rechazo de archivos ausentes o demasiado grandes antes de leerlos. La prueba no carga módulos nativos de cámara ni reproduce por sí sola un envío desde un teléfono.

Comprobaciones aprobadas: `npm run verify` (12 pruebas de cliente y 17 de backend), `npm run export:all` (Android, iOS y web), `npm run build --workspace backend` y Expo Doctor (21/21). Las comprobaciones Expo se ejecutaron con `EXPO_NO_DOTENV=1`. Pruebas/exportación requirieron salir de la restricción de subprocesos; Doctor necesitó acceso al registro npm. No se leyeron archivos `.env`, no se enviaron documentos a Gemini ni se verificaron cuenta, facturación o cuota. Pendiente confirmar captura y envío en el móvil con la app recargada.

## Comprobaciones automatizadas

- `npm run verify`: aprobado; tipos frontend/backend, ESLint, 9 pruebas de cliente/contrato/historial, 17 pruebas de backend y compatibilidad de dependencias Expo.
- `npm run build --workspace backend`: aprobado.
- `npm run export:all`: exportados Android e iOS con Hermes y web con rutas estáticas. No equivale a compilar APK/IPA ni a probar en dispositivo.
- `npx expo-doctor`: 21 de 21 comprobaciones aprobadas.
- Se desactivó la carga automática de archivos `.env` en las comprobaciones Expo mediante `EXPO_NO_DOTENV=1`. No se abrieron archivos de secretos ni se hicieron llamadas reales a Gemini.
- Las pruebas y la exportación necesitaron ejecución fuera del entorno restringido por `spawn EPERM`; Expo Doctor necesitó acceso al registro npm.

Las pruebas cubren consentimiento HTTP, CORS, MIME/extensión/firma, tamaño y páginas PDF reales, límite por IP, pausa compartida tras 429, límite de dos solicitudes simultáneas y veinte intentos diarios (incluidos fallidos) con reinicio al cambiar el día UTC. También cubren respuesta inválida, timeout, desconexión y sobrescritura de buffers, validación del contrato e historial sin adjuntos.

Se corrigió el cierre del servidor de la prueba de desconexión: abortar la petición dejaba abierto el servidor implícito de Supertest y podía impedir que la suite terminara.

## Límites y pendientes

El proveedor se sustituye en las pruebas. No se verificaron una cuenta de Google, su facturación, cuota disponible ni una respuesta real de Gemini. No se desplegó el backend ni se activó facturación.

Pendientes en Android/iOS: permisos, cámara, selectores, PDF multipágina, consentimiento de sesión, cancelación durante el envío, pérdida de red, limpieza de caché y reinicio con/sin guardado. La comprobación HTTP de consentimiento no sustituye un recorrido interactivo de la interfaz. El borrado de buffers no garantiza eliminar todas las copias de memoria del SDK; cancelar no retira una petición ya recibida por Google.

El commit `f5019d7` se conserva como punto de retorno a la fase simulada. Esta continuación no crea commits.

## Evidencia histórica de la primera versión

Lo siguiente corresponde exclusivamente a la primera fase; la auditoría de dependencias no se ha repetido para la segunda fase.

- Expo SDK 57.0.24, consultado en npm (`latest`) el 20 de septiembre de 2026. SDK 58 estaba en preview.
- TypeScript estricto y ESLint: sin errores.
- Pruebas de servicios: 5 aprobadas (selección multipágina mixta, rechazo de selección vacía, exclusión de adjuntos al persistir, datos corruptos y límite de historial).
- `expo install --check`: dependencias compatibles.
- Expo Doctor: 21 de 21 comprobaciones aprobadas.
- Exportación Metro/Hermes para Android, iOS y web: generada correctamente. Esto no equivale a compilar APK/IPA o probar en dispositivo.
- Los subprocesos de pruebas y Hermes requirieron ejecución fuera del entorno restringido por errores `spawn EPERM`.

## Pendiente de dispositivo

No había navegador conectado, emulador ni teléfono disponible para pruebas interactivas. Es necesario recorrer la lista manual del README, especialmente permisos, cámara, proveedores PDF, limpieza de caché nativa y persistencia tras reinicio.

## Auditoría de dependencias

`npm audit --omit=dev` informa de 14 avisos moderados, ninguno alto o crítico, propagados principalmente desde `uuid`/`xcode` y `decode-uri-component`/`query-string` a las herramientas de Expo y Expo Router. Las soluciones automáticas sugeridas cambian versiones principales y retroceden Expo a SDK 46 o Router a 5; no se aplicaron por incompatibilidad. Revisar las actualizaciones oficiales de SDK 57 antes de publicar. La aplicación no utiliza enlaces externos para analizar documentos ni invoca servicios remotos.

## Git

create-expo-app inicializó Git y creó el commit de plantilla. La implementación funcional se registra en un commit posterior para conservar ese origen sin reescribir el historial.
