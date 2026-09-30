import { AdsController } from './core';
import { getAdsDriver } from './sdk';

// Survives Fast Refresh/remounts. A fresh JS process updates UMP again.
const runtime = globalThis as typeof globalThis & { aclaraAds?: AdsController };
export function getAdsController() {
  runtime.aclaraAds ??= new AdsController(getAdsDriver());
  return runtime.aclaraAds;
}
