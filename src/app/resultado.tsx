import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Action,
  Card,
  Copy,
  ErrorMessage,
  Heading,
  Notice,
  Screen,
  Title,
} from "../components/ui";
import { useApp } from "../state/AppProvider";
import type { Statement } from "../types/document";
import { QuotaStatus } from "../components/QuotaStatus";

const labels = {
  hecho: "Hecho escrito",
  interpretacion: "Interpretación",
  no_consta: "No consta",
};
function Statements({ items }: { items: Statement[] }) {
  return items.length ? (
    items.map((item, i) => (
      <Copy key={i}>
        {labels[item.origen]}: {item.texto}
      </Copy>
    ))
  ) : (
    <Copy>No consta información suficiente.</Copy>
  );
}
export default function Result() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const app = useApp();
  const router = useRouter();
  const result =
    app.currentResult?.id === id
      ? app.currentResult
      : app.history.find((r) => r.id === id);
  if (!result)
    return (
      <Screen>
        <Title>{app.ready ? "Resultado no disponible" : "Cargando…"}</Title>
        <Copy>Selecciona un resultado del historial o añade un documento.</Copy>
        <Action title="Ir al inicio" onPress={() => router.replace("/")} />
      </Screen>
    );
  const a = result.analysis;
  const saved = app.history.some((r) => r.id === result.id);
  return (
    <Screen>
      <Title>{a.titulo}</Title>
      <Notice />
      <Copy>
        {result.simulated
          ? "Modo simulado: este resultado es ficticio y no describe el documento."
          : "Análisis con Gemini. Puede contener errores: contrasta cada dato con el original."}
      </Copy>
      <ErrorMessage message={app.error} />
      {!result.simulated && <QuotaStatus quota={app.quota} />}
      <Card>
        <Heading>Resumen en lenguaje sencillo</Heading>
        <Statements items={[a.resumenSencillo]} />
      </Card>
      <Card>
        <Heading>Organismo emisor</Heading>
        <Copy>{a.organismoEmisor ?? "No identificado"}</Copy>
        <Heading>Tipo de comunicación</Heading>
        <Copy>{a.tipoComunicacion ?? "No identificado"}</Copy>
        <Copy>
          Meramente informativo: {a.esMeramenteInformativo ? "Sí" : "No"}.
          Requiere actuación:{" "}
          {a.requiereActuacion
            ? "Sí"
            : "No detectada; compruébalo en el original"}
          .
        </Copy>
      </Card>
      <Card>
        <Heading>Qué debes hacer</Heading>
        <Statements items={a.accionesRecomendadas} />
      </Card>
      <Card>
        <Heading>Fechas detectadas</Heading>
        {a.fechasDetectadas.length ? (
          a.fechasDetectadas.map((d, i) => (
            <Copy key={i}>
              Hecho escrito: {d.descripcion}. {d.fechaLiteral}
              {d.fechaISO ? ` (${d.fechaISO})` : ""}
            </Copy>
          ))
        ) : (
          <Copy>No se han identificado fechas con suficiente seguridad.</Copy>
        )}
        <Heading>Plazos</Heading>
        {a.plazos.length ? (
          a.plazos.map((d, i) => (
            <Copy key={i}>
              {labels[d.origen]}: {d.descripcion}. Notificación:{" "}
              {d.fechaNotificacion ?? "no consta"}. Fecha límite:{" "}
              {d.fechaLimite ?? "no determinada"}.{" "}
              {d.calculado
                ? "Fecha calculada: verificar."
                : "No se ha calculado el vencimiento."}
            </Copy>
          ))
        ) : (
          <Copy>
            No hay plazos identificados. Comprueba el documento original.
          </Copy>
        )}
      </Card>
      <Card>
        <Heading>Consecuencias de no actuar</Heading>
        <Statements items={a.consecuenciasDeNoActuar} />
      </Card>
      <Card>
        <Heading>Documentos que puedes necesitar</Heading>
        <Statements items={a.documentosQuePuedeNecesitar} />
      </Card>
      <Card>
        <Heading>Vías de contacto mencionadas</Heading>
        <Statements items={a.viasDeContactoMencionadas} />
      </Card>
      <Card>
        <Heading>Advertencias</Heading>
        {a.advertencias.length ? (
          a.advertencias.map((text, i) => <Copy key={i}>{text}</Copy>)
        ) : (
          <Copy>Verifica siempre el resultado.</Copy>
        )}
        <Heading>Partes ilegibles o incompletas</Heading>
        {a.partesIlegibles.length ? (
          a.partesIlegibles.map((text, i) => <Copy key={i}>{text}</Copy>)
        ) : (
          <Copy>
            No señaladas por el análisis; esto no garantiza que el documento
            está completo.
          </Copy>
        )}
      </Card>
      <Card>
        <Heading>
          Nivel de confianza:{" "}
          {result.simulated ? "no evaluable (simulación)" : a.nivelConfianza}
        </Heading>
        <Copy>
          Revisión profesional:{" "}
          {a.necesitaRevisionProfesional
            ? "recomendada"
            : "no indicada por el análisis"}
          .
        </Copy>
        {a.motivoRevisionProfesional && (
          <Copy>{a.motivoRevisionProfesional}</Copy>
        )}
        <Copy>{a.avisoLegal}</Copy>
      </Card>
      <Copy>
        Solo se guardará el resultado si lo solicitas. El historial no está
        cifrado por la aplicación y puede contener información sensible
        inferida.
      </Copy>
      {app.currentResult?.id === result.id && (
        <Action
          title={
            saved
              ? "Resultado guardado"
              : app.saving
                ? "Guardando…"
                : "Guardar resultado en este dispositivo"
          }
          disabled={saved || app.saving}
          onPress={() => void app.saveResult()}
        />
      )}
      <Action
        title="Ver historial"
        secondary
        onPress={() => router.push("/historial")}
      />
      <Action title="Volver al inicio" onPress={() => router.replace("/")} />
    </Screen>
  );
}
