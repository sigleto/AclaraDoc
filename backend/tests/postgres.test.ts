import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import request from "supertest";
import { PDFDocument } from "pdf-lib";
import { createQuotaStore } from "../src/create-quota-store.js";
import { readConfig } from "../src/config.js";
import { MemoryQuotaStore, hashInstallation } from "../src/quota-store.js";
import { SQLiteQuotaStore } from "../src/sqlite-quota-store.js";
import { PostgresQuotaStore } from "../src/postgres-quota-store.js";
import { postgresOptions } from "../src/postgres-client.js";
import { migrate } from "../src/migrations.js";
import { backendRoot } from "../src/paths.js";
import { createApp, type RequestMetric } from "../src/app.js";
import { mockAnalysis } from "../../shared/analysis.js";
import { DAY_MS } from "../src/quota-config.js";
import { FakeDatabase } from "./support/fake-postgres.js";

const secret = "synthetic-test-secret-not-for-production";
// Reserved .invalid host; never used for a connection.
const databaseUrl = "postgresql://test:synthetic@database.invalid/quota?sslmode=require";
const config = readConfig({ QUOTA_STORE: "postgres", DATABASE_URL: databaseUrl, QUOTA_HASH_SECRET: secret, ANALYSIS_MODE: "gemini", GEMINI_API_KEY: "synthetic", FREE_TIER_CONFIRMED: "true" });
const time = Date.UTC(2026, 8, 22);
const day = Math.floor(time / DAY_MS);
const hash = hashInstallation(randomUUID(), secret);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT9sAAAAASUVORK5CYII=", "base64");
function post(app: ReturnType<typeof createApp>, id = randomUUID(), bytes = png, name = "private-original.png") {
  return request(app).post("/api/analyze").set("X-AclaraDoc-Consent", "accepted-v1").set("X-AclaraDoc-Installation", id).attach("files", bytes, name);
}

test("store selection preserves memory/local SQLite and explicitly selects PostgreSQL", async () => {
  const memory = await createQuotaStore(readConfig({}));
  assert.ok(memory instanceof MemoryQuotaStore);
  const sqlite = await createQuotaStore(readConfig({ QUOTA_STORE: "sqlite" }), { sqlitePath: ":memory:" });
  assert.ok(sqlite instanceof SQLiteQuotaStore);
  const pool = new FakeDatabase().pool();
  const postgres = await createQuotaStore(config, { pool });
  assert.ok(postgres instanceof PostgresQuotaStore);
  assert.equal(readConfig({ ANALYSIS_MODE: "gemini", GEMINI_API_KEY: "synthetic", FREE_TIER_CONFIRMED: "true", QUOTA_HASH_SECRET: secret }).QUOTA_STORE, "sqlite");
  await memory.close(); await sqlite.close(); await postgres.close();
  assert.equal(pool.ended, true);
  for (const value of [undefined, "", "invalid", "https://database.invalid/quota"]) {
    assert.throws(() => readConfig({ QUOTA_STORE: "postgres", DATABASE_URL: value }), /DATABASE_URL/);
  }
  assert.throws(() => createApp(config), /./); // Never silently selects memory.
});

test("pool enforces small bounds and verified TLS even if URL tries to disable it", () => {
  const options = postgresOptions(databaseUrl.replace("sslmode=require", "sslmode=disable&sslcert=private-path"));
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.max, 2);
  assert.equal(options.connectionTimeoutMillis, 5000);
  assert.equal(options.query_timeout, 6000);
  assert.equal(options.statement_timeout, undefined);
  assert.ok(!options.connectionString?.includes("ssl"));
});

