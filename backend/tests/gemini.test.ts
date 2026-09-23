import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config.js";
import { createGeminiAnalyzer, sanitizeAnalysis } from "../src/gemini.js";
import { mockAnalysis, QUOTA_MESSAGE } from "../../shared/analysis.js";
const file = {
  mimetype: "image/png",
  buffer: Buffer.from("synthetic"),
} as Express.Multer.File;
const config = readConfig({});
test("real mode requires free-tier confirmation and key; only allows explicitly authorized models", () => {
  assert.throws(() => readConfig({ ANALYSIS_MODE: "gemini" }));
  assert.throws(() =>
    readConfig({ ANALYSIS_MODE: "gemini", GEMINI_API_KEY: "synthetic" }),
  );
  assert.throws(() => readConfig({ GEMINI_MODEL: "other-model" }));
  assert.throws(() => readConfig({ GEMINI_MODEL: "gemini-2.5-flash-lite" }));
  assert.equal(readConfig({}).GEMINI_MODEL, "gemini-3.1-flash-lite");
  assert.equal(readConfig({ GEMINI_MODEL: "gemini-3.1-flash-lite" }).GEMINI_MODEL, "gemini-3.1-flash-lite");
  assert.throws(() => readConfig({ CORS_ORIGINS: "*" }));
  assert.equal(
    readConfig({
      ANALYSIS_MODE: "gemini",
      GEMINI_API_KEY: "synthetic",
      FREE_TIER_CONFIRMED: "true",
      QUOTA_HASH_SECRET: "synthetic-test-only-secret-32-characters",
    }).ANALYSIS_MODE,
    "gemini",
  );
});
test("SDK request sends inline data, structured schema and system instructions without tools", async () => {
  let calls = 0;
  const analyze = createGeminiAnalyzer(config, async (params) => {
    calls++;
    assert.equal(params.model, "gemini-3.1-flash-lite");
    assert.equal(params.config?.responseMimeType, "application/json");
    assert.equal(params.config?.thinkingConfig, undefined);
    assert.equal(params.config?.temperature, undefined);
    assert.equal(params.config?.maxOutputTokens, 6000);
    assert.ok(params.config?.responseJsonSchema);
    assert.equal(params.config?.tools, undefined);
    assert.match(String(params.config?.systemInstruction), /NO CONFIABLE/);
    assert.match(String(params.config?.systemInstruction), /factura, contrato privado, publicidad o comunicación administrativa/);
    assert.match(String(params.config?.systemInstruction), /IBAN, CUPS/);
    assert.match(String(params.config?.systemInstruction), /No calcules plazos/);
    assert.ok(
      JSON.stringify(params.contents).includes(
        Buffer.from("synthetic").toString("base64"),
      ),
    );
    return { text: JSON.stringify(mockAnalysis()) };
  });
  await analyze([file], new AbortController().signal);
  assert.equal(calls, 1);
});
test("invalid and absent JSON, quota and internal provider failures are safe", async () => {
  for (const text of [undefined, "not JSON", "{}"]) {
    const analyze = createGeminiAnalyzer(config, async () => ({ text }));
    await assert.rejects(
      analyze([file], new AbortController().signal),
      /análisis válido/,
    );
  }
  let calls = 0;
  const quota = createGeminiAnalyzer(config, async () => {
    calls++;
    throw { status: 429, message: "private" };
  });
  await assert.rejects(quota([file], new AbortController().signal), {
    message: QUOTA_MESSAGE,
  });
  assert.equal(calls, 1);
  const unavailable = createGeminiAnalyzer(config, async () => {
    throw new Error("private");
  });
  await assert.rejects(
    unavailable([file], new AbortController().signal),
    /no está disponible/,
  );
});
test("unavailable authorized model fails safely without fallback or retry", async () => {
  const requestedModels: string[] = [];
  const analyze = createGeminiAnalyzer(config, async (params) => {
    requestedModels.push(params.model);
    throw { status: 404, message: "private provider details" };
  });
  await assert.rejects(analyze([file], new AbortController().signal), {
    code: "MODEL_UNAVAILABLE",
    message: "El modelo solicitado no está disponible para esta cuenta. No se ha cambiado a otro modelo.",
  });
  assert.deepEqual(requestedModels, ["gemini-3.1-flash-lite"]);
});

