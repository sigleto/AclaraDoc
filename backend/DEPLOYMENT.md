# Piloto Render Free + Neon Free — preparado, no desplegado

Partida: `968405a`. Se conserva Express, Gemini y validación JPG/JPEG/PNG/PDF:
6 archivos / 6 páginas, 4 MiB por archivo, 10 MiB por lote. Expo y la sonda de
Workers no cambian. Esta guía describe acciones futuras del titular; ninguna se
ha ejecutado. No supone una comprobación del plan o de la facturación de cuentas.

## Configuración preparada

`render.yaml` es la referencia para un único servicio Node, sin disco persistente
ni base Render. Node 22.23.2, raíz del repositorio (no `backend/`), compilación
`npm ci --include=dev && npm run build --workspace backend`, inicio compilado
`npm run start:prod --workspace backend`, comprobación `/health`. Render proporciona
`PORT`; `HOST=0.0.0.0`. No ejecutar `dev` ni instalar solo dependencias de producción
durante la compilación: TypeScript es necesario. No hay migración automática en
build o arranque ni despliegue automático tras futuros commits.

| Variable no secreta | Valor inicial |
| --- | --- |
| NODE_ENV | production |
| NODE_VERSION | 22.23.2 |
| HOST | 0.0.0.0 |
| ANALYSIS_MODE | gemini |
| GEMINI_MODEL | gemini-3.1-flash-lite |
| QUOTA_STORE | postgres |
| DEVICE_DAILY_LIMIT | 3 |
| GLOBAL_DAILY_LIMIT | 20 |
| IP_WINDOW_MINUTES / IP_REQUEST_LIMIT | 15 / 5 |
| MAX_CONCURRENT_ANALYSES | 2 |
| FREE_TIER_CONFIRMED | true, solo tras confirmación manual |
| CORS_ORIGINS | vacío para solo móvil; orígenes HTTPS exactos para web |
| TRUST_PROXY_CIDRS | vacío hasta verificar proxies |

Secretos manuales: `GEMINI_API_KEY`, `QUOTA_HASH_SECRET`, `DATABASE_URL`. No pegar
sus valores en Git, Expo, comandos del historial, tickets o logs. El YAML solo
declara sus nombres con `sync: false`. El marcador `https://URL_DE_RENDER` no es
una dirección creada ni debe copiarse literalmente como una URL funcional.

## Pasos del titular, todavía no ejecutados

1. En la consola de Neon, crear una cuenta/proyecto **Free**, sin tarjeta ni
   activación de facturación. Elegir una región cercana a la futura de Render.
   Comprobar las condiciones y límites mostrados antes de confirmar; si el flujo
   exige un plan pagado o tarjeta, detenerse. No crear bases de pago.
2. En la conexión del proyecto, elegir la base y el rol creados y obtener la cadena
   PostgreSQL con pooling. Guardarla privadamente como `DATABASE_URL`. Para la
   migración local, añadirla con el editor a `backend/.env` (ignorado), sin alterar
   `QUOTA_STORE` del backend local. No hay que facilitarla a este agente. El cliente
   siempre verifica el certificado TLS; no usar `NODE_TLS_REJECT_UNAUTHORIZED=0`.
3. Desde la raíz local y con Node 22, ejecutar `npm run migrate --workspace backend`.
   Solo usa la conexión de base de datos; no necesita Gemini. Esperar el mensaje de
   éxito. Ejecutarlo otra vez es seguro: registra nombre/checksum en
   `schema_migrations`; cambios a una migración aplicada se rechazan. No editar
   migraciones aplicadas: añadir otra. No borrar tablas para recuperar cuota.
   Si falla, corregir conexión/esquema antes de continuar. El comando oculta errores
   internos y no imprime la URL. Eliminar del archivo local esa conexión cuando
   ya no se necesite y conservarla en un gestor de secretos.
4. En Render, conectar el repositorio y preparar un **Web Service Free**, instancia
   única, runtime Node, sin disco ni PostgreSQL de Render. Usar raíz, build, start,
   versión Node y `/health` anteriores. Desactivar autodeploy. Alternativamente,
   revisar el Blueprint `render.yaml`; aplicarlo crearía recursos y desplegaría,
   por lo que no aplicarlo antes de preparar todos los valores. Comprobar que la
   selección es Free, sin facturación ni tarjeta; detenerse ante una exigencia de pago.
5. **Antes de pulsar crear/desplegar**, añadir en el entorno privado del servicio
   los tres secretos y las variables de la tabla. Mantener el proyecto de Gemini
   sin facturación. Usar un `QUOTA_HASH_SECRET` aleatorio de al menos 32 caracteres
   (p. ej. 64 hexadecimales generados y guardados en un gestor de contraseñas).
   Conservar ese secreto entre reinicios. No generarlo de nuevo en cada despliegue.
6. Revisar el plan Free y lanzar el despliegue manual. El código compilado debe
   arrancar después de encontrar las tablas. Si falta Neon/migración, no quedará
   listo: revisar la configuración privada, sin publicar el contenido de los secretos.
7. Abrir la URL HTTPS asignada por Render seguida de `/health`: debe devolver
   `status: ok`, `mode: gemini` y los límites esperados. Este endpoint comprueba
   vida del proceso, no interroga Neon ni Google en cada consulta. Arrancar sí
   comprueba Neon; durante una caída posterior, analizar devuelve 503. Probar
   después con documentos ficticios y consentimiento, y comprobar que reiniciar
   Render conserva cuotas y pausa. Estas pruebas reales quedan pendientes.
