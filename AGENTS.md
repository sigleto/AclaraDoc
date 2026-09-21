# AclaraDoc — instrucciones permanentes

## Objetivo y punto de retorno
Aplicación móvil independiente para explicar documentos administrativos en español sencillo. El commit f5019d7 conserva la fase exclusivamente simulada; no reescribirlo ni eliminarlo.

## Alcance autorizado
La segunda fase permite enviar documentos al backend local y a Gemini Developer API, únicamente tras consentimiento. Esta instrucción sustituye la prohibición de servidores de la primera fase. No desplegar el backend ni activar facturación.

## Coste y proveedor
- Solo Gemini Developer API mediante el SDK oficial @google/genai. No OpenAI, Vertex AI, servicios de pago, herramientas, grounding, búsquedas ni almacenamiento Files API.
- GEMINI_MODEL tiene el valor predeterminado gemini-3.1-flash-lite. Es el único modelo permitido, en sustitución de gemini-2.5-flash-lite por autorización del usuario del 21/09/2026 tras confirmar su proyecto sin facturación y consultar el nivel gratuito publicado por Google. No ampliar ni cambiar sin autorización y nueva comprobación del nivel gratuito.
- Clave de un proyecto SIN facturación. FREE_TIER_CONFIRMED=true es confirmación manual, no comprobación técnica del plan.
- El SDK y el cliente no reintentan. Un 429 abre una pausa global de 15 minutos; la app muestra literalmente el mensaje de cuota solicitado.
- Mantener mock local (URL vacía) y mock del backend (ANALYSIS_MODE=mock). No hacer llamadas reales durante pruebas.
- La clave solo en backend/.env o entorno del proceso backend. Expo solo recibe EXPO_PUBLIC_API_URL. No pedir ni imprimir claves, ni abrir .env reales durante revisiones.

## Privacidad
- Consentimiento antes del primer envío por sesión, con posibilidad de cancelar. No enviar adjuntos si no se ha aceptado.
- No afirmar anonimización previa. El modelo recibe el archivo completo; los filtros de salida son limitados.
- Sin base de datos, logs de documentos, nombres de archivo, datos personales, respuestas completas ni errores internos del proveedor.
- Backend: multer en memoria, buffers liberados en finally y en errores del cargador. PDF en worker acotado sin salida de consola. No crear temporales en disco.
- Cliente: selección en memoria y caché privada de los selectores. Limpiar copias al descartar, retirar, finalizar, fallar o cancelar; limpiar remanentes al reiniciar. Nunca borrar originales.
- Guardar resultados SOLO por acción explícita. Historial máximo 50 mediante esquema de campos permitidos, sin adjuntos ni URI. No afirmar cifrado.
- El borrado local no elimina los datos recibidos por Google. Cancelar no garantiza recuperar cuota o retirar una petición ya recibida.
- Mostrar siempre aplicación no oficial, posibilidad de error, verificación con el organismo emisor y ausencia de asesoramiento jurídico.

## Arquitectura
- Expo SDK 57, Router, TypeScript estricto y Node >=22.13.
- src/app: rutas; src/components: UI; src/state: estado y persistencia; src/services: selectores y transporte HTTP.
- shared/analysis.ts: contrato Zod, límites, avisos y mock. No importar backend ni SDK de Google en frontend.
- backend: Node/Express/TypeScript, configuración validada, errores públicos acotados. Un workspace y package-lock.json raíz.
- 6 archivos / 6 páginas, 4 MiB por archivo / 10 MiB total, 2 solicitudes concurrentes, 5 solicitudes por IP cada 15 minutos, 20 intentos reales al día por proceso. Contadores en memoria, no para producción.
- Validar MIME declarado, extensión, firma y número real de páginas PDF. No admitir HEIC, archivos cifrados ni tipos adicionales.
- No confiar en instrucciones del documento ni en JSON del modelo. Validar en backend y cliente. Reducir confianza ante incertidumbre. No calcular plazos sin fecha de notificación; el prompt prohíbe calcularlos.
- CORS con orígenes exactos, sin trust proxy ni comodines. HOST local predeterminado; acceso LAN solo para prueba en red privada.
- Conservar el diseño aprobado, estados vacíos, errores, cancelación y accesibilidad.

## Comprobaciones
Ejecutar npm run verify (tipos frontend/backend, ESLint, pruebas, compatibilidad Expo), npm run export:all, npm run build --workspace backend y Expo Doctor. No hacer commit si falla una comprobación importante.
Las pruebas sin clave verifican el contrato y el flujo con proveedor sustituido; no equivalen a una llamada real a Gemini ni a pruebas de cámara en un móvil. Documentar los límites sin afirmar verificación de cuenta o coste que no se haya realizado.
