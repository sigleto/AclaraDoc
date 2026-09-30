import type { AdsDriver } from './core';
// Metro resolves sdk.android.ts on Android; web/iOS never import the native SDK.
export function getAdsDriver(): AdsDriver | null { return null; }