8. En el `.env` raíz de Expo, configurar únicamente
   `EXPO_PUBLIC_API_URL=https://URL_DE_RENDER`, sustituyendo el marcador por la URL
   HTTPS asignada, sin `/health`. Recargar/recompilar la app para incorporar el
   entorno; una aplicación ya distribuida no cambia su URL por editar este archivo.
   No incluir ninguno de los tres secretos. El backend local sigue disponible con
   su IP LAN, `HOST` privado configurado y `QUOTA_STORE=sqlite` (o predeterminado).

## Cuotas, migraciones y privacidad

`pg` sin ORM, pool máximo 2, conexión 5 s, sentencia 5 s, bloqueo 3 s y conexiones
ociosas 10 s. Los límites SQL se fijan con `SET LOCAL` dentro de cada transacción,
sin depender de opciones de inicio de sesión del pooler. El cliente limita cada
consulta a 6 s también si la red deja de responder; una conexión que ha dado un
error de transporte no se reutiliza. Ver [opciones del cliente pg](https://node-postgres.com/apis/client).
TLS verifica certificado y nombre; los parámetros SSL de la URL no
pueden desactivar esa verificación. Las transacciones usan un mismo cliente, como
requiere [node-postgres](https://node-postgres.com/features/transactions), y las
opciones SSL se separan de la cadena para evitar su sustitución descrita en su
[documentación TLS](https://node-postgres.com/features/ssl).

Un bloqueo `FOR UPDATE` sobre la fila única `quota_control` serializa la reserva
de dispositivo/global y la pausa entre instancias. Ambos incrementos se confirman
juntos; el contador SQL global también tiene máximo 20. Solo persisten HMAC-SHA256,
día UTC, contadores y fin de pausa; la tabla de migraciones contiene nombre,
checksum y fecha de aplicación del esquema. Consultas parametrizadas, sin UUID
original, IP, nombres, documentos, texto o resultados. No renderizamos PDF en otro
entorno: su worker Node y todas sus defensas se conservan.

Los rechazos de validación/admisión no cuentan; se reserva justo antes de invocar
Gemini y un fallo posterior cuenta. Un COMMIT de resultado incierto, caída o
cancelación en el intervalo reserva/envío puede descontar conservadoramente un
intento que no llegó a Google; no se reintenta ni se devuelve cuota. No hay una
transacción distribuida con Google. Una caída de PostgreSQL produce 503 y nunca
memoria. Si falla guardar un 429, el proceso conserva la pausa pendiente y exige
persistirla antes de admitir más análisis. Un cierre durante esa caída puede
perder esa pausa todavía no persistida; no existe garantía de persistencia cuando
la base es inaccesible. Los intentos ya confirmados siguen almacenados.

Purga de filas antiguas al arrancar y antes de cada solicitud admitida, 7 días por
defecto. PostgreSQL no tiene sondeo periódico ni cron que mantenga Neon despierto;
si no hay actividad, las filas pueden permanecer hasta el siguiente arranque o
solicitud. SQLite/memoria conservan además su limpieza periódica. La retención de
copias de seguridad del proveedor es independiente. `/health` no consume cuota.
SIGTERM/SIGINT deja de aceptar conexiones, permite finalizar solicitudes y cierra
el pool; a los 20 s desconecta las restantes, lo que aborta su trabajo.

## Proxy y límites del piloto

El backend usa un contador propio en memoria, **no express-rate-limit**.
[Render documenta Cloudflare y su balanceador](https://render.com/articles/how-render-handles-ddos-attacks),
pero esa documentación no garantiza un número constante de saltos ni una lista
de redes de origen para configurar confianza. No se presume `trust proxy=true`
ni un número de saltos. Por defecto se usa la IP del socket y se ignora XFF.
Esto puede agrupar a varios usuarios bajo una IP del proxy y limitarles conjuntamente
a cinco intentos cada quince minutos. Es una restricción conservadora del piloto.

`TRUST_PROXY_CIDRS` admite solo IP/CIDR explícitos, nunca `0.0.0.0/0`, `::/0`, nombres
genéricos ni cabeceras elegidas por el cliente. Solo rellenarlo si Render confirma
las redes de sus proxies inmediatos y la cadena de entrada. Express recorre desde
el socket hasta el primer salto no confiable; un prefijo XFF inventado no supera
ese salto. No copiar los rangos del test como configuración de producción. CORS
es exacto, admite móvil sin Origin y no autentica personas.

La cuota persistente por instalación y el máximo global son los controles
principales. Un UUID se puede falsificar o regenerar: esto no es autenticación.
IP y concurrencia no se coordinan entre procesos, por lo que se prepara una sola
instancia. No se ha medido latencia, consumo de RAM o arranque en frío en Render;
la suspensión de servicios gratuitos puede provocar espera y timeout en la app.
Despertar primero `/health` permite distinguirlo de un fallo de análisis. No usar
monitores artificiales para evitar la suspensión. Una pausa o agotamiento del
servicio/base gratuita implica indisponibilidad, sin elevar planes ni activar
facturación desde el código. Los límites y condiciones efectivos deben revisarse
en las consolas; aquí no se ha realizado otra investigación de plataformas.

Esto prepara un piloto, no certifica preparación para Google Play. Siguen pendientes
pruebas remotas con imágenes/PDF, reinicio, abuso, carga, política de privacidad y
declaraciones de datos que incluyan Render, Neon y Google antes de publicación.
