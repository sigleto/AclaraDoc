import { test } from "node:test";
import assert from "node:assert/strict";
import { requestAnalysis } from "../src/services/http";
import { mockAnalysis, QUOTA_MESSAGE } from "../shared/analysis";
const url = "http://127.0.0.1:3001";
const signal = new AbortController().signal;
function response(status: number, payload: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}
test("successful HTTP response validates result and sends explicit consent", async () => {
  const data = {
    id: "id",
    createdAt: new Date().toISOString(),
    simulated: false,
    analysis: mockAnalysis(),
  };
  const result = await requestAnalysis(
    url,
    new FormData(),
    signal,
    async (input, init) => {
      assert.equal(input, url + "/api/analyze");
      assert.equal(
        (init?.headers as Record<string, string>)["X-AclaraDoc-Consent"],
        "accepted-v1",
      );
      return new Response(JSON.stringify(data));
    },
  );
  assert.equal(result.id, "id");
});
test("quota 429 has exact message and never retries", async () => {
  let calls = 0;
  await assert.rejects(
    requestAnalysis(url, new FormData(), signal, async () => {
      calls++;
      return new Response("{}", { status: 429 });
    }),
    { message: QUOTA_MESSAGE },
  );
  assert.equal(calls, 1);
});
test("network failure, unavailable server, oversized and malformed responses", async () => {
  await assert.rejects(
    requestAnalysis(url, new FormData(), signal, async () => {
      throw new TypeError("private internals");
    }),
    /conectar/,
  );
  await assert.rejects(
    requestAnalysis(url, new FormData(), signal, response(503, {})),
    /no está disponible/,
  );
  await assert.rejects(
    requestAnalysis(url, new FormData(), signal, response(413, {})),
    /tamaño/,
  );
  await assert.rejects(
    requestAnalysis(url, new FormData(), signal, response(200, {})),
    /análisis válido/,
  );
  await assert.rejects(
    requestAnalysis(
      url,
      new FormData(),
      signal,
      response(504, { error: { code: "TIMEOUT" } }),
    ),
    /demasiado/,
  );
});
test("cancellation reports no internal error", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    requestAnalysis(url, new FormData(), controller.signal, async () => {
      throw new Error("private");
    }),
    /cancelado/,
  );
});

test("provider diagnostics distinguish rejected requests from outages without displaying raw errors", async () => {
  for (const [code, expected] of [
    ["PROVIDER_REQUEST_REJECTED", /rechazado la petición/],
    ["PROVIDER_SCHEMA_REJECTED", /rechazado el esquema/],
    ["PROVIDER_FREE_TIER_UNAVAILABLE", /nivel gratuito no está disponible/],
    ["PROVIDER_TEMPORARY_ERROR", /error temporal/],
  ] as const) {
    await assert.rejects(
      requestAnalysis(url, new FormData(), signal, response(503, {
        error: { code, message: "private provider details" },
      })),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, expected);
        assert.ok(!error.message.includes("private provider details"));
        return true;
      },
    );
  }
});
