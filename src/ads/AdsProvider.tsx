import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { getAdsController } from './runtime';

function useAdsState() {
  const [controller] = useState(getAdsController);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const path = usePathname();
  const app = useApp();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const selectionBlocked = useRef(false);
  const safe = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    safe.current = foreground && path === '/' && !app.busy && !app.document && !selectionBlocked.current;
    if (safe.current && !state.resolving) void controller.start(() => safe.current && !selectionBlocked.current);
    const preload = () => {
      if (foreground && !app.busy && !app.document && !selectionBlocked.current &&
          ['/', '/historial', '/resultado'].includes(path)) controller.preload();
    };
    preload();
    const timer = setInterval(preload, 60_000);
    return () => { safe.current = false; clearInterval(timer); };
  }, [controller, path, foreground, app.busy, app.document, state.ready, state.resolving]);
  useEffect(() => {
    // Deep links also update UMP; any required form waits for the home screen.
    void controller.start(() => safe.current && !selectionBlocked.current);
  }, [controller]);
  function setSelectionBlocked(blocked: boolean) { selectionBlocked.current = blocked; }
  return { ...state, controller, foreground, setSelectionBlocked };
}
const Context = createContext<ReturnType<typeof useAdsState> | null>(null);
export function AdsProvider({ children }: PropsWithChildren) {
  const value = useAdsState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAds() {
  const value = useContext(Context);
  if (!value) throw new Error('AdsProvider missing');
  return value;
}
