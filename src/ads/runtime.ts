import AsyncStorage from '@react-native-async-storage/async-storage';
import { ADS_STORAGE_KEY, AdsController } from './core';
import { getAdsDriver } from './sdk';

// Survives Fast Refresh/remounts. A fresh JS process updates UMP again.
const runtime = globalThis as typeof globalThis & { aclaraAds?: AdsController };
export function getAdsController() {
  runtime.aclaraAds ??= new AdsController(getAdsDriver(), {
    get: () => AsyncStorage.getItem(ADS_STORAGE_KEY),
    set: value => AsyncStorage.setItem(ADS_STORAGE_KEY, value),
  });
  return runtime.aclaraAds;
}
