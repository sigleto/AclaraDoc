import { useState } from 'react';
import { Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Action, Card, Copy, ErrorMessage, Heading, Notice, Screen, Title } from '../components/ui';
import { DocumentActions } from '../components/DocumentActions';
import { useApp } from '../state/AppProvider';
export default function Review() {
  const app = useApp(); const router = useRouter(); const [error, setError] = useState<string | null>(null);
  async function run() { try { const result = await app.analyze(); if (result) router.replace({ pathname: '/resultado', params: { id: result.id } }); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar el ejemplo.'); } }
  function edit(action: () => void) { try { action(); setError(null); } catch { setError('No se pudo eliminar la copia temporal. Inténtalo de nuevo.'); } }
  const pages = app.document?.pages ?? [];
  return <Screen><Title>Revisa tus páginas</Title><Copy>{pages.length} adjunto(s). Ordena las imágenes como aparecen en el documento. Cada PDF conserva todas sus páginas; no se previsualizan ni se cuentan en esta versión.</Copy><Notice />{pages.map((page, index) => <Card key={page.id}><Heading>{index + 1}. {page.kind === 'pdf' ? 'PDF completo' : 'Página'}</Heading><Copy>{page.name}</Copy>{page.kind === 'image' && <Image source={{ uri: page.uri }} accessibilityLabel={`Vista previa de la página ${index + 1}`} style={{ width: '100%', height: 240, borderRadius: 12 }} resizeMode="contain" />}<Action title="Subir" secondary disabled={index === 0 || app.busy} onPress={() => app.movePage(index, -1)} /><Action title="Bajar" secondary disabled={index === pages.length - 1 || app.busy} onPress={() => app.movePage(index, 1)} /><Action title="Quitar adjunto" secondary disabled={app.busy} onPress={() => edit(() => app.removePage(page.id))} /></Card>)}{!pages.length && <Copy>Aún no hay documentos. Añade imágenes o PDF para continuar.</Copy>}<Heading>Añadir más páginas</Heading><DocumentActions /><ErrorMessage message={error ?? app.error} /><Action title={app.busy ? 'Generando ejemplo…' : 'Ver análisis simulado'} disabled={!pages.length || app.busy || !app.ready} onPress={() => void run()} /><Action title="Descartar documento" secondary disabled={!pages.length || app.busy} onPress={() => edit(() => { app.discard(); router.replace('/'); })} /></Screen>;
}