test("simulated concurrent reservations serialize both daily limits across pools", async () => {
  for (const sameDevice of [true, false]) {
    const database = new FakeDatabase();
    const stores = [new PostgresQuotaStore(database.pool()), new PostgresQuotaStore(database.pool())];
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => stores[i % 2].consume(sameDevice ? hash : hashInstallation(randomUUID(), secret), day, 3, 20, time)));
    assert.equal(results.filter(Boolean).length, sameDevice ? 3 : 20);
    assert.equal((await stores[0].read(hash, day)).global, sameDevice ? 3 : 20);
    assert.equal(database.queries.filter(q => q.sql.includes("FOR UPDATE")).length, 30);
    assert.equal(database.queries.filter(q => q.sql.startsWith("SET LOCAL statement_timeout")).length, 31);
    assert.equal(database.queries.filter(q => q.sql === "BEGIN").length, database.queries.filter(q => q.sql === "COMMIT").length);
    await Promise.all(stores.map(store => store.close()));
  }
});

test("failed second increment and cancellation roll back the whole reservation", async () => {
  const database = new FakeDatabase();
  const store = new PostgresQuotaStore(database.pool());
  database.failSql = "INSERT INTO global_quota";
  await assert.rejects(store.consume(hash, day, 3, 20, time), { code: "UNAVAILABLE" });
  database.failSql = "";
  assert.deepEqual(await store.read(hash, day), { device: 0, global: 0, cooldown: 0 });
  await assert.rejects(store.consume(hash, day, 3, 20, time, AbortSignal.abort()), { code: "CANCELLED" });
  assert.equal((await store.read(hash, day)).global, 0);
  assert.ok(database.queries.some(q => q.sql === "ROLLBACK"));
  await store.close();
});

test("application restart keeps attempts and Google pause; rejected requests do not extend pause", async t => {
  const database = new FakeDatabase();
  const id = randomUUID();
  let now = time;
  let app = createApp(config, { quotaStore: new PostgresQuotaStore(database.pool()), now: () => now, analyze: async () => { throw { status: 429 }; } });
  await post(app, id).expect(429);
  await app.locals.dispose();
  let calls = 0;
  app = createApp(config, { quotaStore: new PostgresQuotaStore(database.pool()), now: () => now, analyze: async () => { calls++; return mockAnalysis(); } });
  t.after(() => app.locals.dispose());
  now += 30 * 60_000;
  const denied = await post(app, id).expect(429);
  assert.equal(denied.body.error.retryAfterSeconds, 1800);
  assert.equal(calls, 0);
  now += 30 * 60_000;
  assert.equal((await post(app, id).expect(200)).body.quota.remaining, 1);
});

test("database outage fails closed without provider calls or private errors; recovery persists pending pause", async t => {
  const database = new FakeDatabase();
  const store = new PostgresQuotaStore(database.pool());
  const metrics: RequestMetric[] = [];
  let calls = 0;
  const app = createApp(config, { quotaStore: store, log: metric => metrics.push(metric), now: () => time, analyze: async () => { calls++; return mockAnalysis(); } });
  t.after(() => app.locals.dispose());
  database.fail = true;
  const response = await post(app).expect(503);
  assert.equal(response.body.error.code, "UNAVAILABLE");
  assert.equal(calls, 0);
  assert.ok(!JSON.stringify([response.body, metrics]).includes("synthetic"));
  await assert.rejects(store.pause(time + 60_000), { code: "UNAVAILABLE" });
  database.fail = false;
  assert.equal((await store.read(hash, day)).cooldown, time + 60_000);
  await post(app).expect(429);
  assert.equal(calls, 0);
});

