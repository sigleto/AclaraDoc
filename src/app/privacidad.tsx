import { Card, Copy, Heading, Notice, Screen, Title } from "../components/ui";
import { CONSENT_TEXT } from "../../shared/analysis";
export default function Privacy() {
  return (
    <Screen>
      <Title>Tu documento, bajo tu control</Title>
      <Notice />
      <Card>
        <Heading>Análisis y consentimiento</Heading>
        <Copy>{CONSENT_TEXT}</Copy>
        <Copy>
          No se anonimiza el archivo antes del envío. Oculta tú los datos
          sensibles antes de seleccionarlo. Las instrucciones al modelo y los
          filtros de salida no garantizan detectar todos los datos personales.
        </Copy>
      </Card>
      <Card>
        <Heading>Recorrido del documento</Heading>
        <Copy>
          Con el servicio activado, la aplicación envía los archivos a tu
          backend local y este a Gemini. No hay base de datos ni archivos en
          disco en el backend: se procesan temporalmente en memoria y se liberan
          al terminar o ante un error. Google aplica sus propias condiciones y
          retención; AclaraDoc no puede borrar los datos ya recibidos por
          Google.
        </Copy>
        <Copy>
          Cancelar detiene la espera y solicita abortar el envío, pero no
          garantiza retirar lo ya enviado ni recuperar la cuota consumida. Las
          pruebas por HTTP deben realizarse solo en una red local de confianza y
          con documentos ficticios o previamente ocultados.
        </Copy>
      </Card>
      <Card>
        <Heading>Qué se guarda</Heading>
        <Copy>
          El resultado permanece en memoria hasta que pulses Guardar resultado.
          El historial conserva como máximo 50 resultados localmente, sin
          adjuntos, nombres de archivo ni rutas. Puedes borrarlos desde
          Historial. No está cifrado por la aplicación y un resultado puede
          contener información sensible.
        </Copy>
      </Card>
      <Card>
        <Heading>Copias temporales</Heading>
        <Copy>
          Las copias de los selectores de imágenes y PDF se eliminan al quitar
          adjuntos, descartar y al finalizar cualquier intento de análisis,
          incluido error o cancelación. Tras un cierre inesperado se limpian al
          siguiente inicio. Si falla la limpieza se muestra un aviso. Nunca se
          borran tus originales de la galería o del proveedor.
        </Copy>
      </Card>
      <Card>
        <Heading>Modo simulado y límites</Heading>
        <Copy>
          Sin dirección de backend se usa un mock local que no envía archivos.
          El backend también puede configurarse en mock y no llama a Google. No
          hay cambio automático de modelo ni reintentos ante cuota agotada. La
          cuenta de Gemini debe mantenerse sin facturación habilitada.
        </Copy>
      </Card>
      <Card>
        <Heading>Comprueba siempre el original</Heading>
        <Copy>
          Verifica contenido, fechas, requisitos y consecuencias con el
          organismo emisor. Las respuestas pueden ser incorrectas o incompletas
          y no sustituyen asesoramiento profesional.
        </Copy>
      </Card>
    </Screen>
  );
}
