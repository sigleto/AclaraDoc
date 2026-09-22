import { test } from "node:test";
import { once } from "node:events";
import assert from "node:assert/strict";
import request from "supertest";
import { PDFDocument } from "pdf-lib";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { mockAnalysis, LIMITS, QUOTA_MESSAGE } from "../../shared/analysis.js";
import { AppError } from "../src/errors.js";
import { disposeUploads, validateUploads } from "../src/uploads.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT9sAAAAASUVORK5CYII=",
  "base64",
);
const config = readConfig({});
function post(app: ReturnType<typeof createApp>) {
  return request(app)
    .post("/api/analyze")
    .set("X-AclaraDoc-Installation", "11111111-1111-4111-8111-111111111111")
    .set("X-AclaraDoc-Consent", "accepted-v1");
}
async function pdf(pages: number) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pages; i++) document.addPage();
  return Buffer.from(await document.save());
}

test("health exposes mode but no secrets; consent required before upload", async () => {
  const app = createApp(config);
  const health = await request(app).get("/health").expect(200);
  assert.equal(health.body.mode, "mock");
  assert.equal(health.headers["cache-control"], "no-store");
  assert.match(health.headers["x-aclaradoc-request"], /^[0-9a-f-]{36}$/);
  assert.ok(!JSON.stringify(health.body).includes("GEMINI_API_KEY"));
  await request(app)
    .post("/api/analyze")
    .attach("files", png, "page.png")
    .expect(400);
});
test("restrictive CORS allows configured origin and native without origin", async () => {
  const app = createApp(config);
  await request(app)
    .get("/health")
    .set("Origin", "https://untrusted.example")
    .expect(403);
  const result = await request(app)
    .get("/health")
    .set("Origin", "http://localhost:8081")
    .expect(200);
  assert.equal(
    result.headers["access-control-allow-origin"],
    "http://localhost:8081",
  );
  await request(app).get("/health").expect(200);
});
test("six image pages and mixed PDF are accepted at the boundary", async () => {
  const app = createApp(config);
  let r = post(app);
  for (let i = 0; i < 6; i++) r = r.attach("files", png, "page.png");
  const response = await r.expect(200);
  assert.equal(response.body.simulated, true);
  assert.equal(response.body.analysis.nivelConfianza, "bajo");
  await post(app)
    .attach("files", await pdf(5), "pages.pdf")
    .attach("files", png, "page.png")
    .expect(200);
});
test("MIME, extension and signature must agree, malformed PDF rejected", async () => {
  const app = createApp(config, { ipLimit: 100 });
  await post(app)
    .attach("files", png, { filename: "page.txt", contentType: "image/png" })
    .expect(415);
  await post(app)
    .attach("files", png, { filename: "page.png", contentType: "image/jpeg" })
    .expect(415);
  await post(app)
    .attach("files", Buffer.from("not an image"), "page.png")
    .expect(415);
  await post(app)
    .attach("files", Buffer.from("%PDF-1.7\ninvalid"), "page.pdf")
    .expect(415);
  await post(app).field("extra", "disallowed").expect(400);
});
test("size, file count and actual PDF page count limits", async () => {
  const app = createApp(config, { ipLimit: 100 });
  await post(app)
    .attach("files", Buffer.alloc(LIMITS.fileBytes + 1), "large.png")
    .expect(413);
  await post(app)
    .attach("files", await pdf(7), "pages.pdf")
    .expect(413);
  let r = post(app);
  for (let i = 0; i < 7; i++) r = r.attach("files", png, "page.png");
  await r.expect(413);
  const large = Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)]);
  r = post(app);
  for (let i = 0; i < 4; i++) r = r.attach("files", large, "page.png");
  await r.expect(413);
});
test("IP limit cannot be bypassed with an untrusted X-Forwarded-For", async () => {
  const app = createApp({ ...config, ANALYSIS_MODE: "gemini" }, { ipLimit: 1, analyze: async () => mockAnalysis() });
  await post(app).attach("files", png, "page.png").expect(200);
  const result = await post(app)
    .set("X-Forwarded-For", "192.0.2.12")
    .attach("files", png, "page.png")
    .expect(429);
  assert.equal(result.body.error.code, "IP_LIMIT");
});
test("429 does not retry and opens a shared quota cooldown", async () => {
  let calls = 0;
  let time = Date.now();
  const app = createApp(config, {
    now: () => time,
    analyze: async () => {
      calls++;
      throw { status: 429, message: "secret" };
    },
  });
  const first = await post(app).attach("files", png, "page.png").expect(429);
  assert.equal(first.body.error.message, QUOTA_MESSAGE);
  assert.equal(first.headers["retry-after"], "3600");
  await post(app).attach("files", png, "page.png").expect(429);
  assert.equal(calls, 1);
  time += 3_600_001;
  await post(app).attach("files", png, "page.png").expect(429);
  assert.equal(calls, 2);
});
test("buffers are wiped after success, invalid response and provider failure", async () => {
  for (const scenario of ["success", "invalid", "failure"]) {
    let buffer: Buffer | undefined;
    const app = createApp(config, {
      analyze: async (files) => {
        buffer = files[0].buffer;
        if (scenario === "failure") throw new AppError("QUOTA_EXHAUSTED", 429);
        if (scenario === "invalid")
          return {} as ReturnType<typeof mockAnalysis>;
        return mockAnalysis();
      },
    });
    await post(app)
      .attach("files", png, "page.png")
      .expect(
        scenario === "success" ? 200 : scenario === "invalid" ? 502 : 429,
      );
    assert.ok(buffer?.every((byte) => byte === 0));
  }
});
test("timeout aborts provider and wipes memory even when provider never resolves", async () => {
  let signal: AbortSignal | undefined;
  let buffer: Buffer | undefined;
  const app = createApp(config, {
    timeoutMs: 15,
    analyze: (files, s) => {
      buffer = files[0].buffer;
      signal = s;
      return new Promise(() => {});
    },
  });
  const result = await post(app).attach("files", png, "page.png").expect(504);
  assert.equal(result.body.error.code, "TIMEOUT");
  assert.equal(signal?.aborted, true);
  assert.ok(buffer?.every((byte) => byte === 0));
});
test("validation error and disposal never require temporary files on disk", async () => {
  const buffer = Buffer.from("private invalid bytes");
  const file = {
    buffer,
    size: buffer.length,
    originalname: "page.png",
    mimetype: "image/png",
  } as Express.Multer.File;
  try {
    await assert.rejects(validateUploads([file]));
  } finally {
    disposeUploads([file]);
  }
  assert.ok(buffer.every((byte) => byte === 0));
  assert.equal(file.buffer.length, 0);
});

