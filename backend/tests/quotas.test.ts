import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { readConfig } from "../src/config.js";
import { quotaSettings, DAY_MS } from "../src/quota-config.js";
import { createApp, type RequestMetric } from "../src/app.js";
import { MemoryQuotaStore, hashInstallation } from "../src/quota-store.js";
import { SQLiteQuotaStore } from "../src/sqlite-quota-store.js";
import { createGeminiAnalyzer } from "../src/gemini.js";
import { mockAnalysis } from "../../shared/analysis.js";

const secret = "synthetic-test-secret-not-a-production-secret";
const config = { ...readConfig({ QUOTA_HASH_SECRET: secret }), ANALYSIS_MODE: "gemini" as const };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT9sAAAAASUVORK5CYII=", "base64");
function post(app: ReturnType<typeof createApp>, id: string = randomUUID(), bytes = png) {
  return request(app).post("/api/analyze").set("X-AclaraDoc-Consent", "accepted-v1").set("X-AclaraDoc-Installation", id).attach("files", bytes, "private-original-name.png");
}
test("all numeric settings validate ranges and default safely; global never exceeds twenty", () => {
  for (const [key, [fallback, min, max]] of Object.entries(quotaSettings)) {
    for (const value of [undefined, "0", "-1", "NaN", "Infinity", "1.5", "99999999999", String(max + 1)]) {
      assert.equal(readConfig({ [key]: value }).quotas[key as keyof typeof quotaSettings], fallback, `${key}=${value}`);
    }
    assert.equal(readConfig({ [key]: String(min) }).quotas[key as keyof typeof quotaSettings], min);
    assert.equal(readConfig({ [key]: String(max) }).quotas[key as keyof typeof quotaSettings], max);
  }
  assert.throws(() => readConfig({ ANALYSIS_MODE: "gemini", GEMINI_API_KEY: "synthetic", FREE_TIER_CONFIRMED: "true" }), /QUOTA_HASH_SECRET/);
});
test("strict UUID v4 required, errors and health expose no secrets; validation consumes nothing", async t => {
  const store = new MemoryQuotaStore();
  let calls = 0;
  const app = createApp(config, { quotaStore: store, analyze: async () => { calls++; return mockAnalysis(); } });
  t.after(() => app.locals.dispose());
  for (const id of ["", "123", "11111111-1111-1111-8111-111111111111", randomUUID() + "extra", "00000000-0000-0000-0000-000000000000"]) {
    const response = await post(app, id).expect(400);
    assert.equal(response.body.error.code, "INSTALLATION_REQUIRED");
  }
  const id = randomUUID();
  await post(app, id, Buffer.from("private-invalid-document")).expect(415);
  assert.equal(calls, 0);
  assert.equal(store.read(hashInstallation(id, secret), Math.floor(Date.now() / DAY_MS)).global, 0);
  const health = await request(app).get("/health").expect(200);
  assert.ok(!JSON.stringify(health.body).includes(secret));
  assert.equal(health.body.quotas.GLOBAL_DAILY_LIMIT, 20);
});
test("three attempts per installation, fourth denied; second installation independent and reset at UTC midnight", async t => {
  let now = Date.UTC(2026, 8, 22, 23, 50);
  const app = createApp(config, { now: () => now, analyze: async () => mockAnalysis() });
  t.after(() => app.locals.dispose());
  const id = randomUUID();
  for (let n = 0; n < 3; n++) {
    const response = await post(app, id).expect(200);
    assert.equal(response.body.quota.remaining, 2 - n);
  }
  const denied = await post(app, id).expect(429);
  assert.equal(denied.body.error.code, "DEVICE_LIMIT");
  assert.equal(denied.body.error.retryAfterSeconds, 600);
  await post(app).expect(200);
  now += 10 * 60_000;
  const reset = await post(app, id).expect(200);
  assert.equal(reset.body.quota.remaining, 2);
});
test("IP budget spans installations, rejected requests do not extend its window", async t => {
  let time = Date.UTC(2026, 8, 22);
  const app = createApp(config, { now: () => time, analyze: async () => mockAnalysis() });
  t.after(() => app.locals.dispose());
  for (let n = 0; n < 5; n++) await post(app).expect(200);
  const denied = await post(app).expect(429);
  assert.equal(denied.body.error.code, "IP_LIMIT");
  assert.equal(denied.body.error.retryAfterSeconds, 900);
  time += 900_000;
  await post(app).expect(200);
});
test("provider failure counts and allowlisted diagnostics never contain private data", async t => {
  const metrics: RequestMetric[] = [];
  const store = new MemoryQuotaStore();
  const app = createApp(config, { quotaStore: store, log: metric => metrics.push(metric), analyze: async () => { throw { status: 400, message: "private-provider-key-and-document" }; } });
  t.after(() => app.locals.dispose());
  const id = randomUUID();
  const response = await post(app, id).expect(503);
  assert.equal(response.body.quota.remaining, 2);
  assert.equal(store.read(hashInstallation(id, secret), Math.floor(Date.now() / DAY_MS)).global, 1);
  assert.deepEqual(Object.keys(metrics[0]).sort(), ["requestId", "fileType", "size", "durationMs", "code"].sort());
  const output = JSON.stringify([metrics, response.body]);
  for (const text of [id, secret, "private-original-name", "private-provider", png.toString("base64")]) assert.ok(!output.includes(text));
  assert.equal(metrics[0].code, "PROVIDER_REQUEST_REJECTED");
});
test("SQLite survives application restart including Google cooldown; rejects don't extend pause", async t => {
  const directory = mkdtempSync(join(tmpdir(), "aclaradoc-quota-test-"));
  const path = join(directory, "quotas.sqlite");
  let time = Date.UTC(2026, 8, 22);
  const id = randomUUID();
  let store = new SQLiteQuotaStore(path);
  let app = createApp(config, { quotaStore: store, now: () => time, analyze: async () => { throw { status: 429 }; } });
  await post(app, id).expect(429);
  app.locals.dispose();
  store = new SQLiteQuotaStore(path);
  app = createApp(config, { quotaStore: store, now: () => time, analyze: async () => mockAnalysis() });
  t.after(() => { app.locals.dispose(); for (const file of readdirSync(directory)) unlinkSync(join(directory, file)); rmdirSync(directory); });
  time += 30 * 60_000;
  const blocked = await post(app, id).expect(429);
  assert.equal(blocked.body.error.retryAfterSeconds, 1800);
  time += 30 * 60_000;
  const response = await post(app, id).expect(200);
  assert.equal(response.body.quota.remaining, 1);
  await post(app, id).expect(200);
  assert.equal((await post(app, id).expect(429)).body.error.code, "DEVICE_LIMIT");
  assert.ok(!readFileSync(path).includes(Buffer.from(id)));
});
test("both stores delete old records and retain today's counts; HMAC secret separates hashes", () => {
  for (const store of [new MemoryQuotaStore(), new SQLiteQuotaStore(":memory:")]) {
    const hash = hashInstallation(randomUUID(), secret);
    assert.equal(store.consume(hash, 10, 3, 20, 10 * DAY_MS), true);
    assert.equal(store.consume(hash, 17, 3, 20, 17 * DAY_MS), true);
    store.cleanup(11);
    assert.equal(store.read(hash, 10).global, 0);
    assert.equal(store.read(hash, 10).device, 0);
    assert.equal(store.read(hash, 17).device, 1);
    store.close();
  }
  const id = randomUUID();
  assert.notEqual(hashInstallation(id, secret), hashInstallation(id, "different-secret"));
  assert.equal(hashInstallation(id, secret), hashInstallation(id.toUpperCase(), secret));
});
test("mock validates UUID but never consumes real quotas or calls Google", async t => {
  const store = new MemoryQuotaStore();
  const app = createApp(readConfig({}), { quotaStore: store });
  t.after(() => app.locals.dispose());
  const id = randomUUID();
  for (let n = 0; n < 6; n++) {
    const response = await post(app, id).expect(200);
    assert.equal(response.body.simulated, true);
    assert.equal(response.body.quota, undefined);
  }
  assert.equal(store.read(hashInstallation(id, ""), Math.floor(Date.now() / DAY_MS)).global, 0);
});

