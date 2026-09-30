import Constants, { ExecutionEnvironment } from 'expo-constants';
import { selectAdUnits } from '../../ads.config';
import type { AdsDriver } from './core';

type Sdk = typeof import('react-native-google-mobile-ads');
let sdk: Sdk | null | undefined;
export function getSdk(): Sdk | null {
  if (sdk !== undefined) return sdk;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
      Constants.expoConfig?.extra?.ads?.enabled !== true) return (sdk = null);
  // Do not evaluate TurboModules in Expo Go.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { sdk = require('react-native-google-mobile-ads') as Sdk; } catch { sdk = null; }
  return sdk;
}
export function getAdUnits() {
  return selectAdUnits(__DEV__, Constants.expoConfig?.extra?.ads?.production === true, getSdk()!.TestIds);
}
export const requestOptions = { requestNonPersonalizedAdsOnly: true } as const;
export function getAdsDriver(): AdsDriver | null {
  const api = getSdk();
  if (!api) return null;
  return {
    updateConsent: () => api.AdsConsent.requestInfoUpdate(),
    showRequiredConsent: () => api.AdsConsent.loadAndShowConsentFormIfRequired(),
    getConsent: () => api.AdsConsent.getConsentInfo(),
    privacyOptions: () => api.AdsConsent.showPrivacyOptionsForm(),
    initialize: () => api.default().initialize(),
    interstitial(events) {
      const ad = api.InterstitialAd.createForAdRequest(getAdUnits().interstitial, requestOptions);
      ad.addAdEventListener(api.AdEventType.LOADED, events.loaded);
      ad.addAdEventListener(api.AdEventType.CLOSED, events.ended);
      ad.addAdEventListener(api.AdEventType.ERROR, events.ended);
      return ad;
    },
  };
}
