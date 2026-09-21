import { test } from "node:test";
import assert from "node:assert/strict";
import { providerError } from "../src/errors.js";
import { createGeminiAnalyzer } from "../src/gemini.js";
import { readConfig } from "../src/config.js";
import { mockAnalysis } from "../../shared/analysis.js";

test("provider failures use bounded categories and omit private details", () => {
  for (const [status, message, code] of [
    [400, "private details", "PROVIDER_REQUEST_REJECTED"],
    [400, "response_json_schema: private details", "PROVIDER_SCHEMA_REJECTED"],
    [400, "Schema is too complex: private details", "PROVIDER_SCHEMA_REJECTED"],
    [400, "Free tier is not available: private details", "PROVIDER_FREE_TIER_UNAVAILABLE"],
    [500, "private details", "PROVIDER_TEMPORARY_ERROR"],
    [503, "private details", "PROVIDER_TEMPORARY_ERROR"],
    [403, "private details", "CONFIGURATION"],
    [404, "private details", "MODEL_UNAVAILABLE"],
    [429, "private details", "QUOTA_EXHAUSTED"],
    [504, "private details", "TIMEOUT"],
  ] as const) {
    const error = providerError({ status, message });
    assert.equal(error.code, code);
    assert.ok(!error.message.includes("private details"));
  }
});

test("installed SDK serializes the request and parses a response without external networking", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => {
    calls++;
    const payload = JSON.parse(String(init.body));
    assert.equal(payload.generationConfig.thinkingConfig.thinkingLevel, "MINIMAL");
    assert.equal(payload.generationConfig.responseMimeType, "application/json");
    assert.ok(payload.generationConfig.responseJsonSchema);
    assert.equal(payload.tools, undefined);
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(mockAnalysis()) }] }, finishReason: "STOP" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const analyze = createGeminiAnalyzer(readConfig({
    ANALYSIS_MODE: "gemini", GEMINI_API_KEY: "synthetic-test-key", FREE_TIER_CONFIRMED: "true",
  }));
  const result = await analyze([
    { mimetype: "image/png", buffer: Buffer.from("synthetic") } as Express.Multer.File,
  ], new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(result.titulo, mockAnalysis().titulo);
});
