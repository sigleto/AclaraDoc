import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mockAnalysis, validateAnalysis, type Analysis } from "../../shared/analysis.js";
import { createGeminiAnalyzer, sanitizeAnalysis } from "../src/gemini.js";
import { readConfig } from "../src/config.js";
import { validateModelResponse, type ModelResponse } from "../src/response-validation.js";
import { geminiResponseSchema } from "../src/response-schema.js";

const prefix = "GEMINI_RESPONSE_VALIDATION ";
const model = "gemini-3.5-flash-lite";
function capture(t: TestContext) {
  const lines: string[] = [];
  t.mock.method(console, "info", (line: string) => lines.push(line));
  return { lines, last: () => JSON.parse(lines.filter(line => line.startsWith(prefix)).at(-1)!.slice(prefix.length)) };
}
function response(input: unknown, finishReason = "STOP"): ModelResponse {
  return { text: JSON.stringify(input), candidates: [{ finishReason }] };
}
function run(value: ModelResponse) { return validateModelResponse(value, model, 70000, sanitizeAnalysis); }

test("reproduces empty nullable strings allowed by generation but rejected internally; normalization preserves meaning", t => {
  const log = capture(t);
  const input = { ...mockAnalysis(), organismoEmisor: "", tipoComunicacion: "  ", motivoRevisionProfesional: "",
    fechasDetectadas: [{ descripcion: "Fecha incompleta", fechaLiteral: "septiembre", fechaISO: "" }],
    plazos: [{ descripcion: "Sin fecha completa", origen: "no_consta", fechaNotificacion: "", fechaLimite: "", calculado: false }],
  };
  const schema = geminiResponseSchema as { properties: Record<string, { anyOf: { type: string; minLength?: number }[] }> };
  assert.ok(schema.properties.organismoEmisor.anyOf.some(branch => branch.type === "string" && !branch.minLength));
  assert.throws(() => validateAnalysis(input));
  const result = run(response(input));
  assert.equal(result.organismoEmisor, null);
  assert.equal(result.tipoComunicacion, null);
  assert.equal(result.motivoRevisionProfesional, null);
  assert.equal(result.fechasDetectadas[0].fechaISO, null);
  assert.equal(result.plazos[0].fechaLimite, null);
  assert.equal(result.plazos[0].fechaNotificacion, null);
  assert.deepEqual(log.last().issues.find((issue: {path: string[]}) => issue.path[0] === "organismoEmisor"),
    { path: ["organismoEmisor"], code: "too_small" });
  assert.ok(log.last().issues.some((issue: {code: string}) => issue.code === "invalid_format"));
  assert.deepEqual(log.last().finalIssues, []);
  assert.equal(log.last().normalizedFields.length, 6);
  assert.deepEqual(validateAnalysis(result), result);
});

test("only a complete Markdown JSON fence is recoverable", t => {
  const log = capture(t);
  for (const language of ["json", "", "JSON"]) {
    const value = { text: "```" + language + "\n" + JSON.stringify(mockAnalysis()) + "\n```" };
    assert.deepEqual(run(value), validateAnalysis(mockAnalysis()));
    assert.deepEqual(log.last().issues, [{ path: [], code: "markdown_fence" }]);
    assert.equal(log.last().jsonParsed, true);
  }
  for (const text of ["not JSON", "{", "{} trailing", "before\n```json\n{}\n```", "```json\n{}\n```\nafter", "```json\n[]\n```", "```json\n{\n```", "{\"titulo\":NaN}"]) {
    assert.throws(() => run({ text }), { code: "INVALID_RESPONSE" });
  }
});

test("missing or empty output and oversized responses stay rejected", t => {
  const log = capture(t);
  for (const text of [undefined, "", " \n ", "x".repeat(70001)]) {
    assert.throws(() => run({ text }), { code: "INVALID_RESPONSE" });
    assert.equal(log.last().textLength, text?.length ?? 0);
    assert.equal(log.last().jsonParsed, false);
  }
});

