// Temporary diagnostics authorized for the Render investigation, 2026-09-23.
// Never serialize an exception, its stack, details, metadata or raw message.
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};

function httpCode(value: unknown): number | null {
  const number = typeof value === "string" && /^\d{3}$/.test(value)
    ? Number(value) : value;
  return typeof number === "number" && Number.isInteger(number) && number >= 400 && number <= 599
    ? number : null;
}

export function providerDetails(error: unknown) {
  const value = record(error);
  let body = record(value.error);
  // @google/genai ApiError.message contains JSON.stringify({ error: ... }).
  if (typeof value.message === "string" && value.message.length <= 65_536) {
    try { body = record(record(JSON.parse(value.message)).error); } catch { /* Plain SDK error. */ }
  }
  const message = typeof body.message === "string" ? body.message
    : typeof value.message === "string" ? value.message : "";
  return {
    httpStatus: httpCode(value.status) ?? httpCode(value.code) ?? httpCode(body.code),
    name: value.name,
    googleStatus: body.status,
    googleCode: httpCode(body.code),
    reasons: Array.isArray(body.details)
      ? body.details.slice(0, 20).map(detail => record(detail).reason) : [],
    message,
  };
}

const statuses = new Set([
  "INVALID_ARGUMENT", "FAILED_PRECONDITION", "OUT_OF_RANGE", "UNAUTHENTICATED",
  "PERMISSION_DENIED", "NOT_FOUND", "RESOURCE_EXHAUSTED", "INTERNAL",
  "UNAVAILABLE", "DEADLINE_EXCEEDED", "UNKNOWN", "CANCELLED", "UNIMPLEMENTED",
]);
const reasons = new Set([
  "API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_NOT_FOUND", "API_KEY_SERVICE_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED", "API_KEY_ANDROID_APP_BLOCKED",
  "API_KEY_IOS_APP_BLOCKED", "SERVICE_DISABLED", "BILLING_DISABLED", "CONSUMER_INVALID",
  "ACCESS_TOKEN_EXPIRED", "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "IAM_PERMISSION_DENIED",
  "RATE_LIMIT_EXCEEDED", "QUOTA_EXCEEDED", "RESOURCE_EXHAUSTED", "MODEL_NOT_FOUND",
]);
const names = new Set(["ApiError", "Error", "TypeError", "AbortError", "TimeoutError"]);

// Only fixed phrases may leave the process. Regex redaction of arbitrary free
// text cannot guarantee omission of documents, prompts, responses or secrets.
const safePhrases: [RegExp, string][] = [
  [/API key not valid|API key is invalid/i, "API key not valid."],
  [/API key.{0,20}expired/i, "API key expired."],
  [/request contains an invalid argument/i, "Request contains an invalid argument."],
  [/response[_ ]?json[_ ]?schema|response[_ ]?schema|too many states|schema.{0,80}(complex|unsupported|invalid)/i, "Response schema rejected."],
  [/free tier.{0,80}(not available|not supported)/i, "Free tier not available."],
  [/permission denied|does not have permission/i, "Permission denied."],
  [/not found|not supported for generateContent/i, "Requested resource not found or unsupported."],
  [/quota.{0,30}exceeded|exceeded.{0,30}quota/i, "Quota exceeded."],
  [/high demand|overloaded/i, "Model experiencing high demand."],
  [/service.{0,30}unavailable/i, "Service unavailable."],
  [/internal (server )?error/i, "Internal error."],
  [/deadline exceeded/i, "Deadline exceeded."],
];

export const DIAGNOSTIC_PREFIX = "GEMINI_PROVIDER_DIAGNOSTIC ";
export const DIAGNOSTIC_END = Date.parse("2026-09-30T00:00:00Z");

export function providerDiagnostic(error: unknown, model: string) {
  const detail = providerDetails(error);
  return {
    exceptionName: typeof detail.name === "string" && names.has(detail.name) ? detail.name : "UnknownError",
    httpStatus: detail.httpStatus,
    googleStatus: typeof detail.googleStatus === "string" && statuses.has(detail.googleStatus) ? detail.googleStatus : null,
    googleReasonOrCode: detail.reasons.find(reason => typeof reason === "string" && reasons.has(reason)) ?? detail.googleCode,
    message: (safePhrases.filter(([pattern]) => pattern.test(detail.message.slice(0, 65_536)))
      .map(([, phrase]) => phrase).join(" ") || "[unrecognized provider message omitted]").slice(0, 240),
    model: model === "gemini-3.1-flash-lite" ? model : "[unrecognized model omitted]",
  };
}

export function logProviderDiagnostic(error: unknown, model: string, now = Date.now()) {
  if (now >= DIAGNOSTIC_END) return;
  try {
    console.warn(DIAGNOSTIC_PREFIX + JSON.stringify(providerDiagnostic(error, model)));
  } catch { /* Diagnostics must never change classification or quota handling. */ }
}
