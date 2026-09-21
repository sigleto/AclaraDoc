import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  AnalysisResult,
  DocumentPage,
  SelectedDocument,
} from "../types/document";
import { LIMITS } from "../../shared/analysis";
import { analyzeDocument, usesBackend } from "../services/analysis";
import { decodeHistory, encodeHistory, HISTORY_KEY } from "../services/history";
import {
  clearAbandonedPickerCache,
  makeId,
  releasePages,
} from "../services/documents";

function useAppState() {
  const [document, setDocument] = useState<SelectedDocument | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const lock = useRef(false);
  const historyLock = useRef(false);
  const historyReadable = useRef(true);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        clearAbandonedPickerCache();
      } catch {
        if (active)
          setError("No se pudieron limpiar algunas copias temporales.");
      }
      try {
        const results = decodeHistory(await AsyncStorage.getItem(HISTORY_KEY));
        if (active) setHistory(results);
      } catch {
        historyReadable.current = false;
        if (active)
          setError(
            "No se pudo cargar el historial. Puedes borrarlo desde Historial.",
          );
      } finally {
        if (active) setReady(true);
      }
    }
    void load();
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);

  function addPages(pages: DocumentPage[]) {
    if (!pages.length) return;
    if (
      lock.current ||
      (document?.pages.length ?? 0) + pages.length > LIMITS.files ||
      pages.some((p) => (p.size ?? 0) > LIMITS.fileBytes)
    ) {
      releasePages(pages);
      throw new Error(
        "Selecciona como máximo 6 archivos, de hasta 4 MB cada uno.",
      );
    }
    setDocument((previous) => ({
      id: previous?.id ?? makeId(),
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      pages: [...(previous?.pages ?? []), ...pages],
    }));
  }
  function removePage(id: string) {
    if (lock.current) return;
    const page = document?.pages.find((p) => p.id === id);
    if (page) releasePages([page]);
    setDocument((previous) =>
      previous
        ? { ...previous, pages: previous.pages.filter((p) => p.id !== id) }
        : null,
    );
  }
  function movePage(index: number, direction: -1 | 1) {
    if (lock.current) return;
    setDocument((previous) => {
      if (
        !previous ||
        index + direction < 0 ||
        index + direction >= previous.pages.length
      )
        return previous;
      const pages = [...previous.pages];
      [pages[index], pages[index + direction]] = [
        pages[index + direction],
        pages[index],
      ];
      return { ...previous, pages };
    });
  }
  function discard() {
    if (lock.current) return;
    if (document) releasePages(document.pages);
    setDocument(null);
  }
  async function analyze(acceptedNow = false) {
    if (!document || !ready || lock.current) return null;
    const consent = consentAccepted || acceptedNow;
    if (usesBackend && !consent)
      throw new Error("Debes aceptar el envío antes de analizar.");
    if (acceptedNow) setConsentAccepted(true);
    lock.current = true;
    setBusy(true);
    setError(null);
    setCurrentResult(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await analyzeDocument(document, abort.signal, consent);
      if (abort.signal.aborted) throw new Error("Análisis cancelado.");
      setCurrentResult(result);
      return result;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo analizar el documento.",
      );
      return null;
    } finally {
      try {
        releasePages(document.pages);
      } catch {
        setError((previous) =>
          [
            previous,
            "No se pudieron borrar algunas copias temporales; se intentará al reiniciar.",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
      setDocument(null);
      controller.current = null;
      lock.current = false;
      setBusy(false);
    }
  }
  function cancelAnalysis() {
    controller.current?.abort();
  }
  async function saveResult() {
    if (!currentResult || !ready || historyLock.current) return;
    historyLock.current = true;
    setSaving(true);
    setError(null);
    try {
      if (!historyReadable.current) throw new Error("History unavailable");
      const serialized = encodeHistory([
        currentResult,
        ...history.filter((r) => r.id !== currentResult.id),
      ]);
      await AsyncStorage.setItem(HISTORY_KEY, serialized);
      setHistory(decodeHistory(serialized));
    } catch {
      setError(
        "No se pudo guardar el resultado. Si el historial está dañado, bórralo e inténtalo de nuevo.",
      );
    } finally {
      historyLock.current = false;
      setSaving(false);
    }
  }
  async function clearHistory() {
    if (historyLock.current) return;
    historyLock.current = true;
    setSaving(true);
    try {
      await AsyncStorage.removeItem(HISTORY_KEY);
      setHistory([]);
      historyReadable.current = true;
      setError(null);
    } catch {
      setError("No se pudo borrar el historial. Inténtalo de nuevo.");
    } finally {
      historyLock.current = false;
      setSaving(false);
    }
  }
  return {
    document,
    history,
    currentResult,
    ready,
    busy,
    saving,
    error,
    consentAccepted,
    addPages,
    removePage,
    movePage,
    discard,
    analyze,
    cancelAnalysis,
    saveResult,
    clearHistory,
  };
}
const Context = createContext<ReturnType<typeof useAppState> | null>(null);
export function AppProvider({ children }: PropsWithChildren) {
  const value = useAppState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider missing");
  return value;
}
