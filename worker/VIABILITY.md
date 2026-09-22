# Prueba local de viabilidad — 22/09/2026

## Decisión

**Flujo funcional aprobado; presupuesto de recursos Free no aprobado.**
Se detiene la implementación completa en la puerta de viabilidad autorizada.
No se reducen los límites de 4 MiB por archivo y 10 MiB por lote. No hay D1,
capacidades remotas, cambios de interfaz, configuración de despliegue ni proveedor
real habilitado. `backend/src/pdf.ts` y el soporte PDF local se conservan.
No se crea commit de una migración terminada porque no lo está.

Esto no demuestra un error 1102 en producción: no se ha desplegado. Sí aporta
evidencia local desfavorable, insuficiente para aprobar 10 ms de CPU con margen.

## Reproducir

Desde la raíz, con Node >=22.13 y dependencias instaladas:

```powershell
npm run worker:probe
```

El comando compila el módulo en memoria, ejecuta Miniflare/workerd local, verifica
los casos y obtiene un perfil CDP. No carga `.env`, no usa credenciales de cuenta,
no inicia sesión, no despliega y no realiza llamadas reales a Gemini. El SDK
oficial recibe un transporte `fetch` sustituido que retorna una respuesta ficticia.
Miniflare tiene `cf: false` y telemetría desactivada. Los únicos accesos de red
de la prueba son al runtime/inspector en loopback.

La medición de CPU/RSS del proceso workerd usa PowerShell solo en el anfitrión
Windows. Se omite si existen varias instancias workerd para no atribuir métricas
ajenas. El Worker no usa `child_process`, disco, PDF ni procesos secundarios.
El código del anfitrión no forma parte del bundle del Worker.

## Casos funcionales

11/11 aprobados en workerd local:

| Caso | HTTP |
| --- | ---: |
| PNG pequeño | 200 |
| JPG sintético | 200 |
| Seis PNG | 200 |
| PNG de exactamente 4.194.304 bytes | 200 |
| Seis PNG, exactamente 10.485.760 bytes | 200 |
| MIME falsificado | 415 |
| PNG truncado | 415 |
| PDF | 415 |
| 4 MiB + 1 byte en un archivo | 413 |
| 10 MiB + 1 byte en total | 413 |
| Siete archivos | 413 |

Los PNG se generan en memoria, con píxel y CRC de chunks válidos. Los tamaños
grandes se consiguen mediante un chunk auxiliar tEXt; no son fotografías reales
de muchos megapíxeles. Se comprueban firma y estructura básica, no se decodifican
píxeles ni se verifica exhaustivamente toda corrupción. El PNG truncado demuestra
ese rechazo concreto, no una garantía de detección de cualquier archivo corrupto.
El resultado mock se valida con el contrato Zod existente.

## Mediciones

Node 22.23.2, Wrangler 4.136.1 y Miniflare 5.20260921.0-alpha (versión requerida
por ese Wrangler). Bundling con esbuild. Ejecución secuencial sin exportaciones
o suites de pruebas simultáneas.

Para seis archivos que suman 10 MiB:

- Multipart recibido: 10.486.620 bytes.
- Base64: 13.981.028 caracteres.
- JSON serializado por el SDK: 13.984.158 caracteres ASCII.
- Una única invocación del transporte simulado por análisis aceptado.
- Cinco perfiles CDP de workerd, intervalo de muestreo solicitado 1 ms:
  191,21; 244,66; 343,78; 326,96; 356,13 ms de muestras activas estimadas.
  Se excluyen nodos `(idle)`, `(program)` y `(root)`.
- En esos perfiles, `generateContentInternal` acumula aproximadamente 23,55–25,48 ms
  y `toString` 9,54–13,23 ms por petición. No son mediciones independientes de
  precisión: son atribuciones por muestreo bajo instrumentación.
- CPU del proceso workerd durante esos intervalos: 468,75; 375; 484,38; 578,13;
  578,13 ms. Incluye runtime, servicios internos e inspector, no solo el isolate.
- RSS del proceso workerd observado al terminar cada intervalo: 171,87–222,46 MiB.
  Incluye código/runtime/inspector; **no demuestra superar los 128 MB del isolate**.

Como contraste sin perfilador, el mismo flujo con Web APIs de Node produjo estas
cinco muestras de CPU para 10 MiB: 78, 125, 156, 187 y 234 ms; mediana 156 ms.
El incremento RSS máximo observado entre los extremos fue 28,67 MiB. No es el
pico ni la memoria total, y excluye fixtures y preparación de la petición.
En ejecuciones anteriores, las medianas Node del lote máximo fueron 109–125 ms.
La granularidad de CPU de Windows produce ceros en casos pequeños: no significan
ausencia de consumo. Para 4 MiB la última mediana Node fue 94 ms.

## Copias y coste

En el recorrido del servidor existen el almacenamiento de FormData, un
ArrayBuffer por archivo, su cadena Base64 y el JSON completo del SDK. `Buffer.from`
crea una vista sobre los bytes en esta prueba; `toString` crea la cadena Base64.
El SDK serializa un JSON de aproximadamente 13,34 MiB para el lote de 10 MiB.
Los buffers se sobrescriben y las referencias Base64 se liberan al finalizar;
las cadenas inmutables y copias internas quedan sujetas al recolector de basura.
No se afirma borrado forense de memoria.

El anfitrión de pruebas además conserva fixtures, construye FormData y serializa
el cuerpo de entrada. Esas copias adicionales no deben confundirse con memoria
del Worker desplegado. La simulación devuelve una respuesta pequeña y no parsea
el JSON grande de entrada en su transporte, para evitar añadir un coste que
correspondería a Google. No se ha incluido el prompt completo ni D1 en esta sonda:
el presupuesto pendiente no mejora al añadirlos.

## Interpretación y límites

Workers Free publica 10 ms de CPU por petición y 128 MB por isolate. Las medidas
locales no equivalen a la CPU facturada: hardware, instrumentación, servicios
auxiliares y ejecución local difieren. No se convierte RSS del proceso en memoria
del isolate ni tiempo de perfil en un contador exacto de producción.

No obstante, se observa un coste sostenido elevado incluso en la conversión y
serialización, sin parser PDF. El éxito HTTP local no certifica viabilidad Free:
esta sonda informa resultados funcionales con exit 0, pero **no autoriza continuar
la migración ni desplegar**. No se han elevado tiempos ni cambiado de proveedor.

Quedan pendientes medición exacta en Cloudflare, memoria máxima del isolate,
comportamiento con clientes lentos/concurrencia y fotografías reales, cuota real
de la cuenta y aceptación remota del modelo. No se deben crear recursos para
comprobarlo sin una autorización posterior.

Referencias oficiales:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/
- https://developers.cloudflare.com/workers/local-development/

La arquitectura y privacidad de esta fase se limitan a esta sonda: no hay un
backend público preparado, D1 ni nueva persistencia. La app y backend local
conservan sus controles existentes. Los siguientes pasos del plan (capacidades,
PDF desactivado en público, D1, endpoint de producción) no están implementados.