test("PostgreSQL application preserves image/PDF validation and sends only hashes/counts to storage", async t => {
  const database = new FakeDatabase();
  const store = new PostgresQuotaStore(database.pool());
  const metrics: RequestMetric[] = [];
  const seen: string[] = [];
  const app = createApp(config, { quotaStore: store, now: () => time, log: metric => metrics.push(metric), analyze: async files => { seen.push(files[0].mimetype); return mockAnalysis(); } });
  t.after(() => app.locals.dispose());
  const id = randomUUID();
  await post(app, id, Buffer.from("invalid-private-file")).expect(415);
  assert.equal((await store.read(hashInstallation(id, secret), day)).global, 0);
  await post(app, id).expect(200);
  const pdf = await PDFDocument.create(); pdf.addPage();
  await post(app, id, Buffer.from(await pdf.save()), "private-original.pdf").expect(200);
  assert.deepEqual(seen, ["image/png", "application/pdf"]);
  const output = JSON.stringify([database.state, database.queries, metrics, (await request(app).get("/health")).body]);
  for (const value of [id, secret, databaseUrl, "private-original", "invalid-private-file", png.toString("base64"), "127.0.0.1"]) assert.ok(!output.includes(value));
  await store.consume(hash, day - 7, 3, 20, time);
  await store.cleanup(day - 6);
  assert.equal((await store.read(hash, day - 7)).global, 0);
  assert.equal((await store.read(hashInstallation(id, secret), day)).device, 2);
});

test("proxy ignores spoofed prefixes and trusts only explicit immediate proxy ranges", async t => {
  for (const trusted of ["", "127.0.0.1/32,::1/128"]) {
    const local = readConfig({ QUOTA_HASH_SECRET: secret, TRUST_PROXY_CIDRS: trusted });
    const app = createApp({ ...local, ANALYSIS_MODE: "gemini" }, { ipLimit: 1, analyze: async () => mockAnalysis() });
    t.after(() => app.locals.dispose());
    await post(app).set("X-Forwarded-For", "192.0.2.10, 198.51.100.1").expect(200);
    assert.equal((await post(app).set("X-Forwarded-For", "192.0.2.99, 198.51.100.1").expect(429)).body.error.code, "IP_LIMIT");
    await post(app).set("X-Forwarded-For", "198.51.100.2").expect(trusted ? 200 : 429);
  }
  for (const proxy of ["true", "1", "0.0.0.0/0", "::/0", "loopback", "127.0.0.1/33", "::1/129"]) assert.throws(() => readConfig({ TRUST_PROXY_CIDRS: proxy }), /TRUST_PROXY/);
});

test("late database error consumes nothing and releases the ephemeral IP reservation", async t => {
  const database = new FakeDatabase();
  const store = new PostgresQuotaStore(database.pool());
  let calls = 0;
  const app = createApp(config, { quotaStore: store, ipLimit: 1, now: () => time, analyze: async () => { calls++; return mockAnalysis(); } });
  t.after(() => app.locals.dispose());
  database.failSql = "INSERT INTO global_quota";
  await post(app).expect(503);
  assert.equal(calls, 0);
  database.failSql = "";
  assert.equal((await store.read(hash, day)).global, 0);
  await post(app).expect(200);
  assert.equal(calls, 1);
});

test("concurrent HTTP requests cannot exceed the IP budget while PostgreSQL is awaited", async t => {
  const database = new FakeDatabase();
  const store = new PostgresQuotaStore(database.pool());
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  const original = store.consume.bind(store);
  store.consume = async (...args) => { started(); await waiting; return original(...args); };
  const app = createApp(config, { quotaStore: store, ipLimit: 1, now: () => time, analyze: async () => mockAnalysis() });
  t.after(() => app.locals.dispose());
  const first = post(app).expect(200).then();
  try {
    await ready;
    assert.equal((await post(app).expect(429)).body.error.code, "IP_LIMIT");
  } finally { release(); await first; }
  assert.equal((await store.read(hash, day)).global, 1);
});

test("migrations are transactional, repeat safely and reject modified applied migrations", async () => {
  const database = new FakeDatabase();
  const pool = database.pool();
  const directory = resolve(backendRoot, "migrations");
  await migrate(pool, directory);
  await migrate(pool, directory);
  assert.equal(Object.keys(database.state.migrations).length, 1);
  assert.equal(database.queries.filter(q => q.sql.startsWith("CREATE TABLE device_quota")).length, 1);
  database.state.migrations["001_quotas.sql"] = "modified";
  await assert.rejects(migrate(pool, directory), { code: "UNAVAILABLE" });
  assert.equal(database.queries.at(-1)?.sql, "ROLLBACK");
  await pool.end();
});
