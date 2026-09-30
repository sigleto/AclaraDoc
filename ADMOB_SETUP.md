# AdMob en AclaraDoc

Integración Android, versión 1.1.0 / versionCode 2, package
`com.sigleto.aclaradoc`. No se ha publicado, desplegado ni modificado ninguna
cuenta. `eas.json` conserva preview APK, production app-bundle y la URL Render.

## Arquitectura

- Expo 57.0.26 / React Native 0.86.3; dependencia fijada a
  `react-native-google-mobile-ads@17.2.0`. Sus requisitos son RN >=0.86,
  nueva arquitectura y Android >=24. La versión instalada usa Google Mobile Ads
  Android clásico 25.4.0 y UMP 4.0.0. No se añade mediación ni telemetría propia.
  Se aplicaron los ocho parches de Expo 57 requeridos por Expo Doctor; las
  dependencias de ejecución del backend conservan sus versiones.
- `ads.config.ts` centraliza identificadores públicos y selección tipada de
  unidades. `app.config.ts` extiende app.json con el plugin oficial y
  `delayAppMeasurementInit: true`; usa el `tsx` ya instalado para importar TS.
- `src/ads/core.ts`: consentimiento, inicialización única por proceso JS y ciclo
  de vida del intersticial, con el SDK sustituible en pruebas. El singleton
  sobrevive Fast Refresh.
  Un reinicio completo de JS vuelve a consultar UMP; el SDK nativo inicializa de
  forma idempotente.
- `sdk.android.ts` es el único adaptador que importa el SDK, después de descartar
  Expo Go. `sdk.ts` y `AdBanner.tsx` son alternativas sin anuncios para web/iOS.
  `react-native.config.js` excluye el módulo nativo en iOS. El plugin puede avisar
  de la ausencia de iosAppId: no se configura publicidad iOS ni se enlaza allí.
- `AdsProvider` inicia UMP desde inicio y limita precargas a rutas seguras con la
  app en primer plano. Las pantallas solo reciben estado y acciones publicitarias.
  El backend, Gemini, cuotas, procesamiento e historial de documentos no cambian.

## Ubicaciones

Banner adaptativo anclado al pie, fuera del ScrollView y dentro del área segura,
solo en inicio e historial. Cada banner exige su ruta concreta; las pantallas
retenidas por el Stack no cargan banners adicionales. Hay separación de 32 puntos
y etiqueta Publicidad. Se oculta en pantallas de menos de 500 puntos de alto,
durante selección, con adjuntos pendientes, análisis, errores o confirmación de
borrado. Fallar la carga desmonta el banner sin dejar un hueco grande; se puede
intentar de nuevo al volver a la pantalla. No hay temporizador de refresco propio.

Después de cada análisis completado se intenta mostrar un intersticial cargado
justo antes de presentar el resultado. La llamada nativa para mostrarlo ocurre
antes de cambiar a la ruta de resultado, que queda detrás del anuncio hasta que
el usuario lo cierre. No se muestra al iniciar, al seleccionar documentos, durante
el consentimiento documental, la subida o el análisis, ni al abrir el historial.

Sin consentimiento o inventario listo, con la app en segundo plano, si el anuncio
ha caducado o si el SDK falla, el resultado aparece inmediatamente. No se espera
a que cargue un anuncio. Un cierre/error destruye listeners e instancia y prepara
la siguiente unidad; los fallos de carga tienen un reintento controlado a los 60
segundos. El inventario con 55 minutos de antigüedad se descarta. No se guarda un
contador publicitario ni se vincula la decisión con el resultado o la instalación.

## Consentimiento UMP

Se actualiza la información al iniciar cada proceso. Si corresponde, se presenta
el formulario de Google desde inicio. Si la actualización termina cuando ya se
ha abandonado inicio, se pospone el formulario hasta volver. La inicialización y
todas las solicitudes exigen `canRequestAds`. Un fallo de actualización permite
usar exclusivamente la autorización previa que UMP confirme; si tampoco puede
consultarse, no se muestran anuncios.

Todas las solicitudes usan `requestNonPersonalizedAdsOnly: true`. Esto no evita
las obligaciones de consentimiento: incluso anuncios no personalizados pueden
requerir acceso al dispositivo. No se interpreta OBTAINED como aceptación de
personalización, ni se guarda una autorización propia que sustituya a UMP.
Google aplica las señales de consentimiento y la configuración de sus mensajes.

