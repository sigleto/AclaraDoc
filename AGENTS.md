# AclaraDoc — instrucciones permanentes

## Objetivo
Prototipo móvil independiente para explicar documentos administrativos en lenguaje sencillo. Esta fase usa exclusivamente un análisis simulado, claramente etiquetado, sin leer el contenido.

## Privacidad
- Nunca subir documentos, imágenes, PDF ni resultados a servidores.
- No añadir claves API, servicios de pago, cuentas, telemetría ni analítica.
- Mantener la selección solo en memoria. No persistir nombres, URI, originales ni miniaturas.
- El historial local admite solo AnalysisResult mediante una lista explícita de campos y un máximo de 50 entradas.
- Limpiar únicamente copias temporales del selector en la caché privada; nunca eliminar originales del usuario.
- Mostrar errores de almacenamiento y limpieza sin registrar información del documento.
- Mantener visible que la aplicación no es oficial y que se debe verificar todo con el organismo emisor.
- El simulador no debe presentar datos ficticios como detectados ni calcular plazos reales.

## Decisiones técnicas
- Expo SDK 57 estable, React Native, Expo Router y TypeScript estricto. Node >=22.13.
- Consultar documentación de la versión concreta: https://docs.expo.dev/versions/v57.0.0/.
- src/app: rutas; src/components: UI compartida; src/types: dominio; src/services: selección, simulación y serialización; src/state: estado de sesión y persistencia.
- Usar expo install para dependencias nativas compatibles. Versionar package-lock.json.
- Imágenes múltiples ordenables y fotos sucesivas. Cada PDF es un adjunto completo multipágina, con pageCount null; no afirmar que se ha renderizado o contado.
- AsyncStorage para resultados locales; no afirmar que está cifrado. Copias de seguridad Android desactivadas.
- Permisos mínimos, solicitados al usar la cámara; sin micrófono.
- Mantener estados vacíos, cancelación, permisos denegados y fallos de persistencia utilizables.
- Ejecutar npm run verify y npm run export:all antes de entregar cambios relevantes.
- Las pruebas de cámara y selectores nativos requieren dispositivo real; no equiparar una exportación a una prueba en dispositivo.
