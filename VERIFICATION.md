# Verificación de AclaraDoc

## Sonda Workers — 22 de septiembre de 2026

Partida limpia en 3b5fc20. Se incorpora exclusivamente una sonda local separada:
multipart, comprobaciones básicas de imágenes, Base64, serialización del SDK
oficial con transporte simulado y respuesta Zod. Once casos funcionales pasan,
incluido seis archivos con 10 MiB. El presupuesto de recursos Free no se aprueba:
la estimación CDP local es 191–356 ms; el contraste Node tiene mediana 156 ms.
Estas cifras no son CPU facturada ni prueban un fallo remoto. Método, resultados,
memoria y limitaciones completos en [worker/VIABILITY.md](worker/VIABILITY.md).

Se detiene la implementación según la puerta de viabilidad; capacidades, cambios
de Expo, D1 y Worker de producción siguen pendientes. No se modificó el parser
PDF, no se leyeron .env ni se realizaron llamadas a Gemini. No hay recursos
externos ni despliegue. No se crea commit de migración completada.

Verificación final de esta sonda y de ausencia de regresiones:

- `npm run verify`: aprobado; tipos frontend/backend/sonda, ESLint, 20 pruebas
  de cliente, 32 de backend y compatibilidad Expo.
- `npm run worker:probe`: once casos funcionales aprobados, incluido 10 MiB,
  compilación esbuild en memoria y SDK ejecutado en workerd con fetch sustituido.
  El éxito del comando no aprueba el presupuesto Free documentado.
- `npm run build --workspace backend`: aprobado.
- `npm run export:all`: Android, iOS y ocho rutas web exportadas.
- Expo Doctor: 21/21 comprobaciones aprobadas.
- `.env`, `.dev.vars`, estado `.wrangler` y bases locales están ignorados; no hay
  archivos sensibles versionados. La revisión por patrones no detectó claves
  Google ni claves privadas en fuentes, sonda o exportaciones. No garantiza
  detectar cualquier secreto. Expo se ejecutó con `EXPO_NO_DOTENV=1`.
- `git diff --check`: aprobado. Ningún archivo de `src/` ni `backend/src/` cambia;
  las pruebas mantienen PDF local válido y rechazan PDF malformado o excesivo.
  No se ha repetido una prueba nativa en el teléfono ni una llamada real a Google.
- Las versiones de paquetes existentes en el lockfile se conservan; se añaden
  las herramientas de la sonda. npm mantiene 14 avisos moderados de auditoría,
  pendientes antes de publicación; no se aplicaron actualizaciones automáticas.

## Selección de PDF en Android — 22 de septiembre de 2026

Ante el mensaje «La copia del archivo ya no está disponible», se revisó el código nativo de las dependencias instaladas. DocumentPicker 57 copia en `context.cacheDir`, mientras que FileSystem e ImagePicker usan `appContext.cacheDirectory`; FileSystem devuelve `exists=false` también cuando deniega el acceso. Esta diferencia de ámbito en Expo Go es compatible con el fallo comunicado, aunque no se ha inspeccionado el teléfono para confirmar su ruta concreta.

