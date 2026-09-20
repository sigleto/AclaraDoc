# AclaraDoc

Prototipo React Native + Expo SDK 57 + TypeScript + Expo Router. Interfaz en español. Sin API, cuentas, pagos, OCR ni transmisión de documentos.

## Ejecutar

Requiere Node >=22.13 (ver .nvmrc). También se incluye Node 22 como dependencia de desarrollo local para ejecutar los scripts npm sin cambiar la instalación global.

```sh
npm ci
npm start
# o npm run android / npm run ios / npm run web
```

Abrir el QR con una versión de Expo Go compatible con SDK 57. La compilación nativa de iOS requiere macOS. Los iconos son provisionales de la plantilla Expo.

## Flujo

Inicio → fotografiar, seleccionar varias imágenes o seleccionar PDF → revisión (añadir, quitar, reordenar) → resultado simulado → historial local. Información y privacidad explica los límites.

Cada foto o imagen representa una página. Es posible fotografiar páginas sucesivamente. Los PDF se adjuntan completos, incluidos los multipágina; no hay visor PDF, OCR ni extracción o recuento de páginas. La simulación no accede al contenido y muestra un ejemplo ficticio, sin fechas ni confianza inventadas.

## Privacidad y almacenamiento

La selección vive en memoria. AsyncStorage conserva como máximo 50 resultados, mediante una lista explícita de campos, sin imágenes, PDF, URI ni nombres originales. Se puede borrar todo el historial con confirmación. El almacenamiento no está cifrado por la aplicación; Android tiene las copias de seguridad desactivadas. Las políticas del sistema operativo pueden afectar a los datos locales.

Las copias temporales de imágenes del selector se limpian al quitar un adjunto, descartar o finalizar; tras un cierre inesperado se limpian al arrancar de nuevo. No se eliminan originales. Los PDF se seleccionan sin copiar a caché. Un proveedor de archivos en la nube puede descargar archivos por su cuenta. No se incorporan analítica ni peticiones de red de aplicación. El servidor Metro solo se usa durante desarrollo.

## Estructura principal

- src/app: index, revision, resultado, historial, privacidad y layout.
- src/components/ui.tsx y DocumentActions.tsx: interfaz compartida y selección.
- src/types/document.ts: documento, páginas, resultado, plazos y acciones.
- src/services: documents.ts, analysis.ts, history.ts.
- src/state/AppProvider.tsx: estado en memoria e historial.
- tests/services.test.ts: simulación, validación y exclusión de adjuntos.
- AGENTS.md: reglas permanentes de privacidad y arquitectura.

Se conservan auxiliares visuales sin uso de la plantilla original. La ruta antigua explore redirige a privacidad.

## Verificar

```sh
npm run verify
npm run export:all
npx expo-doctor
```

Prueba manual en Android/iOS: denegar y conceder cámara; cancelar cada selector; tomar dos fotos; seleccionar varias imágenes y un PDF multipágina; reordenar y quitar; generar ejemplo; reiniciar y abrir historial; borrarlo; verificar que no hay archivos originales en el historial y que las copias de ImagePicker se limpian. Probar también cierre inesperado, falta de almacenamiento y tamaños de texto grandes.

No debe utilizarse para tomar decisiones administrativas: contrastar siempre el original con el organismo emisor.