test("two in-flight calls reserve attempts atomically; a third consumes no quota", async t => {
  const store = new MemoryQuotaStore();
  const releases: (() => void)[] = [];
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const app = createApp(config, { quotaStore: store, analyze: async () => {
    await new Promise<void>(resolve => { releases.push(resolve); if (releases.length === 2) started(); });
    return mockAnalysis();
  } });
  t.after(() => app.locals.dispose());
  const id = randomUUID();
  const first = post(app, id).expect(200).then();
  const second = post(app, id).expect(200).then();
  try {
    await ready;
    assert.equal((await post(app, id).expect(429)).body.error.code, "BUSY");
    assert.equal(store.read(hashInstallation(id, secret), Math.floor(Date.now() / DAY_MS)).device, 2);
  } finally {
    releases.forEach(release => release());
    await Promise.all([first, second]);
  }
});

test("two SQLite connections share the global budget and cleanup runs on app startup", async t => {
  const directory = mkdtempSync(join(tmpdir(), "aclaradoc-quota-test-"));
  const path = join(directory, "quotas.sqlite");
  const first = new SQLiteQuotaStore(path);
  const second = new SQLiteQuotaStore(path);
  let app: ReturnType<typeof createApp> | undefined;
  t.after(() => { app?.locals.dispose(); first.close(); second.close(); for (const file of readdirSync(directory)) unlinkSync(join(directory, file)); rmdirSync(directory); });
  for (let n = 0; n < 20; n++) assert.equal((n % 2 ? first : second).consume(hashInstallation(randomUUID(), secret), 100, 3, 20, 100 * DAY_MS), true);
  assert.equal(second.consume(hashInstallation(randomUUID(), secret), 100, 3, 20, 100 * DAY_MS), false);
  app = createApp(config, { quotaStore: first, now: () => 107 * DAY_MS, analyze: async () => mockAnalysis() });
  assert.equal(first.read("irrelevant", 100).global, 0);
  const response = await post(app).expect(200);
  assert.equal(response.body.quota.remaining, 2);
});

