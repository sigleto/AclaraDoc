import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError, providerError } from "../src/errors.js";
import { createGeminiAnalyzer } from "../src/gemini.js";
import { readConfig } from "../src/config.js";
import { mockAnalysis } from "../../shared/analysis.js";
import { DIAGNOSTIC_END, DIAGNOSTIC_PREFIX, logProviderDiagnostic, providerDiagnostic } from "../src/provider-diagnostics.js";

test("provider failures use bounded categories and omit private details", () => {
  for (const [status, message, code] of [
    [400, "private details", "PROVIDER_REQUEST_REJECTED"],
    [400, "response_json_schema: private details", "PROVIDER_SCHEMA_REJECTED"],
    [400, "Schema is too complex: private details", "PROVIDER_SCHEMA_REJECTED"],
    [400, "Free tier is not available: private details", "PROVIDER_FREE_TIER_UNAVAILABLE"],
    [500, "private details", "PROVIDER_TEMPORARY_ERROR"],
    [502, "private details", "PROVIDER_TEMPORARY_ERROR"],
    [503, "private details", "PROVIDER_TEMPORARY_ERROR"],
    [403, "private details", "CONFIGURATION"],
    [401, "private details", "CONFIGURATION"],
    [404, "private details", "MODEL_UNAVAILABLE"],
    [429, "private details", "QUOTA_EXHAUSTED"],
    [504, "private details", "PROVIDER_TEMPORARY_ERROR"],
  ] as const) {
    const error = providerError({ status, message });
    assert.equal(error.code, code);
    assert.ok(!error.message.includes("private details"));
  }
});

test("HTTP status is authoritative; numeric strings and nested Google codes are supported", () => {
  assert.equal(providerError({ status: "403", code: 503 }).code, "CONFIGURATION");
  assert.equal(providerError({ code: "401" }).code, "CONFIGURATION");
  assert.equal(providerError({ message: JSON.stringify({ error: { code: 404 } }) }).code, "MODEL_UNAVAILABLE");
  assert.equal(providerError({ error: { code: 429 } }).code, "QUOTA_EXHAUSTED");
  assert.equal(providerError({ status: 503, message: JSON.stringify({ error: { code: 400 } }) }).code, "PROVIDER_TEMPORARY_ERROR");
  assert.equal(providerError({ name: "AbortError" }).code, "TIMEOUT");
  assert.equal(providerError({ name: "TimeoutError" }).code, "TIMEOUT");
  assert.equal(providerError(null).code, "UNAVAILABLE");
  const own = new AppError("INVALID_RESPONSE", 502);
  assert.equal(providerError(own), own);
});

test("installed SDK classifies all requested HTTP errors without retries and logs only safe fields", async (t) => {
  let calls = 0;
  let status = 400;
  const logs: string[] = [];
  t.mock.method(Date, "now", () => DIAGNOSTIC_END - 1000);
  t.mock.method(console, "warn", (line: string) => logs.push(line));
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(JSON.stringify({ error: {
      code: status, status: "INVALID_ARGUMENT",
      message: "Request contains an invalid argument. private-document synthetic-test-key postgres://private response text",
      details: [{ reason: "API_KEY_INVALID", metadata: { prompt: "private-prompt" } }],
    } }), { status, headers: { "Content-Type": "application/json" } });
  });
  const analyze = createGeminiAnalyzer(readConfig({
    ANALYSIS_MODE: "gemini", GEMINI_API_KEY: "synthetic-test-key", FREE_TIER_CONFIRMED: "true",
    QUOTA_HASH_SECRET: "synthetic-test-only-secret-32-characters",
  }));
  for (const [http, expected] of [
    [400, "PROVIDER_REQUEST_REJECTED"], [401, "CONFIGURATION"], [403, "CONFIGURATION"],
    [404, "MODEL_UNAVAILABLE"], [429, "QUOTA_EXHAUSTED"],
    [500, "PROVIDER_TEMPORARY_ERROR"], [502, "PROVIDER_TEMPORARY_ERROR"],
    [503, "PROVIDER_TEMPORARY_ERROR"], [504, "PROVIDER_TEMPORARY_ERROR"],
  ] as const) {
    status = http;
    const before = calls;
    await assert.rejects(analyze([
      { mimetype: "image/png", buffer: Buffer.from("private-image") } as Express.Multer.File,
    ], new AbortController().signal), { code: expected });
    assert.equal(calls, before + 1);
    assert.equal(logs.length, calls);
    assert.ok(logs.at(-1)!.startsWith(DIAGNOSTIC_PREFIX));
    assert.deepEqual(JSON.parse(logs.at(-1)!.slice(DIAGNOSTIC_PREFIX.length)), {
      exceptionName: "ApiError", httpStatus: http, googleStatus: "INVALID_ARGUMENT",
      googleReasonOrCode: "API_KEY_INVALID", message: "Request contains an invalid argument.",
      model: "gemini-3.1-flash-lite",
    });
  }
  assert.doesNotMatch(logs.join(""), /private|synthetic|postgres|metadata|stack|response text/);
});

test("diagnostics omit arbitrary text in every field, cap messages, expire and can be disabled", async (t) => {
  const privateText = "private-document-key-prompt-response";
  const diagnostic = providerDiagnostic({ name: privateText, message: JSON.stringify({ error: {
    code: 503, status: privateText, message: privateText,
    details: [{ reason: privateText }],
  } }) }, privateText);
  assert.doesNotMatch(JSON.stringify(diagnostic), /private-document/);
  assert.equal(diagnostic.googleReasonOrCode, 503);
  assert.equal(diagnostic.googleStatus, null);
  assert.ok(providerDiagnostic({ message: "internal error ".repeat(10000) }, "gemini-3.1-flash-lite").message.length <= 240);
  const logs: string[] = [];
  t.mock.method(console, "warn", (line: string) => logs.push(line));
  logProviderDiagnostic({ status: 503 }, "gemini-3.1-flash-lite", DIAGNOSTIC_END);
  assert.equal(logs.length, 0);
  t.mock.method(Date, "now", () => DIAGNOSTIC_END - 1000);
  const disabled = createGeminiAnalyzer(readConfig({ GEMINI_ERROR_DIAGNOSTICS: "false" }), async () => { throw { status: 503 }; });
  await assert.rejects(disabled([], new AbortController().signal), { code: "PROVIDER_TEMPORARY_ERROR" });
  const invalidOutput = createGeminiAnalyzer(readConfig({}), async () => ({ text: privateText }));
  await assert.rejects(invalidOutput([], new AbortController().signal), { code: "INVALID_RESPONSE" });
  assert.equal(logs.length, 0);
});

test("installed SDK serializes the request and parses a response without external networking", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => {
    calls++;
    const payload = JSON.parse(String(init.body));
    assert.equal(payload.generationConfig.thinkingConfig, undefined);
    assert.equal(payload.generationConfig.responseMimeType, "application/json");
    assert.ok(payload.generationConfig.responseJsonSchema);
    assert.equal(payload.tools, undefined);
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(mockAnalysis()) }] }, finishReason: "STOP" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const analyze = createGeminiAnalyzer(readConfig({
    ANALYSIS_MODE: "gemini", GEMINI_API_KEY: "synthetic-test-key", FREE_TIER_CONFIRMED: "true",
    QUOTA_HASH_SECRET: "synthetic-test-only-secret-32-characters",
  }));
  const result = await analyze([
    { mimetype: "image/png", buffer: Buffer.from("synthetic") } as Express.Multer.File,
  ], new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(result.titulo, mockAnalysis().titulo);
});