En Android, la selección de PDF ahora usa `File.pickFileAsync` y copia los archivos seleccionados a `Paths.cache/DocumentPicker`, dentro del ámbito del lector. Se espera a que cada copia termine y se comprueba su existencia y tamaño real antes de añadirla a la selección. Solo se copian originales: nunca se mueven ni se eliminan. La limpieza existente elimina las copias al retirar, terminar, fallar, cancelar o reiniciar; un fallo durante la preparación elimina también las copias parciales. iOS y web conservan su selector anterior. Referencia: [selector de FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/#pickfileasyncoptions).

Se añaden pruebas de preparación asíncrona, originales intactos, limpieza parcial, mensajes sin errores nativos, número de archivos y tamaños reales. No se realizan llamadas a Gemini ni se amplían límites. Queda probar en el teléfono el mismo PDF desde Descargas y desde su proveedor habitual después de recargar Expo y volver a seleccionarlo.

Comprobaciones aprobadas: `npm run verify` (20 pruebas de cliente y 32 de backend, tipos, ESLint y compatibilidad Expo), compilación del backend, exportación Android/iOS/web y Expo Doctor 21/21. Las pruebas no ejecutan el selector nativo de un teléfono; comprueban el manejo y limpieza de las copias mediante un adaptador sustituido.

## Control de consumo — 22 de septiembre de 2026

El usuario confirmó que el estado anterior funcionaba en un móvil real y había analizado una factura con Gemini 3.1 Flash Lite. Git tenía pendientes las correcciones de esquema, previamente verificadas; se guardaron en `3efa413` como punto de retorno antes de comenzar esta fase. Se conservan `46bfd54` y `f5019d7`. La confirmación del recorrido móvil procede del usuario, no de una prueba de cámara realizada por el agente.

Implementado: configuración de límites con rangos y valores seguros; UUID v4 de instalación con SecureStore (localStorage en web); cuotas diarias por instalación y global, IP temporal y concurrencia; QuotaStore en memoria y SQLite con transacciones, HMAC y purga; pausa persistente tras 429 de Google; métricas por lista permitida e identificador de solicitud; mensajes diferenciados, tiempo de espera e indicador de consumo en revisión y resultado. Se mantiene el esquema del resultado y el historial. El prompt distingue documentos privados de administrativos y refuerza la omisión de identificadores, incluido CUPS.

Se configuró exclusivamente el nuevo `QUOTA_HASH_SECRET` mediante el comando de mantenimiento `quota:secret`: genera 32 bytes aleatorios, no imprime el secreto y conserva las demás variables. No se mostraron ni inspeccionaron archivos `.env` mediante herramientas de revisión. La clave de Google y el modelo no se cambiaron. Las comprobaciones Expo usaron `EXPO_NO_DOTENV=1`. No se enviaron documentos ni se hicieron llamadas reales a Gemini en esta fase.

Comprobaciones finales:

- `npm run verify`: tipos de frontend/backend, ESLint, 17 pruebas de cliente y 32 de backend, compatibilidad Expo.
- `npm run build --workspace backend`: compilación correcta.
- `npm run export:all`: Android, iOS y ocho rutas web exportados correctamente; no equivale a generar APK/IPA.
- Expo Doctor: 21/21 comprobaciones aprobadas.
- `git diff --check`: sin errores. Comprobados los archivos versionados y candidatos: ningún `.env` real, SQLite, PDF/documento de prueba ni clave detectada por los patrones revisados. Los ejemplos sin secretos se versionan; las bases locales y auxiliares están ignorados. Esta revisión por patrones no es una garantía general de detección de secretos.

Las pruebas cubren creación/persistencia/reutilización simultánea del UUID, UUID ausente o inválido, tres intentos y cuarto rechazado, cambio de día UTC, instalaciones independientes, IP compartida y cabeceras de proxy no confiables, presupuesto global de veinte, dos análisis simultáneos, ausencia de consumo previo al proveedor, errores posteriores que sí cuentan, compatibilidad mock y privacidad de errores/métricas. SQLite se cierra y reabre entre dos instancias de la app para verificar contadores y pausa; dos conexiones comparten el presupuesto global. Se comprueba purga tanto en los almacenes como al iniciar la app. Todos los proveedores y el transporte externo de las pruebas están sustituidos.

En una ejecución simultánea de pruebas y exportación falló una prueba de backend; la suite completa posterior, ejecutada sin la exportación en paralelo, pasó. No se ha atribuido una causa definitiva a ese fallo aislado ni se han ampliado los tiempos o límites para ocultarlo.

`npm audit --omit=dev` se volvió a consultar: 14 avisos moderados, ninguno alto ni crítico, en la cadena de herramientas Expo/Router. Las correcciones automáticas proponen cambios incompatibles de versiones principales; no se aplicaron. Esto sigue pendiente antes de publicar y no impide conservar este prototipo local verificado.

Pruebas manuales de esta fase, pendientes en el móvil:

1. Reiniciar backend y Expo, cerrar y volver a abrir la app. Confirmar que no pide permisos nuevos ni muestra el UUID; rechazar primero el consentimiento y comprobar que no se envía nada.
2. Con documentos ficticios o datos previamente ocultados, comprobar tres análisis durante el día, descenso del indicador y cuarto intento bloqueado. No hace falta agotar cuotas de Google: sus errores y pausas se simulan en la suite.
3. Reiniciar la app y el backend tras consumir un intento: el siguiente análisis debe continuar el contador, sin reiniciarlo. El indicador vuelve a estar disponible con la siguiente respuesta del backend.
4. Comprobar que una instalación distinta tiene su propio contador, teniendo en cuenta que ambas comparten el límite de conexión y el global.
5. Pulsar analizar rápidamente dos veces, cancelar un análisis y cortar la red: no debe haber reintento automático; se deben descartar las copias y ofrecer repetir solo cuando corresponda. Repetir requiere seleccionar de nuevo.
6. Verificar fotos, PDF multipágina, guardado y lectura del historial anterior, eliminación de copias y documentos no administrativos. Para comprobar el circuito sin consumo, usar mock; los contadores reales no se descuentan en mock.

Limitaciones para publicación: el UUID se puede falsificar o restablecer y no autentica personas; IP/concurrencia no están coordinadas entre procesos; SQLite local no debe sincronizarse con OneDrive (el workspace actual está dentro de OneDrive). Falta HTTPS, medidas de acceso/abuso, revisión de privacidad y condiciones del proveedor, actualización de dependencias y pruebas nativas completas. En web se necesita localhost o HTTPS para la generación criptográfica; su almacenamiento local no es SecureStore. En iOS el llavero puede sobrevivir a reinstalaciones. Un cierre abrupto entre reserva local y envío puede descontar conservadoramente un intento. El prompt y los filtros no garantizan ausencia de datos personales ni inmunidad a instrucciones maliciosas. No se comprobó técnicamente la facturación, no se activó ningún servicio de pago y no se desplegó ni publicó la aplicación.

## Evidencia histórica de la segunda fase — 20–21 de septiembre de 2026

## Configuración aceptada por Google — 21 de septiembre de 2026

El usuario autorizó hasta dos llamadas adicionales, sin adjuntos ni reintentos, deteniéndose si fallaba la primera. Ambas se ejecutaron con el SDK oficial, el modelo permitido y texto ficticio: la petición mínima fue aceptada; la segunda, con el esquema simplificado, las instrucciones del sistema de la app y un máximo de 6000 tokens, también fue aceptada y su respuesta superó `validateAnalysis`. No se imprimieron respuestas completas, claves ni errores internos. Se eliminó el script temporal. No se hicieron más llamadas reales.

Se aplicó exactamente esa combinación al generador del backend: esquema derivado del contrato compartido, limitado a campos, tipos, elementos, enumeraciones, obligatoriedad y alternativas nulas, sin configuración explícita de razonamiento. La validación Zod completa sigue ejecutándose después de la generación y en el cliente, conservando límites, fechas válidas y coherencia. La comparación prueba que esa combinación funciona; no identifica por separado cuál de los parámetros anteriores provocaba el 400. La cuenta/modelo aceptó las llamadas en ese momento, pero no se verificó técnicamente facturación ni cuota y queda pendiente el recorrido con foto en el móvil.

`npm run verify` aprobado (13 pruebas de cliente y 22 de backend), incluidas preservación de campos y rechazo local de longitudes/listas/fechas/coherencia inválidas. `npm run export:all`, `npm run build --workspace backend` y Expo Doctor (21/21) aprobados. La suite automatizada usa proveedor/red sustituidos; Expo se ejecutó con `EXPO_NO_DOTENV=1`. No se activó facturación ni se cambió el modelo.

## Diagnóstico real autorizado — 21 de septiembre de 2026

Con autorización explícita para una única llamada, se ejecutó `generateContent` mediante `@google/genai` con `gemini-3.1-flash-lite`, los mismos parámetros/esquema de la app y un texto ficticio de biblioteca, sin adjuntos. Se mantuvieron un único intento y el timeout de 45 segundos. Google devolvió HTTP 400 con una categoría genérica de argumento inválido; no se identificó un campo concreto. Solo se mostró esa clasificación acotada, sin claves, respuesta completa ni mensajes internos. El archivo temporal del diagnóstico se eliminó tras ejecutarlo.

Este resultado reproduce el rechazo sin cámara ni archivos, pero no distingue todavía entre restricciones de cuenta/modelo y formato de la solicitud. No demuestra que el esquema sea la causa ni verifica facturación o cuota. No se realizó una segunda llamada ni se cambió el modelo. Las comprobaciones automatizadas de las secciones siguientes siguen usando proveedores sustituidos.

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