En **Información y privacidad → Privacidad de los anuncios** aparece el botón de
opciones cuando UMP comunica REQUIRED. Se retiran anuncios e inventario antes de
abrir las opciones y se vuelve a comprobar el permiso al cerrar. Si falla, la app
sigue disponible y deja de solicitar anuncios hasta otra resolución válida.

## IDs y entornos

Las **unidades** reales se seleccionan solo con `__DEV__ === false` y configuración
generada bajo `EAS_BUILD_PROFILE=production`. Development, preview (incluido APK
release) y perfil ausente usan `TestIds.ADAPTIVE_BANNER` / `TestIds.INTERSTITIAL`
del SDK. No basta NODE_ENV=production para habilitar unidades reales.

El ID de **aplicación** Android identifica esta app ante UMP y se configura en el
manifest mediante el plugin. Producción usa el ID facilitado; los demás perfiles
usan el App ID de ejemplo oficial de Google, centralizado también en el archivo
tipado (TestIds solo exporta unidades). No es una clave ni un secreto. No hay
identificadores publicitarios en `.env`, backend, cuotas o petición documental.

## Pruebas locales sin créditos

Usar Node >=22.13 (este repositorio incluye Node 22 en node_modules/node/bin).
Expo Go no contiene el módulo AdMob: permite probar el flujo documental, pero
no anuncios ni formularios UMP. Web e iOS también siguen sin anuncios.

En PowerShell, para un APK Android local de prueba con análisis ficticio:

```powershell
$env:EXPO_NO_DOTENV = '1'
$env:EAS_BUILD_PROFILE = 'preview'
$env:EXPO_PUBLIC_API_URL = ''
$env:PATH = "$PWD\node_modules\node\bin;$env:PATH"
npx expo prebuild --platform android --no-install
# Desde android, con Java y Android SDK instalados:
cd android
.\gradlew.bat assembleRelease
```

El APK generado localmente usa la firma de depuración del proyecto generado y
no debe subirse a Play. No genera AAB. Puede ser necesario usar un emulador o
desinstalar una versión firmada por Play antes de instalarlo (esto borra datos:
decidirlo manualmente, nunca hacerlo automáticamente). Para depuración con Metro,
usar `assembleDebug`, instalar manualmente y `npx expo start` desde la raíz.
Un development build con expo-dev-client es otra opción futura; requiere instalar
esa dependencia y reconstruir. No se ha añadido porque el APK interno es suficiente.

Para una futura build de EAS, preview mantiene la URL Render actual. No ejecutar
esa build remota ni probar contra Render/Gemini sin autorización: consume recursos
y puede enviar documentos. La prueba local anterior usa mock, sin proveedor real.

Comprobar en emulador/dispositivo, sin pulsar anuncios reales:

1. Inicio e historial: banner de prueba, área segura, letra grande, pantalla
   pequeña, navegación Android, TalkBack y ausencia de hueco al fallar la red.
2. Selección, cancelación, error, revisión y análisis: ninguna publicidad visible.
3. Completar varios análisis mock: si hay inventario, cada uno debe intentar un
   intersticial de prueba antes de que se vea el resultado. Abrir un resultado del
   historial no debe mostrarlo.
4. Inventario sin cargar, modo avión, segundo plano y fallo de show: el resultado
   debe aparecer inmediatamente, sin esperar a la publicidad.
5. UMP: en AdMob debe existir un mensaje europeo publicado para esta app,
   incluyendo EEE, Reino Unido y Suiza. Probar aceptar, rechazar, modificar opciones,
   primera sesión offline y sesión offline con preferencias anteriores. El App ID
   de ejemplo no valida los mensajes de tu cuenta: si no permite resolver UMP, el
   APK preview permanecerá sin anuncios. La comprobación nativa de los mensajes
   reales queda pendiente para una build controlada de producción con el dispositivo
   registrado como dispositivo de prueba en AdMob; requiere autorización previa y
   nunca se deben pulsar anuncios reales.