test("output protection omits common identifiers without changing dates", () => {
  const value = mockAnalysis();
  value.advertencias = [
    "12345678Z test@example.invalid +34 612 345 678 ES91 2100 0418 4502 0005 1332 ES0021000000000001AB",
  ];
  value.fechasDetectadas = [
    {
      descripcion: "Fecha",
      fechaLiteral: "20 septiembre",
      fechaISO: "2026-09-20",
    },
  ];
  const cleaned = sanitizeAnalysis(value);
  assert.doesNotMatch(
    JSON.stringify(cleaned),
    /12345678Z|test@example|612 345|2100 0418|ES0021/,
  );
  assert.equal(cleaned.fechasDetectadas[0].fechaISO, "2026-09-20");
});

const fallbackConfig = readConfig({ GEMINI_FALLBACK_MODEL: "gemini-3.5-flash-lite" });
const saturated = { status: 503, message: JSON.stringify({ error: {
  code: 503, status: "UNAVAILABLE", message: "Model experiencing high demand. private-document",
} }) };

test("fallback is opt-in and only accepts the authorized alternative", () => {
  assert.equal(config.GEMINI_FALLBACK_MODEL, "");
  assert.throws(() => readConfig({ GEMINI_FALLBACK_MODEL: "other-model" }));
});

test("saturation uses exactly one fallback with the same contents and cancellation signal", async t => {
  const logs: string[] = [];
  t.mock.method(console, "info", (line: string) => logs.push(line));
  const models: string[] = [];
  const controller = new AbortController();
  let contents: unknown;
  const analyze = createGeminiAnalyzer(fallbackConfig, async params => {
    models.push(params.model);
    assert.equal(params.config?.abortSignal, controller.signal);
    if (models.length === 1) { contents = params.contents; throw saturated; }
    assert.equal(params.contents, contents);
    return { text: JSON.stringify(mockAnalysis()) };
  });
  assert.equal((await analyze([file], controller.signal)).titulo, mockAnalysis().titulo);
  assert.deepEqual(models, [config.GEMINI_MODEL, fallbackConfig.GEMINI_FALLBACK_MODEL]);
  const summary = JSON.parse(logs.find(line => line.startsWith("GEMINI_ANALYSIS "))!.slice("GEMINI_ANALYSIS ".length));
  assert.equal(summary.primarySaturated, true);
  assert.equal(summary.fallbackActivated, true);
  assert.equal(summary.fallbackModel, "gemini-3.5-flash-lite");
  assert.equal(summary.result, "OK");
  assert.doesNotMatch(logs.join(""), /private|synthetic|high demand/);
});

test("other errors, generic 503, validation and disabled fallback never switch", async () => {
  const errors = [400, 401, 403, 404, 429, 500, 502, 504].map(status => ({ ...saturated, status }));
  errors.push({ status: 503, message: "Service unavailable" });
  errors.push({ status: 503, message: JSON.stringify({ error: { status: "INTERNAL", message: "high demand" } }) });
  for (const error of errors) {
    let calls = 0;
    const analyze = createGeminiAnalyzer(fallbackConfig, async () => { calls++; throw error; });
    await assert.rejects(analyze([file], new AbortController().signal));
    assert.equal(calls, 1);
  }
  for (const text of [undefined, "not JSON", "{}", "x".repeat(70001)]) {
    let calls = 0;
    const analyze = createGeminiAnalyzer(fallbackConfig, async () => { calls++; return { text }; });
    await assert.rejects(analyze([file], new AbortController().signal), { code: "INVALID_RESPONSE" });
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(createGeminiAnalyzer(config, async () => { calls++; throw saturated; })([file], new AbortController().signal));
  assert.equal(calls, 1);
});

test("fallback failure never retries and two saturated models keep the temporary error", async () => {
  for (const status of [400, 401, 403, 404, 429, 503]) {
    let calls = 0;
    const analyze = createGeminiAnalyzer(fallbackConfig, async () => {
      calls++;
      throw calls === 1 ? saturated : { ...saturated, status };
    });
    await assert.rejects(analyze([file], new AbortController().signal), status === 503
      ? { code: "PROVIDER_TEMPORARY_ERROR", message: "Google ha devuelto un error temporal de su servicio. Inténtalo más tarde." }
      : { status: status === 429 ? 429 : 503 });
    assert.equal(calls, 2);
  }
});

test("cancellation prevents starting fallback", async () => {
  const controller = new AbortController();
  let calls = 0;
  const analyze = createGeminiAnalyzer(fallbackConfig, async () => {
    calls++; controller.abort(); throw saturated;
  });
  await assert.rejects(analyze([file], controller.signal), { code: "CANCELLED" });
  assert.equal(calls, 1);
});
