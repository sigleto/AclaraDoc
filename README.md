# AclaraDoc

Prototipo Expo SDK 57, React Native, Expo Router y TypeScript para explicar documentos administrativos. La segunda fase incorpora un backend local Node/Express con Gemini Developer API, consentimiento previo y guardado voluntario de resultados. El commit f5019d7 permanece como punto de retorno.

## Instalar y probar sin consumir cuota

Requiere Node >=22.13 (ver .nvmrc). Se incluye Node 22 local para los scripts npm; es preferible actualizar tu Node global con tu gestor habitual. Desde la raíz:

```powershell
npm ci
npm start
```

Sin EXPO_PUBLIC_API_URL la app usa mock local y no realiza envíos. No hace falta clave ni backend. El resultado está marcado como ficticio.

Para probar todo el circuito HTTP sin Google:

1. Copia backend/.env.example a backend/.env. Mantén ANALYSIS_MODE=mock y GEMINI_API_KEY vacía.
2. Copia .env.example a .env en la raíz y escribe EXPO_PUBLIC_API_URL=http://localhost:3001 para web en el PC.
3. Ejecuta en una terminal npm run backend:start y en otra npm run web.
4. Abre http://localhost:3001/health. Debe devolver status=ok y mode=mock.
5. Selecciona una imagen de prueba o PDF, acepta el consentimiento y analiza. El backend valida los archivos pero devuelve un ejemplo, sin contactar con Google.

El consentimiento se conserva únicamente durante la sesión. Cancelar ese aviso no envía nada y conserva la selección. Tras un intento de análisis (éxito, error o cancelación) se limpian las copias de los adjuntos. El resultado solo se persiste al pulsar Guardar resultado.

## Crear una clave gratuita de Gemini

El 21/09/2026 se autorizó sustituir `gemini-2.5-flash-lite` por `gemini-3.1-flash-lite`, tras confirmar el usuario que su proyecto no tiene facturación. La lista permitida sigue conteniendo un único modelo. Para instalaciones anteriores, cambia solo `GEMINI_MODEL=gemini-3.1-flash-lite` en `backend/.env` y reinicia el backend. La confirmación del usuario no equivale a una comprobación técnica de facturación.