test("no missing required field is manufactured, including nullable fields and essential statements", t => {
  const log = capture(t);
  for (const name of Object.keys(mockAnalysis())) {
    const input: Record<string, unknown> = { ...mockAnalysis() };
    delete input[name];
    assert.throws(() => run(response(input)), { code: "INVALID_RESPONSE" });
    assert.deepEqual(log.last().missingFields, [[name]]);
    assert.deepEqual(log.last().finalIssues, [{ path: [name], code: name === "nivelConfianza" ? "invalid_value" : "invalid_type" }]);
  }
  for (const resumenSencillo of [null, "Texto", {}, { texto: "Texto" }, { origen: "hecho" }, { texto: "", origen: "hecho" }])
    assert.throws(() => run(response({ ...mockAnalysis(), resumenSencillo })), { code: "INVALID_RESPONSE" });
});

test("numeric amounts and lists as text are not coerced; extra properties are excluded", t => {
  const log = capture(t);
  for (const input of [
    { ...mockAnalysis(), titulo: 125.5 },
    { ...mockAnalysis(), resumenSencillo: { texto: 125.5, origen: "hecho" } },
    { ...mockAnalysis(), accionesRecomendadas: "Comprobar" },
    { ...mockAnalysis(), advertencias: null },
  ]) {
    assert.throws(() => run(response(input)), { code: "INVALID_RESPONSE" });
    assert.ok(log.last().wrongTypeFields.length > 0);
  }
  for (const importe of [125.5, "125,50 EUR"]) {
    const value = run(response({ ...mockAnalysis(), importe }));
    assert.equal(Object.hasOwn(value, "importe"), false);
    assert.ok(log.last().receivedFields.some((path: string[]) => path.includes("[unknown]")));
  }
  assert.doesNotThrow(() => run(response({ ...mockAnalysis(), resumenSencillo: { texto: "Importe indicado: 125,50 EUR", origen: "hecho" } })));
});

test("invalid dates and semantic contradictions remain rejected with precise safe paths", t => {
  const log = capture(t);
  for (const [date, code] of [["23/09/2026", "invalid_format"], ["2026-02-31", "invalid_calendar_date"], ["2026-09-23T12:00:00Z", "invalid_format"]]) {
    assert.throws(() => run(response({ ...mockAnalysis(), fechasDetectadas: [
      { descripcion: "Fecha", fechaLiteral: "Fecha ficticia", fechaISO: date },
    ] })), { code: "INVALID_RESPONSE" });
    assert.deepEqual(log.last().finalIssues, [{ path: ["fechasDetectadas", 0, "fechaISO"], code }]);
  }
  assert.throws(() => run(response({ ...mockAnalysis(), necesitaRevisionProfesional: true, motivoRevisionProfesional: "" })), { code: "INVALID_RESPONSE" });
  assert.deepEqual(log.last().finalIssues, [{ path: ["motivoRevisionProfesional"], code: "missing_review_reason" }]);
  assert.throws(() => run(response({ ...mockAnalysis(), esMeramenteInformativo: true })), { code: "INVALID_RESPONSE" });
  assert.deepEqual(log.last().finalIssues, [{ path: ["requiereActuacion"], code: "contradictory_flags" }]);
  assert.throws(() => run(response({ ...mockAnalysis(), plazos: [{
    descripcion: "Plazo", origen: "hecho", fechaNotificacion: null, fechaLimite: "2026-09-23", calculado: true,
  }] })), { code: "INVALID_RESPONSE" });
  assert.deepEqual(log.last().finalIssues, [{ path: ["plazos", 0, "fechaNotificacion"], code: "missing_deadline_date" }]);
});

