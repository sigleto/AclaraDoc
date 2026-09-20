import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { AnalysisResult, DocumentPage, SelectedDocument } from '../types/document';
import { analyzeDocument } from '../services/analysis';
import { decodeHistory, encodeHistory, HISTORY_KEY } from '../services/history';
import { clearAbandonedPickerCache, makeId, releasePages } from '../services/documents';

function useAppState() {
  const [document, setDocument] = useState<SelectedDocument | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const historyReadable = useRef(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try { clearAbandonedPickerCache(); } catch { if (active) setError('No se pudieron limpiar algunas copias temporales.'); }
      try { const results = decodeHistory(await AsyncStorage.getItem(HISTORY_KEY)); if (active) setHistory(results); }
      catch { historyReadable.current = false; if (active) setError('No se pudo cargar el historial. Puedes borrarlo desde Historial.'); }
      finally { if (active) setReady(true); }
    }
    void load();
    return () => { active = false; };
  }, []);
  function addPages(pages: DocumentPage[]) {
    if (!pages.length) return;
    setDocument(previous => ({ id: previous?.id ?? makeId(), createdAt: previous?.createdAt ?? new Date().toISOString(), pages: [...(previous?.pages ?? []), ...pages] }));
  }
  function removePage(id: string) {
    const page = document?.pages.find(p => p.id === id);
    if (page) releasePages([page]);
    setDocument(previous => previous ? { ...previous, pages: previous.pages.filter(p => p.id !== id) } : null);
  }
  function movePage(index: number, direction: -1 | 1) {
    setDocument(previous => {
      if (!previous || index + direction < 0 || index + direction >= previous.pages.length) return previous;
      const pages = [...previous.pages];
      [pages[index], pages[index + direction]] = [pages[index + direction], pages[index]];
      return { ...previous, pages };
    });
  }
  function discard() { if (document) releasePages(document.pages); setDocument(null); }
  async function analyze() {
    if (!document || !ready || lock.current) return null;
    lock.current = true; setBusy(true); setError(null);
    try {
      const result = await analyzeDocument(document);
      setCurrentResult(result);
      try {
        if (!historyReadable.current) throw new Error('Historial no disponible');
        const serialized = encodeHistory([result, ...history.filter(r => r.id !== result.id)]);
        await AsyncStorage.setItem(HISTORY_KEY, serialized);
        setHistory(decodeHistory(serialized));
      } catch { setError('El resultado está disponible, pero no pudo guardarse en el historial local.'); }
      try { discard(); } catch { setDocument(null); setError('Resultado disponible. No se pudieron borrar algunas copias temporales; se intentará al reiniciar.'); }
      return result;
    } finally { lock.current = false; setBusy(false); }
  }
  async function clearHistory() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await AsyncStorage.removeItem(HISTORY_KEY); setHistory([]); setCurrentResult(null); historyReadable.current = true; setError(null); }
    catch { setError('No se pudo borrar el historial. Inténtalo de nuevo.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return { document, history, currentResult, ready, busy, error, addPages, removePage, movePage, discard, analyze, clearHistory };
}
const Context = createContext<ReturnType<typeof useAppState> | null>(null);
export function AppProvider({ children }: PropsWithChildren) { const value = useAppState(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useApp() { const value = useContext(Context); if (!value) throw new Error('AppProvider missing'); return value; }
