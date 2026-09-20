import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Action, Card, Copy, ErrorMessage, Heading, Notice, Screen, Title } from '../components/ui';
import { useApp } from '../state/AppProvider';
export default function History() {
  const app = useApp(); const router = useRouter(); const [confirm, setConfirm] = useState(false);
  return <Screen><Title>Tu historial</Title><Copy>Hasta 50 resultados guardados en este dispositivo, sin imágenes, PDF ni nombres de archivos originales.</Copy><Notice /><ErrorMessage message={app.error} />{!app.ready ? <Copy>Cargando historial…</Copy> : app.history.length === 0 ? <Copy>Todavía no tienes resultados guardados.</Copy> : app.history.map(r => <Card key={r.id}><Heading>Análisis de ejemplo</Heading><Copy>{new Date(r.createdAt).toLocaleString('es-ES')}</Copy><Action title="Abrir resultado" secondary onPress={() => router.push({ pathname: '/resultado', params: { id: r.id } })} /></Card>)}{confirm ? <Card><Copy>¿Borrar todos los resultados locales? Esta acción no se puede deshacer.</Copy><Action title="Confirmar borrado" disabled={app.busy} onPress={() => { void app.clearHistory().then(() => setConfirm(false)); }} /><Action title="Cancelar" secondary onPress={() => setConfirm(false)} /></Card> : <Action title="Borrar historial local" secondary disabled={!app.ready || app.busy} onPress={() => setConfirm(true)} />}<Action title="Ir al inicio" onPress={() => router.replace('/')} /></Screen>;
}