test("truncated and blocked responses are rejected even if the JSON is complete", t => {
  const log = capture(t);
  for (const reason of ["MAX_TOKENS", "SAFETY", "RECITATION", "private-reason"]) {
    assert.throws(() => run(response(mockAnalysis(), reason)), { code: "INVALID_RESPONSE" });
    assert.deepEqual(log.last().finalIssues, [{ path: [], code: "incomplete_generation" }]);
  }
  assert.throws(() => run({ text: '{"titulo":', candidates: [{ finishReason: "MAX_TOKENS" }] }), { code: "INVALID_RESPONSE" });
  assert.equal(log.last().finishReason, "MAX_TOKENS");
  assert.equal(log.last().jsonParsed, false);
});

test("output sanitization retains the final validation and reports its field path", t => {
  const log = capture(t);
  const input = { ...mockAnalysis(), organismoEmisor: "a".repeat(1190) + "612345678" };
  assert.doesNotThrow(() => validateAnalysis(input));
  assert.throws(() => run(response(input)), { code: "INVALID_RESPONSE" });
  assert.deepEqual(log.last().issues, []);
  assert.deepEqual(log.last().finalIssues, [{ path: ["organismoEmisor"], code: "too_big" }]);
});

test("diagnostics never expose values, arbitrary field names, provider metadata or errors", t => {
  const log = capture(t);
  const secret = "private-document-person-key-prompt-response";
  const input = { ...mockAnalysis(), titulo: { [secret]: secret }, [secret]: secret,
    resumenSencillo: { texto: secret, origen: secret, [secret]: secret },
  };
  assert.throws(() => run(response(input)));
  assert.throws(() => run(response(input, secret)));
  assert.throws(() => validateModelResponse({ get text(): string { throw new Error(secret); } }, secret, 70000, sanitizeAnalysis));
  assert.doesNotMatch(log.lines.join(""), new RegExp(secret));
  assert.doesNotMatch(log.lines.join(""), /Ejemplo ficticio|administraci|stack|message/);
  assert.ok(log.lines.every(line => line.length < 20000));
});

test("principal and fallback use identical schema and final contract without validation retries", async t => {
  const log = capture(t);
  const results: Analysis[] = [];
  for (const fallback of [false, true]) {
    const models: string[] = [];
    const schemas: unknown[] = [];
    const analyzer = createGeminiAnalyzer(readConfig({ GEMINI_FALLBACK_MODEL: model }), async params => {
      models.push(params.model);
      schemas.push(params.config?.responseJsonSchema);
      if (fallback && models.length === 1) throw { status: 503, error: { status: "UNAVAILABLE", message: "high demand" } };
      return response({ ...mockAnalysis(), organismoEmisor: "" });
    });
    results.push(await analyzer([], new AbortController().signal));
    assert.equal(models.length, fallback ? 2 : 1);
    assert.ok(schemas.every(schema => schema === geminiResponseSchema));
    assert.equal(log.last().model, fallback ? model : "gemini-3.1-flash-lite");
  }
  assert.deepEqual(results[0], results[1]);
});

test("installed SDK carries finishReason and rejects truncated fallback without extra calls", async t => {
  const log = capture(t);
  const warnings: unknown[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => warnings.push(args));
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE", message: "high demand" } }), { status: 503, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [
      { text: "private-thought", thought: true }, { text: JSON.stringify(mockAnalysis()) },
    ] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const analyzer = createGeminiAnalyzer(readConfig({ GEMINI_API_KEY: "synthetic", GEMINI_FALLBACK_MODEL: model }));
  await assert.rejects(analyzer([], new AbortController().signal), { code: "INVALID_RESPONSE" });
  assert.equal(calls, 2);
  assert.equal(log.last().model, model);
  assert.equal(log.last().finishReason, "MAX_TOKENS");
  assert.equal(log.last().textLength, JSON.stringify(mockAnalysis()).length);
  assert.deepEqual(warnings, []);
  assert.doesNotMatch(log.lines.join(""), /private-thought/);
});
