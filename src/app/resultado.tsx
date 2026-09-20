import { useLocalSearchParams, useRouter } from 'expo-router';
import { Action, Card, Copy, ErrorMessage, Heading, Notice, Screen, Title } from '../components/ui';
import { useApp } from '../state/AppProvider';
export default function Result() {
  const { id } = useLocalSearchParams<{ id?: string }>(); const app = useApp(); const router = useRouter();
  const result = app.currentResult?.id === id ? app.currentResult : app.history.find(r => r.id === id);
  if (!result) return <Screen><Title>{app.ready ? 'Resultado no disponible' : 'Cargando…'}</Title><Copy>Selecciona un resultado del historial o añade un documento.</Copy><Action title="Ir al inicio" onPress={() => router.replace('/')} /></Screen>;
  return <Screen><Title>Tu explicación de ejemplo</Title><Notice /><ErrorMessage message={app.error} /><Card><Heading>Resumen en lenguaje sencillo</Heading><Copy>{result.summary}</Copy></Card><Card><Heading>Organismo emisor</Heading><Copy>{result.issuer}</Copy><Heading>Tipo de comunicación</Heading><Copy>{result.communicationType}</Copy></Card><Card><Heading>Qué debes hacer</Heading>{result.actions.map((action, i) => <Copy key={action.id}>{i + 1}. {action.description}</Copy>)}</Card><Card><Heading>Plazos y fechas</Heading>{result.deadlines.map(d => <Copy key={d.id}>{d.description}{d.date ? ` Fecha: ${d.date}` : ' Fecha: no disponible.'}</Copy>)}</Card><Card><Heading>Consecuencias de no actuar</Heading><Copy>{result.consequences}</Copy></Card><Card><Heading>Nivel de confianza: no evaluable</Heading><Copy>{result.confidence.explanation}</Copy></Card><Action title="Ver historial" secondary onPress={() => router.push('/historial')} /><Action title="Volver al inicio" onPress={() => router.replace('/')} /></Screen>;
}
