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
export default function Home() {
  const router = useRouter();
  const app = useApp();
  return (
    <Screen>
      <Copy>ENTIENDE TUS DOCUMENTOS</Copy>
      <Title>Más claridad. Un paso a la vez.</Title>
      <Copy>
        Reúne las páginas de tu comunicación para recibir una explicación en
        lenguaje sencillo.
      </Copy>
      <Notice />
      <Card>
        <Heading>Empieza con tu documento</Heading>
        <Copy>
          Puedes añadir varias fotos, seleccionar imágenes JPG/PNG o adjuntar
          PDF completos de varias páginas.
        </Copy>
        <DocumentActions />
      </Card>
      {!!app.document?.pages.length && (
        <Action
          title={app.busy ? "Ver análisis en curso" : "Continuar revisión"}
          onPress={() => router.push("/revision")}
        />
      )}
      <ErrorMessage message={app.error} />
      <Copy>
        {usesBackend
          ? "Análisis mediante tu backend local. Antes del primer envío se pedirá tu consentimiento para el tratamiento con Google Gemini. Guarda el resultado solo si lo deseas."
          : "Modo mock local: sin envíos ni consumo de cuota. Los resultados son ficticios y solo se guardan si lo solicitas."}
      </Copy>
      <Action
        title="Ver historial"
        secondary
        onPress={() => router.push("/historial")}
      />
      <Action
        title="Información y privacidad"
        secondary
        onPress={() => router.push("/privacidad")}
      />
    </Screen>
  );
}
