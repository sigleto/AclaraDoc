// Public identifiers only. Shared by Expo's config and the Android runtime.
export const ADMOB = {
  androidAppId: 'ca-app-pub-6921150380725872~2266448481',
  // Official sample App ID; TestIds exports ad units, not application IDs.
  testAndroidAppId: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-6921150380725872/9496618545',
  interstitial: 'ca-app-pub-6921150380725872/5892501176',
} as const;

export function selectAdAppId(productionBuild: boolean) {
  return productionBuild ? ADMOB.androidAppId : ADMOB.testAndroidAppId;
}

export function selectAdUnits(
  development: boolean,
  productionBuild: boolean,
  testIds: { ADAPTIVE_BANNER: string; INTERSTITIAL: string },
) {
  const real = !development && productionBuild;
  return {
    banner: real ? ADMOB.banner : testIds.ADAPTIVE_BANNER,
    interstitial: real ? ADMOB.interstitial : testIds.INTERSTITIAL,
  };
}
