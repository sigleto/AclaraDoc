import { useEffect, useRef, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';
import { useAds } from './AdsProvider';
import { bannerAllowed } from './core';
import { getAdUnits, getSdk, requestOptions } from './sdk.android';

function LoadedBanner() {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const api = getSdk();
  if (!api || failed) return null;
  return <View style={{ alignItems: 'center', paddingTop: loaded ? 32 : 0, borderTopWidth: loaded ? 1 : 0, borderColor: '#DCE5DE', height: loaded ? undefined : 1, overflow: 'hidden' }}>
    {loaded && <Text style={{ color: '#40534E', fontSize: 12, paddingBottom: 4 }}>Publicidad</Text>}
    <api.BannerAd unitId={getAdUnits().banner} size={api.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      requestOptions={requestOptions} onAdLoaded={() => { if (mounted.current) setLoaded(true); }}
      onAdFailedToLoad={() => { if (mounted.current) setFailed(true); }} />
  </View>;
}
export function AdBanner({ placement, blocked = false }: { placement: '/' | '/historial'; blocked?: boolean }) {
  const ads = useAds();
  const path = usePathname();
  const { height, width } = useWindowDimensions();
  if (path !== placement || !ads.ready || ads.resolving || !ads.foreground || height < 500 ||
      !bannerAllowed(path, blocked)) return null;
  return <LoadedBanner key={`${path}:${width}`} />;
}
