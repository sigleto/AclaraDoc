import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ADMOB, selectAdAppId, selectAdUnits } from '../ads.config';
import { AdsController, bannerAllowed, COOLDOWN_MS, type AdsDriver, type ConsentInfo } from '../src/ads/core';

function fixture(raw: string | null = null) {
  let stored = raw;
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
  const storage = { get: async () => stored, set: async (value: string) => { stored = value; } };
  const controller = new AdsController(driver, storage, () => time);
  return { controller, calls, driver, storage, stored: () => stored,
    info: (value: ConsentInfo) => { info = value; }, advance: (value: number) => { time += value; },
    loaded: () => events.loaded(), ended: () => events.ended(),
    exit: () => controller.leaveResult(() => { calls.navigated++; }, () => true) };
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

test('UMP resolves before initialization, single initialization across concurrent starts and privacy changes', async () => {
  const f = fixture();
  await Promise.all([f.controller.start(() => true), f.controller.start(() => true)]);
  assert.deepEqual([f.calls.update, f.calls.form, f.calls.initialize], [1, 1, 1]);
  await f.controller.openPrivacy();
  assert.equal(f.calls.initialize, 1);
});

test('consent unavailable/denied blocks initialization and all loads', async () => {
  const f = fixture();
  f.info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' });
  await f.controller.start(() => true);
  f.controller.preload();
  assert.equal(f.calls.initialize, 0);
  assert.equal(f.calls.load, 0);
  assert.equal(f.controller.snapshot().privacyRequired, true);
  f.exit();
  assert.equal(f.calls.navigated, 1);
});

test('offline consent only uses UMP prior authorization, otherwise continues without advertising', async () => {
  for (const allowed of [true, false]) {
    const f = fixture();
    f.info({ canRequestAds: allowed, privacyOptionsRequirementStatus: 'UNKNOWN' });
    f.driver.updateConsent = async () => { throw new Error('offline'); };
    await f.controller.start(() => true);
    assert.equal(f.controller.snapshot().ready, allowed);
    assert.equal(f.controller.snapshot().resolving, false);
  }
  const f = fixture();
  f.driver.getConsent = async () => { throw new Error('unavailable'); };
  await f.controller.start(() => true);
  assert.equal(f.controller.snapshot().ready, false);
});

test('deferred required form is only offered when back on safe home', async () => {
  const f = fixture();
  f.info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' });
  await f.controller.start(() => false);
  assert.equal(f.calls.form, 0);
  await f.controller.start(() => true);
  assert.equal(f.calls.form, 1);
});

test('first and second analysis never show; third reserves persisted counter before showing', async () => {
  const f = fixture();
  await f.controller.start(() => true);
  f.controller.preload(); f.loaded();
  for (let i = 0; i < 2; i++) { await f.controller.recordCompletion(); f.exit(); }
  assert.equal(f.calls.show, 0);
  await f.controller.recordCompletion();
  f.exit(); f.exit(); await flush();
  assert.equal(f.calls.show, 1);
  assert.equal(f.calls.navigated, 4); // Reentrant presentation is suppressed, navigation is never blocked.
  assert.deepEqual(JSON.parse(f.stored()!), { completed: 0, lastAttemptAt: 1_000_000 });
});

test('frequency persists on restart and cooldown prevents successive interstitials', async () => {
  const first = fixture();
  for (let i = 0; i < 3; i++) await first.controller.recordCompletion();
  const f = fixture(first.stored());
  await f.controller.start(() => true); f.controller.preload(); f.loaded(); f.exit(); await flush(); f.ended();
  for (let i = 0; i < 3; i++) await f.controller.recordCompletion();
  f.advance(60_000); f.controller.preload(); f.loaded(); f.exit();
  assert.equal(f.calls.show, 1);
  f.advance(COOLDOWN_MS); f.exit(); await flush();
  assert.equal(f.calls.show, 2);
});

test('not loaded/load error continues navigation immediately; retry is controlled; listeners destroyed', async () => {
  const f = fixture();
  await f.controller.start(() => true);
  for (let i = 0; i < 3; i++) await f.controller.recordCompletion();
  f.controller.preload(); f.controller.preload();
  assert.equal(f.calls.load, 1);
  f.ended(); f.exit();
  assert.equal(f.calls.navigated, 1);
  assert.equal(f.calls.show, 0);
  assert.equal(f.calls.destroy, 1);
  f.controller.preload(); assert.equal(f.calls.load, 1);
  f.advance(60_000); f.controller.preload(); assert.equal(f.calls.load, 2);
});

test('show failure never blocks navigation and consumes the interval conservatively', async () => {
  const f = fixture();
  const original = f.driver.interstitial;
  f.driver.interstitial = callbacks => ({ ...original(callbacks), show: async () => { throw new Error('no activity'); } });
  await f.controller.start(() => true);
  for (let i = 0; i < 3; i++) await f.controller.recordCompletion();
  f.controller.preload(); f.loaded(); f.exit(); await flush();
  assert.equal(f.calls.navigated, 1);
  assert.equal(f.calls.destroy, 1);
  assert.equal(JSON.parse(f.stored()!).completed, 0);
});

test('storage failure/corruption cannot bypass cap and never blocks navigation', async () => {
  for (const raw of ['{}', 'invalid', '{"completed":999,"lastAttemptAt":0}']) {
    const f = fixture(raw);
    await f.controller.start(() => true); await f.controller.recordCompletion();
    f.controller.preload(); f.loaded(); f.exit();
    assert.equal(f.calls.show, 0); assert.equal(f.calls.navigated, 1);
  }
  const f = fixture();
  await f.controller.start(() => true);
  for (let i = 0; i < 3; i++) await f.controller.recordCompletion();
  f.storage.set = async () => { throw new Error('storage'); };
  f.controller.preload(); f.loaded(); f.exit(); await flush();
  assert.equal(f.calls.show, 0); assert.equal(f.calls.navigated, 1);
});

test('hung persistence, stale inventory, lost focus and consent revocation never show', async () => {
  for (const condition of ['hung', 'stale', 'unfocused', 'revoked']) {
    const f = fixture();
    await f.controller.start(() => true);
    for (let i = 0; i < 3; i++) await f.controller.recordCompletion();
    f.controller.preload(); f.loaded();
    if (condition === 'stale') f.advance(60 * 60_000);
    if (condition === 'revoked') {
      f.info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' });
      await f.controller.openPrivacy();
    }
    if (condition === 'hung') f.storage.set = () => new Promise(() => {});
    f.controller.leaveResult(() => { f.calls.navigated++; }, () => condition !== 'unfocused');
    await new Promise(resolve => setTimeout(resolve, condition === 'hung' ? 550 : 0));
    assert.equal(f.calls.show, 0);
    assert.equal(f.calls.navigated, condition === 'unfocused' ? 0 : 1);
  }
});

test('banners allow only home/history, suppress errors; integrations remain outside document screens', () => {
  for (const path of ['/', '/historial', '/revision', '/resultado', '/privacidad']) {
    assert.equal(bannerAllowed(path, false), ['/', '/historial'].includes(path));
    assert.equal(bannerAllowed(path, true), false);
  }
  const screens = readdirSync('src/app').filter(file => file.endsWith('.tsx'));
  assert.deepEqual(screens.filter(file => readFileSync(`src/app/${file}`, 'utf8').includes('<AdBanner')).sort(), ['historial.tsx', 'index.tsx']);
  const banner = readFileSync('src/ads/AdBanner.android.tsx', 'utf8');
  assert.match(banner, /path !== placement/); // Retained stack screens must not load a second banner.
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
