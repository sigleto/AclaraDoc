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
test("real mode requires free-tier confirmation and key; never switches models", () => {
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
    assert.deepEqual(params.config?.thinkingConfig, { thinkingLevel: "MINIMAL" });
    assert.equal(params.config?.temperature, undefined);
    assert.equal(params.config?.maxOutputTokens, 6000);
    assert.ok(params.config?.responseJsonSchema);
    assert.equal(params.config?.tools, undefined);
    assert.match(String(params.config?.systemInstruction), /NO CONFIABLE/);
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
    "12345678Z test@example.invalid +34 612 345 678 ES91 2100 0418 4502 0005 1332",
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
    /12345678Z|test@example|612 345|2100 0418/,
  );
  assert.equal(cleaned.fechasDetectadas[0].fechaISO, "2026-09-20");
});
