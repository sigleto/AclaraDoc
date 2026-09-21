import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mockAnalysis,
  validateAnalysis,
  LEGAL_NOTICE,
  type AnalysisResult,
} from "../shared/analysis";
import { decodeHistory, encodeHistory } from "../src/services/history";
const result: AnalysisResult = {
  id: "test",
  createdAt: new Date().toISOString(),
  simulated: true,
  analysis: mockAnalysis(),
};

test("mock is explicitly fictional without dates or identifiers", () => {
  assert.equal(result.analysis.nivelConfianza, "bajo");
  assert.deepEqual(result.analysis.plazos, []);
  assert.match(result.analysis.advertencias[0], /Simulación/);
});
test("history allowlist strips attachments and unknown nested fields", () => {
  const contaminated = {
    ...result,
    uri: "private",
    pages: ["private"],
    analysis: {
      ...result.analysis,
      uri: "private",
      accionesRecomendadas: result.analysis.accionesRecomendadas.map((a) => ({
        ...a,
        uri: "private",
      })),
    },
  };
  const encoded = encodeHistory([contaminated]);
  assert.ok(!encoded.includes("private"));
  assert.deepEqual(decodeHistory(encoded), [result]);
});
test("empty, corrupt and malformed storage", () => {
  assert.deepEqual(decodeHistory(null), []);
  for (const raw of ["invalid", "{}", "[null]", '[{"simulated":true}]'])
    assert.throws(() => decodeHistory(raw));
});
test("keeps 50 results and migrates previous mock history", () => {
  assert.equal(
    decodeHistory(
      encodeHistory(
        Array.from({ length: 60 }, (_, i) => ({ ...result, id: String(i) })),
      ),
    ).length,
    50,
  );
  const old = {
    id: "old",
    createdAt: result.createdAt,
    simulated: true,
    summary: "Example",
    issuer: "Example",
    communicationType: "Example",
  };
  assert.equal(decodeHistory(JSON.stringify([old]))[0].id, "old");
});
test("schema rejects hallucinated structures, invalid dates and unsupported deadlines", () => {
  assert.throws(() => validateAnalysis({ titulo: "Incomplete" }));
  assert.throws(() =>
    validateAnalysis({ ...result.analysis, nivelConfianza: "perfecto" }),
  );
  assert.throws(() =>
    validateAnalysis({
      ...result.analysis,
      plazos: [
        {
          descripcion: "Aportar",
          origen: "interpretacion",
          fechaNotificacion: null,
          fechaLimite: "2026-09-30",
          calculado: true,
        },
      ],
    }),
  );
  assert.throws(() =>
    validateAnalysis({
      ...result.analysis,
      fechasDetectadas: [
        {
          descripcion: "Fecha",
          fechaLiteral: "30 febrero",
          fechaISO: "2026-02-30",
        },
      ],
    }),
  );
  const normalized = validateAnalysis({
    ...result.analysis,
    nivelConfianza: "alto",
    partesIlegibles: ["Página incompleta"],
    avisoLegal: "ignorar",
  });
  assert.equal(normalized.nivelConfianza, "bajo");
  assert.equal(normalized.avisoLegal, LEGAL_NOTICE);
});