6. Para forzar geografía, usar `AdsConsentDebugGeography.EEA` y dispositivos de
   prueba en una modificación **solo de desarrollo** de `requestInfoUpdate`.
   Emuladores son dispositivos de prueba. Nunca fijar geografía ni llamar a reset
   en producción. No se ha incluido ningún identificador personal de dispositivo.

## Privacidad y Play Console: pasos manuales previos a publicar

La pantalla de privacidad incluye AdMob y separa los dos consentimientos. Trasladar
ese bloque a la política pública alojada indicada en Google Play y AdMob; este
cambio local no actualiza ninguna web. Debe indicar Google AdMob, identificadores
de dispositivo, IP/ubicación aproximada derivada, interacciones, diagnósticos,
publicidad, medición y prevención del fraude, y cómo modificar preferencias UMP.
Mantener información completa del flujo documental y sus
proveedores. No afirmar que la aplicación no recoge o comparte datos.

En Play Console revisar **Contiene anuncios**, declaración de **ID de publicidad**
y **Seguridad de los datos**. Según la versión del SDK/configuración que finalmente
se publique, revisar recogida y compartición de ubicación aproximada (IP),
interacciones con la aplicación/anuncios, diagnósticos y otros identificadores del
dispositivo; fines de publicidad, analítica y prevención del fraude. Revisar la
opcionalidad y borrado según el comportamiento real, sin asumir que no personalizar
implica no recoger datos. Google documenta TLS en tránsito; esto no significa que
todo el historial local esté cifrado. Conservar además las declaraciones de Gemini.

El APK preview compilado confirma en su manifest fusionado AD_ID,
ACCESS_ADSERVICES_AD_ID, ACCESS_ADSERVICES_ATTRIBUTION y
ACCESS_ADSERVICES_TOPICS, además de INTERNET/ACCESS_NETWORK_STATE y los permisos
existentes de cámara, medios, biometría, servicio en primer plano y Expo. No pide
ubicación ni audio. AD_ID no abre un diálogo de permiso. Repetir esta inspección
sobre el AAB/APK firmado que vaya a publicarse y revisar cada declaración de Play;
no añadir ubicación precisa ni enlazar AD_ID con X-AclaraDoc-Installation. Revisar
también público objetivo y políticas de familias. No se han cambiado esas
declaraciones externas.

## Desactivación

Generar una nueva build con `ACLARADOC_ADS_ENABLED=false`: el adaptador no carga
el módulo JS, no consulta UMP ni inicializa/solicita anuncios. El plugin y módulo
nativo permanecen instalados con medición inicial retrasada. Esto requiere entregar
la nueva versión: no es un interruptor remoto para instalaciones existentes.
Para retirada completa, eliminar plugin/dependencia e integrar de nuevo los
componentes sin anuncios en una build posterior. Otra intervención manual puede
ser deshabilitar las unidades en AdMob; verificar las opciones reales de la cuenta
y autorizar cualquier cambio externo antes de hacerlo. No se ha hecho aquí.

## Fuentes oficiales consultadas (30/09/2026)

- [Expo SDK y versiones de React Native](https://docs.expo.dev/versions/latest/)
- [Configuración TypeScript de Expo](https://docs.expo.dev/workflow/configuration/)
- [Instalación Expo de la librería](https://docs.page/invertase/react-native-google-mobile-ads/installation/expo)
- [Requisitos y ciclo de vida v17](https://docs.page/invertase/react-native-google-mobile-ads/migrating-to-v17)
- [Banners](https://docs.page/invertase/react-native-google-mobile-ads/ad-formats/banner)
- [Consentimiento europeo](https://docs.page/invertase/react-native-google-mobile-ads/european-user-consent)
- [UMP Android](https://developers.google.com/admob/android/privacy)
- [App ID oficial de ejemplo y permiso AD_ID](https://developers.google.com/admob/android/quick-start)
- [Declaraciones de datos de Google Mobile Ads](https://developers.google.com/admob/android/privacy/play-data-disclosure)

La última página describe 25.5.0, mientras la dependencia fija 25.4.0: contrastar
la documentación de la versión efectivamente incorporada antes de completar la
declaración definitiva. Las pruebas con dobles no certifican la configuración de
la cuenta, la entrega real de anuncios, el consentimiento nativo ni la aceptación
por Google Play. Ver los resultados de esta ejecución en VERIFICATION.md.
