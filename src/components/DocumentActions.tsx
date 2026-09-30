import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { selectPages, type SelectionSource } from '../services/documents';
import { useApp } from '../state/AppProvider';
import { Action, ErrorMessage } from './ui';
import { useAds } from '../ads/AdsProvider';
export function DocumentActions({ onAdSafetyChange }: { onAdSafetyChange?: (blocked: boolean) => void }) {
  const ads = useAds();
  const app = useApp(); const router = useRouter();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const lock = useRef(false);
  useEffect(() => { onAdSafetyChange?.(busy || !!error); }, [busy, error, onAdSafetyChange]);
  async function pick(source: SelectionSource) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    ads.setSelectionBlocked(true);
    try { const pages = await selectPages(source); if (pages.length) { app.addPages(pages); router.navigate('/revision'); } }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo seleccionar el documento.'); }
    finally { lock.current = false; setBusy(false); ads.setSelectionBlocked(false); }
  }
  const disabled = busy || app.busy || !app.ready;
  return <><Action title="Fotografiar un documento" onPress={() => void pick('camera')} disabled={disabled} /><Action title="Seleccionar imágenes" onPress={() => void pick('images')} disabled={disabled} secondary /><Action title="Seleccionar PDF" onPress={() => void pick('pdf')} disabled={disabled} secondary /><ErrorMessage message={error} /></>;
}