test("fallback success and failure each consume one reservation; fallback 429 opens the pause", async t => {
  for (const status of [200, 503, 429]) {
    const store = new MemoryQuotaStore();
    const now = Date.UTC(2026, 8, 23);
    const models: string[] = [];
    const fallbackConfig = { ...config, GEMINI_FALLBACK_MODEL: "gemini-3.5-flash-lite" as const };
    const analyze = createGeminiAnalyzer(fallbackConfig, async params => {
      models.push(params.model);
      if (models.length === 1 || status !== 200) throw { status: models.length === 1 ? 503 : status,
        message: JSON.stringify({ error: { status: "UNAVAILABLE", message: "Model experiencing high demand" } }) };
      return { text: JSON.stringify(mockAnalysis()) };
    });
    const app = createApp(fallbackConfig, { quotaStore: store, analyze, now: () => now });
    t.after(() => app.locals.dispose());
    const id = randomUUID();
    const response = await post(app, id).expect(status);
    assert.equal(response.body.quota.remaining, 2);
    const counts = store.read(hashInstallation(id, secret), Math.floor(now / DAY_MS));
    assert.equal(counts.global, 1);
    assert.equal(counts.device, 1);
    assert.deepEqual(models, [config.GEMINI_MODEL, fallbackConfig.GEMINI_FALLBACK_MODEL]);
    if (status === 429) {
      assert.equal((await post(app, id).expect(429)).body.error.retryAfterSeconds, 3600);
      assert.equal(models.length, 2);
    }
  }
});
