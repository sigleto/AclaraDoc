import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { analysisSchema, mockAnalysis, validateAnalysis } from "../../shared/analysis.js";
import { geminiResponseSchema } from "../src/response-schema.js";

test("generation schema preserves every field, type, enum and nullable branch", () => {
  function compare(full: unknown, compact: unknown) {
    const source = full as Record<string, unknown>;
    const target = compact as Record<string, unknown>;
    for (const key of ["type", "enum", "required"]) {
      assert.deepEqual(target[key], source[key]);
    }
    assert.ok(Object.keys(target).every((key) =>
      ["type", "enum", "required", "properties", "items", "anyOf"].includes(key),
    ));
    if (source.properties) {
      const sourceProps = source.properties as Record<string, unknown>;
      const targetProps = target.properties as Record<string, unknown>;
      assert.deepEqual(Object.keys(targetProps), Object.keys(sourceProps));
      for (const name of Object.keys(sourceProps)) compare(sourceProps[name], targetProps[name]);
    }
    if (source.items) compare(source.items, target.items);
    if (source.anyOf) {
      const alternatives = source.anyOf as unknown[];
      const compactAlternatives = target.anyOf as unknown[];
      assert.equal(compactAlternatives.length, alternatives.length);
      alternatives.forEach((item, index) => compare(item, compactAlternatives[index]));
    }
  }
  compare(z.toJSONSchema(analysisSchema), geminiResponseSchema);
});

test("simplifying generation leaves strict result validation in force", () => {
  assert.throws(() => validateAnalysis({ ...mockAnalysis(), titulo: "x".repeat(161) }));
  assert.throws(() => validateAnalysis({ ...mockAnalysis(), advertencias: Array(13).fill("Aviso") }));
  assert.throws(() => validateAnalysis({ ...mockAnalysis(), organismoEmisor: "x".repeat(1201) }));
  assert.throws(() => validateAnalysis({
    ...mockAnalysis(), fechasDetectadas: [{ descripcion: "Fecha", fechaLiteral: "31 febrero", fechaISO: "2026-02-31" }],
  }));
  assert.throws(() => validateAnalysis({ ...mockAnalysis(), esMeramenteInformativo: true, requiereActuacion: true }));
  assert.doesNotThrow(() => validateAnalysis(mockAnalysis()));
});
