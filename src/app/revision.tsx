import { useState } from "react";
import { ActivityIndicator, Image } from "react-native";
import { useRouter } from "expo-router";
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
import { DocumentActions } from "../components/DocumentActions";
import { useApp } from "../state/AppProvider";
import { usesBackend } from "../services/analysis";
import { CONSENT_TEXT } from "../../shared/analysis";

export default function Review() {
  const app = useApp();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  async function run(accepted = false) {
    setError(null);
    if (usesBackend && !app.consentAccepted && !accepted) {
      setShowConsent(true);
      return;
    }
    setShowConsent(false);
    try {
      const result = await app.analyze(accepted);
      if (result)
        router.replace({ pathname: "/resultado", params: { id: result.id } });
    } catch {
      setError("No se pudo iniciar el análisis.");
    }
  }
  function edit(action: () => void) {
    try {
      action();
      setError(null);
    } catch {
      setError("No se pudo eliminar la copia temporal. Inténtalo de nuevo.");
    }
  }
  const pages = app.document?.pages ?? [];
  return (
    <Screen>
      <Title>Revisa tus páginas</Title>
      <Copy>
        {pages.length} adjunto(s). Máximo 6 archivos y 6 páginas en total; 4 MB
        por archivo y 10 MB en conjunto. JPG, PNG o PDF sin contraseña. Los PDF
        se envían completos y sus páginas se cuentan en el servidor.
      </Copy>
      <Notice />
      {showConsent ? (
        <Card>
          <Heading>Antes de enviar el documento</Heading>
          <Copy>{CONSENT_TEXT}</Copy>
          <Copy>
            No se anonimiza el documento antes del envío. La cancelación
            posterior no puede retirar datos que Google ya haya recibido.
          </Copy>
          <Action
            title="Aceptar y analizar"
            onPress={() => void run(true)}
            disabled={app.busy}
          />
          <Action
            title="Cancelar envío"
            secondary
            onPress={() => setShowConsent(false)}
          />
        </Card>
      ) : (
        <>
          {pages.map((page, index) => (
            <Card key={page.id}>
              <Heading>
                {index + 1}. {page.kind === "pdf" ? "PDF completo" : "Página"}
              </Heading>
              <Copy>{page.name}</Copy>
              {page.kind === "image" && (
                <Image
                  source={{ uri: page.uri }}
                  accessibilityLabel={`Vista previa de la página ${index + 1}`}
                  style={{ width: "100%", height: 240, borderRadius: 12 }}
                  resizeMode="contain"
                />
              )}
              <Action
                title="Subir"
                secondary
                disabled={index === 0 || app.busy}
                onPress={() => app.movePage(index, -1)}
              />
              <Action
                title="Bajar"
                secondary
                disabled={index === pages.length - 1 || app.busy}
                onPress={() => app.movePage(index, 1)}
              />
              <Action
                title="Quitar adjunto"
                secondary
                disabled={app.busy}
                onPress={() => edit(() => app.removePage(page.id))}
              />
            </Card>
          ))}
          {!pages.length && (
            <Copy>
              Añade documentos para continuar. Tras un análisis, error o
              cancelación se descartan las copias temporales; si quieres
              repetir, selecciona los archivos de nuevo.
            </Copy>
          )}
          <Heading>Añadir más páginas</Heading>
          <DocumentActions />
          {!app.busy && (
            <Action
              title={
                usesBackend ? "Analizar documento" : "Ver análisis simulado"
              }
              disabled={!pages.length || !app.ready}
              onPress={() => void run()}
            />
          )}
        </>
      )}
      <ErrorMessage message={error ?? app.error} />
      {app.busy && (
        <Card>
          <ActivityIndicator accessibilityLabel="Analizando documento" />
          <Copy>Análisis en curso…</Copy>
          <Action
            title="Cancelar análisis"
            secondary
            onPress={app.cancelAnalysis}
          />
        </Card>
      )}
      <Action
        title="Descartar documento"
        secondary
        disabled={!pages.length || app.busy}
        onPress={() =>
          edit(() => {
            app.discard();
            router.replace("/");
          })
        }
      />
    </Screen>
  );
}