La petición usa `thinkingLevel=MINIMAL`, conserva el límite de 6000 tokens de salida y deja la temperatura predeterminada recomendada para Gemini 3. No se habilitan herramientas, búsquedas, caché ni Files API. Referencia: [guía de migración de Gemini 3](https://ai.google.dev/gemini-api/docs/gemini-3).

No se ha creado ninguna clave ni habilitado facturación como parte de este proyecto.

1. Accede a [Google AI Studio — API keys](https://aistudio.google.com/api-keys) con tu cuenta. Sigue los términos y requisitos de disponibilidad que presente Google.
2. Crea una clave con Create API key y selecciona un proyecto nuevo o existente **sin cuenta de facturación vinculada**. AI Studio puede crear un proyecto inicial automáticamente.
3. En los proyectos de AI Studio comprueba que figura **Free tier**. Verifica también que el proyecto no tiene facturación activa. No pulses Set up billing/Upgrade, no vincules tarjeta ni actives pruebas de pago.
4. Restringe la clave a Gemini API mediante la opción de AI Studio si no está ya restringida. No la pegues en chats, capturas, frontend, app.json ni variables EXPO_PUBLIC.
5. Copia únicamente el valor al archivo backend/.env, en GEMINI_API_KEY. No lo muestres en consola. Cambia ANALYSIS_MODE a gemini y FREE_TIER_CONFIRMED a true después de verificar el paso 3. Mantén GEMINI_MODEL=gemini-3.1-flash-lite.
6. Reinicia el backend. Prueba primero con un documento ficticio sin datos personales.

Configuración (sin una clave real):

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
ANALYSIS_MODE=gemini
FREE_TIER_CONFIRMED=true
HOST=127.0.0.1
PORT=3001
CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
```

Solo backend/.env contiene la clave real. Git ignora .env en cualquier carpeta y versiona únicamente los ejemplos. Puedes comprobarlo sin imprimir el contenido:

```powershell
git check-ignore .env backend/.env
git status --short
```

Google publica un nivel gratuito para este modelo, sujeto a disponibilidad y cuotas de tu proyecto. La clave por sí sola no informa al código del plan de facturación: FREE_TIER_CONFIRMED es una confirmación manual. Si Google no ofrece el modelo o cuota a tu cuenta, la aplicación informa del error y **no cambia de modelo ni activa pagos**. No existe una garantía técnica de gratuidad si alguien vincula posteriormente facturación al proyecto.

Referencias oficiales: [claves](https://ai.google.dev/gemini-api/docs/api-key), [precios](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite), [cuotas](https://ai.google.dev/gemini-api/docs/rate-limits), [retiradas de modelos](https://ai.google.dev/gemini-api/docs/deprecations).

## Probar desde un móvil real

El PC y el teléfono deben estar en la misma red privada. **localhost en el móvil apunta al propio teléfono, no al PC.**

1. Consulta con ipconfig la IPv4 del adaptador Wi-Fi del PC, por ejemplo 192.168.1.50.
2. En backend/.env cambia HOST a 0.0.0.0. Reinicia npm run backend:start.
3. En el .env raíz pon EXPO_PUBLIC_API_URL=http://192.168.1.50:3001, sustituyendo esa IP por la de tu PC.
4. Reinicia Expo con npm start -- --clear y abre el QR con Expo Go compatible con SDK 57.
5. Desde el navegador del teléfono abre http://192.168.1.50:3001/health para comprobar conectividad. Si falla, revisa red invitada/aislamiento Wi-Fi y permite el puerto 3001 solo en el perfil privado del cortafuegos, sin desactivarlo.
6. Prueba selección múltiple, cámara, PDF multipágina, consentimiento, cancelar, resultado y guardado voluntario.

Para web por IP LAN, añade el origen web exacto (por ejemplo http://192.168.1.50:8081) a CORS_ORIGINS. Las apps nativas normalmente no envían Origin; CORS no autentica usuarios. No publiques el puerto, no uses túneles, no despliegues este backend. HTTP local no cifra el contenido: usa documentos ficticios o con datos ocultados previamente y una red de confianza. Para una aplicación distribuida se necesitaría HTTPS y autenticación, fuera de esta fase.

## API, límites y errores

- GET /health: estado, modo y límites, nunca clave.
- POST /api/analyze: multipart/form-data, campo repetido files, cabecera X-AclaraDoc-Consent: accepted-v1.
- JPG/JPEG, PNG y PDF no cifrados. MIME, extensión y firma deben concordar.
- Máximo 6 adjuntos, 6 páginas totales (PDF contado realmente), 4 MiB por archivo y 10 MiB total.
- Hasta 2 solicitudes simultáneas; 5 peticiones por IP en 15 minutos; máximo local de 20 intentos reales al día UTC. Los contadores se reinician con el proceso, no representan la cuota oficial de Google.
- 30 s para cargar, 3 s por validación PDF, 45 s para Gemini, 60 s de timeout en la app.
- Un solo intento, sin reintentos automáticos. Tras un 429 de Google se pausa el proveedor 15 minutos. La app muestra: “Se ha alcanzado temporalmente el límite gratuito de análisis. Inténtalo más tarde.”
- Error 413 para tamaño o páginas, 415 para formato, 502 para respuesta inválida, 503 para indisponibilidad/configuración/modelo y 504 para timeout. Los mensajes no contienen errores internos.
- El modelo se toma de GEMINI_MODEL pero esta prueba permite exclusivamente gemini-3.1-flash-lite. La restricción evita introducir accidentalmente otro modelo sin revisión de coste.

## Contrato del resultado

shared/analysis.ts define y valida los campos pedidos: titulo, resumenSencillo, organismoEmisor, tipoComunicacion, esMeramenteInformativo, requiereActuacion, accionesRecomendadas, fechasDetectadas, plazos, consecuenciasDeNoActuar, documentosQuePuedeNecesitar, viasDeContactoMencionadas, advertencias, partesIlegibles, nivelConfianza, necesitaRevisionProfesional, motivoRevisionProfesional y avisoLegal.

Los enunciados usan { texto, origen }, con hecho, interpretacion o no_consta. Las fechas distinguen texto literal y fecha ISO; los plazos indican fecha de notificación, vencimiento y si se calcularon. El prompt pide no calcular plazos. La validación rechaza cálculos sin fecha de notificación, contradicciones y fechas imposibles. Los campos desconocidos se descartan; los ilegibles reducen confianza; el aviso legal se fija en el backend.

El SDK oficial @google/genai usa generateContent con inlineData y JSON Schema, sin herramientas, Files API, caché de contenido o grounding: [documentos](https://ai.google.dev/gemini-api/docs/generate-content/document-processing), [salida estructurada](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

## Privacidad y límites de las garantías

La app no anonimiza los adjuntos. Antes del envío muestra el consentimiento solicitado, incluida la posibilidad de uso de los datos por Google en el nivel gratuito. Oculta los datos sensibles tú mismo antes de seleccionarlos.

El backend no escribe documentos en disco ni usa base de datos. Mantiene buffers en memoria durante la solicitud, los sobrescribe al terminar y libera referencias. La conversión base64 y el SDK pueden mantener copias hasta la recolección de basura; esto no es un borrado forense de RAM. El parser PDF corre en un worker con tiempo/memoria limitados y consola aislada, para no registrar contenido de archivos malformados.

Las copias locales de ImagePicker y DocumentPicker se eliminan al quitar, descartar o finalizar cualquier intento; remanentes tras un cierre se limpian al próximo inicio. Los originales no se borran. Un fallo de limpieza se comunica.

Cancelar aborta la espera y solicita abortar el proveedor; no deshace datos recibidos por Google ni cuota ya consumida. No podemos borrar los datos de Google desde AclaraDoc. Se instruye al modelo para omitir identificadores y hay filtros de salida para patrones comunes; no garantizan detectar todos los datos personales o impedir toda inyección de instrucciones.

El historial se guarda solo a petición, hasta 50 resultados, sin adjuntos ni nombres/URI. No está cifrado; los resultados pueden ser sensibles. Los antiguos resultados simulados se leen como ejemplos compatibles. Se puede borrar el historial desde la app.

## Estructura y verificación

- src/app: cinco rutas conservando la interfaz previa.
- src/services: selección, HTTP y serialización de historial.
- src/state/AppProvider.tsx: sesión, consentimiento, cancelación y guardado.
- shared/analysis.ts: contrato común, límites y mock.
- backend/src: Express, configuración, carga, parser PDF, Gemini y errores.
- backend/tests y tests: validación, privacidad, cuota y transporte.
- AGENTS.md y VERIFICATION.md: reglas permanentes y evidencia.

```powershell
npm run verify
npm run build --workspace backend
npm run export:all
npx expo-doctor
```

Las pruebas sustituyen al proveedor y no consumen cuota. Comprobaciones manuales pendientes: llamada con tu clave gratuita, permisos y selectores en Android/iOS, cancelación durante envío, pérdida de red, borrado de caché y reinicio con/sin guardado. Consulta VERIFICATION.md para distinguir lo probado de lo pendiente.
