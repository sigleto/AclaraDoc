# Iconos de AclaraDoc

Referencia proporcionada: `aclaraDoc-logo-reference.png.png` (nombre real con
doble extensión; original conservado). Imagen original de 1254 × 1254 con
esquinas ya redondeadas y alfa mayoritariamente 253–254. Se ha separado el símbolo
mediante imagegen y se conserva el recorte fuente en `foreground-source.png`.
La composición final elimina partículas desconectadas del recorte, centra el
conjunto y ajusta sus márgenes; conserva documento, check y destello.

El fondo original tiene ligeras variaciones: **#092B60** es su RGB azul más
frecuente al muestrear cada dos píxeles con alfa >200. Los nuevos fondos usan ese
valor exacto, sólido y opaco, sin esquinas redondeadas ni sombra exterior.

| Uso | Archivo en `icons/` | Medidas | Alfa |
| --- | --- | --- | --- |
| Expo e iOS | `app-icon-1024.png` | 1024 × 1024 | Todo 255, opaco |
| Foreground Android | `android-foreground.png` | 1024 × 1024 | Fondo transparente |
| Fondo Android | `android-background.png` | 1024 × 1024 | Todo 255, opaco |
| Monocromo Android | `android-monochrome.png` | 1024 × 1024 | Máscara blanca/transparente |
| Subida manual a Play Console | `play-store-512.png` | 512 × 512 | Todo 255, opaco |

Todos son PNG RGBA de 8 bits por canal (32 bits). La transparencia del monocromo
es necesaria: Android usa su alfa para teñir el símbolo con el tema del usuario.
Su documento se representa con contorno para que el check siga siendo legible.
No es un fondo rectangular opaco ni un icono de Play.

`app.json` utiliza las rutas anteriores y `backgroundColor: #092B60`.
Se ha sustituido también el override iOS que apuntaba al símbolo anterior de Expo.
El favicon, splash y recursos de componentes permanecen intactos. No hay cambios
en código funcional, backend, cuotas, secretos o dependencias.

## Comprobación y reproducción

Ejecutar desde la raíz en PowerShell:

```powershell
./scripts/prepare-brand-icons.ps1 -Source assets/branding/foreground-source.png
```

Este comando usa System.Drawing, no llama a servicios ni genera imágenes mediante
IA. Exporta los tamaños exactos a partir del recorte ya guardado, comprueba firma
PNG, canales, tamaño y máscaras. `icons/validation.txt` recoge los valores reales.
`icons/preview-masks.png` muestra maestro, foreground, Play y máscaras de Android.
El damero de esa vista es solo una ayuda visual, no está dibujado en el foreground.

Validación final: Expo Doctor **21/21**, configuración pública de Expo resuelta
con las nuevas rutas y Play Console **91 516 bytes**, por debajo de 1 MB.

La capa adaptativa mantiene todo el contenido visible dentro de un radio de
aproximadamente 300 px, menor que los 312,89 px del círculo central 66/108.
Las pruebas aplican círculo, cuadrado redondeado y squircle al viewport central
72/108, sin recortar píxeles del símbolo. El maestro también conserva el símbolo
en las tres máscaras sobre el lienzo completo. Son simulaciones de máscaras:
queda revisar el resultado instalado en los launchers de dispositivos reales.

Referencias: [iconos adaptativos de Android](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)
y [especificación de Play Console](https://developer.android.com/distribute/google-play/resources/icon-design-specifications).

## Copia anterior y reversión

Los originales siguen en `assets/images/` y `assets/expo.icon/`. Además,
`previous-icons/` conserva los seis PNG anteriores, la carpeta `expo.icon` completa
y `app.before-branding.json`, capturado antes de este cambio (incluye el proyecto
EAS ya vinculado). Para revertir solo el branding, restaurar en `app.json` los
campos `expo.icon`, `expo.ios.icon` y `expo.android.adaptiveIcon` desde esa copia.
No sustituir indiscriminadamente otras configuraciones que se editen después.

Se necesita un nuevo APK para ver el icono instalado; no cambia al recargar Metro.
No se ha hecho commit, subido a Play Console ni iniciado una build con estos iconos.
