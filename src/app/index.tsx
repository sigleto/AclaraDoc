import { useRouter } from 'expo-router';
import { Action, Card, Copy, ErrorMessage, Heading, Notice, Screen, Title } from '../components/ui';
import { DocumentActions } from '../components/DocumentActions';
import { useApp } from '../state/AppProvider';
export default function Home() {
  const router = useRouter(); const app = useApp();
  return <Screen><Copy>ENTIENDE TUS DOCUMENTOS</Copy><Title>Más claridad.\nUn paso a la vez.</Title><Copy>Reúne las páginas de tu comunicación y explora cómo se explicaría en lenguaje sencillo.</Copy><Notice /><Card><Heading>Empieza con tu documento</Heading><Copy>Puedes añadir varias fotos, seleccionar varias imágenes o adjuntar PDF completos de varias páginas.</Copy><DocumentActions /></Card>{!!app.document?.pages.length && <Action title="Continuar revisión" onPress={() => router.push('/revision')} />}<ErrorMessage message={app.error} /><Copy>Sin cuentas, sin envíos a servidores. Solo los resultados de ejemplo se guardan en este dispositivo.</Copy><Action title="Ver historial" secondary onPress={() => router.push('/historial')} /><Action title="Información y privacidad" secondary onPress={() => router.push('/privacidad')} /></Screen>;
}