test("daily real-attempt budget stops at twenty and resets on the next UTC day", async () => {
  let time = Date.UTC(2026, 8, 20, 12);
  let calls = 0;
  const app = createApp({ ...config, ANALYSIS_MODE: "gemini", quotas: { ...config.quotas, DEVICE_DAILY_LIMIT: 20 } }, {
    now: () => time,
    ipLimit: 100,
    analyze: async () => {
      calls++;
      throw new AppError("UNAVAILABLE", 503);
    },
  });
  for (let i = 0; i < 20; i++)
    await post(app).attach("files", png, "page.png").expect(503);
  const response = await post(app).attach("files", png, "page.png").expect(429);
  assert.equal(response.body.error.code, "GLOBAL_LIMIT");
  assert.equal(calls, 20);
  time += 86_400_000;
  await post(app).attach("files", png, "page.png").expect(503);
  assert.equal(calls, 21);
});

test("only two requests reach the provider concurrently and slots are released", async () => {
  const releases: (() => void)[] = [];
  let bothStarted!: () => void;
  const ready = new Promise<void>((resolve) => { bothStarted = resolve; });
  const app = createApp(config, {
    ipLimit: 100,
    analyze: async () => {
      await new Promise<void>((resolve) => {
        releases.push(resolve);
        if (releases.length === 2) bothStarted();
      });
      return mockAnalysis();
    },
  });
  const first = post(app).attach("files", png, "page.png").expect(200).then();
  const second = post(app).attach("files", png, "page.png").expect(200).then();
  try {
    await ready;
    await post(app).attach("files", png, "page.png").expect(429);
    assert.equal(releases.length, 2);
  } finally {
    releases.forEach((release) => release());
    await Promise.all([first, second]);
  }
  // Invalid uploads also acquire and release a slot without reaching the provider.
  await post(app).attach("files", Buffer.from("invalid"), "page.png").expect(415);
});

test("disconnecting the client aborts the provider and clears uploaded bytes", async (t) => {
  let buffer: Buffer | undefined;
  let started!: () => void;
  let aborted!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const stopped = new Promise<void>(resolve => { aborted = resolve; });
  const app = createApp(config, { analyze: (files, signal) => {
    buffer = files[0].buffer;
    started();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      aborted();
      reject(new AppError('CANCELLED', 499));
    }, { once: true }));
  } });
  // An aborted Supertest request does not reliably close its implicit server.
  const server = app.listen(0);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  await once(server, 'listening');
  const req = request(server).post('/api/analyze')
    .set('X-AclaraDoc-Installation', '11111111-1111-4111-8111-111111111111')
    .set('X-AclaraDoc-Consent', 'accepted-v1').attach('files', png, 'page.png');
  const response = req.then(() => {}, () => {});
  await ready;
  req.abort();
  await stopped;
  await response;
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(buffer?.every(byte => byte === 0));
});
