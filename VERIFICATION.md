# Verificación de la primera versión

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
