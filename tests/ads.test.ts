import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ADMOB, selectAdAppId, selectAdUnits } from '../ads.config';
import { AdsController, bannerAllowed, type AdsDriver, type ConsentInfo } from '../src/ads/core';

function fixture() {
  let time = 1_000_000;
  let info: ConsentInfo = { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' };
  const calls = { initialize: 0, update: 0, form: 0, load: 0, show: 0, destroy: 0, navigated: 0 };
  let events: Parameters<AdsDriver['interstitial']>[0];
  const driver: AdsDriver = {
    updateConsent: async () => { calls.update++; return info; },
    showRequiredConsent: async () => { calls.form++; return info; },
    getConsent: async () => info,
    privacyOptions: async () => info,
    initialize: async () => { calls.initialize++; },
    interstitial: callbacks => {
      events = callbacks;
      return { load() { calls.load++; }, show: async () => { calls.show++; }, destroy() { calls.destroy++; } };
    },
  };
  const controller = new AdsController(driver, () => time);
  return { controller, calls, driver,
    info: (value: ConsentInfo) => { info = value; }, advance: (value: number) => { time += value; },
    loaded: () => events.loaded(), ended: () => events.ended(),
    result: (canShow = true) => controller.showBeforeResult(
      () => { calls.navigated++; },
      () => canShow,
    ) };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('development, preview release and unspecified builds always use supplied official TestIds', () => {
  assert.equal(selectAdAppId(false), ADMOB.testAndroidAppId);
  assert.equal(selectAdAppId(true), ADMOB.androidAppId);
  const ids = { ADAPTIVE_BANNER: 'official-banner', INTERSTITIAL: 'official-interstitial' };
  for (const [dev, prod] of [[true, true], [true, false], [false, false]])
    assert.deepEqual(selectAdUnits(dev, prod, ids), { banner: ids.ADAPTIVE_BANNER, interstitial: ids.INTERSTITIAL });
  assert.deepEqual(selectAdUnits(false, true, ids), { banner: ADMOB.banner, interstitial: ADMOB.interstitial });
  const adapter = readFileSync('src/ads/sdk.android.ts', 'utf8');
  assert.match(adapter, /getSdk\(\)!\.TestIds/);
  assert.match(adapter, /requestNonPersonalizedAdsOnly: true/);
});

test('UMP resolves before initialization and initializes only once', async () => {
  const f = fixture();
  await Promise.all([f.controller.start(() => true), f.controller.start(() => true)]);
  assert.deepEqual([f.calls.update, f.calls.form, f.calls.initialize], [1, 1, 1]);
  await f.controller.openPrivacy();
  assert.equal(f.calls.initialize, 1);
});

test('consent unavailable or denied blocks initialization and ad loads', async () => {
  const f = fixture();
  f.info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' });
  await f.controller.start(() => true);
  f.controller.preload();
  assert.equal(f.calls.initialize, 0);
  assert.equal(f.calls.load, 0);
  f.result();
  assert.equal(f.calls.navigated, 1);
});

test('offline consent only uses prior UMP authorization', async () => {
  for (const allowed of [true, false]) {
    const f = fixture();
    f.info({ canRequestAds: allowed, privacyOptionsRequirementStatus: 'UNKNOWN' });
    f.driver.updateConsent = async () => { throw new Error('offline'); };
    await f.controller.start(() => true);
    assert.equal(f.controller.snapshot().ready, allowed);
  }
});

test('required consent form is deferred until a safe home state', async () => {
  const f = fixture();
  f.info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' });
  await f.controller.start(() => false);
  assert.equal(f.calls.form, 0);
  await f.controller.start(() => true);
  assert.equal(f.calls.form, 1);
});

test('a loaded interstitial is requested before every completed result transition', async () => {
  const f = fixture();
  await f.controller.start(() => true);
  f.controller.preload();
  f.loaded();
  f.result();
  assert.deepEqual([f.calls.show, f.calls.navigated], [1, 1]);
  f.ended();
  await flush();
  assert.equal(f.calls.load, 2);
  f.loaded();
  f.result();
  assert.deepEqual([f.calls.show, f.calls.navigated], [2, 2]);
});

test('missing, stale or background inventory never delays the result', async () => {
  const missing = fixture();
  await missing.controller.start(() => true);
  missing.result();
  assert.deepEqual([missing.calls.show, missing.calls.navigated], [0, 1]);

  const stale = fixture();
  await stale.controller.start(() => true);
  stale.controller.preload(); stale.loaded(); stale.advance(60 * 60_000); stale.result();
  assert.deepEqual([stale.calls.show, stale.calls.navigated], [0, 1]);

  const background = fixture();
  await background.controller.start(() => true);
  background.controller.preload(); background.loaded(); background.result(false);
  assert.deepEqual([background.calls.show, background.calls.navigated], [0, 1]);
});

test('show failure and repeated calls never block result navigation', async () => {
  const f = fixture();
  const original = f.driver.interstitial;
  f.driver.interstitial = callbacks => ({ ...original(callbacks), show: async () => { throw new Error('no activity'); } });
  await f.controller.start(() => true);
  f.controller.preload(); f.loaded(); f.result(); f.result();
  assert.equal(f.calls.navigated, 2);
  await flush();
  assert.equal(f.calls.destroy, 1);
});

test('banners allow only home/history and integrations remain outside document screens', () => {
  for (const path of ['/', '/historial', '/revision', '/resultado', '/privacidad']) {
    assert.equal(bannerAllowed(path, false), ['/', '/historial'].includes(path));
    assert.equal(bannerAllowed(path, true), false);
  }
  const screens = readdirSync('src/app').filter(file => file.endsWith('.tsx'));
  assert.deepEqual(screens.filter(file => readFileSync(`src/app/${file}`, 'utf8').includes('<AdBanner')).sort(), ['historial.tsx', 'index.tsx']);
});

test('EAS profiles retain APK/AAB, Render URL and package/versionCode', () => {
  const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
  assert.equal(eas.build.preview.android.buildType, 'apk');
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
  for (const profile of ['preview', 'production']) assert.equal(eas.build[profile].env.EXPO_PUBLIC_API_URL, 'https://aclaradoc.onrender.com');
  const { expo } = JSON.parse(readFileSync('app.json', 'utf8'));
  assert.equal(expo.android.package, 'com.sigleto.aclaradoc');
  assert.equal(expo.android.versionCode, 2);
  assert.equal(expo.version, '1.1.0');
});
