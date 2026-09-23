import { z } from "zod";
import { analysisSchema, validateAnalysis, type Analysis } from "../../shared/analysis.js";
import { AppError } from "./errors.js";

export interface ModelResponse {
  text?: string;
  candidates?: { finishReason?: string }[];
}
type Path = (string | number)[];
type Issue = { path: Path; code: string };
type Shape = { properties?: Record<string, Shape>; items?: Shape };
const shape = z.toJSONSchema(analysisSchema) as Shape;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finishReasons = new Set([
  "STOP", "MAX_TOKENS", "SAFETY", "RECITATION", "LANGUAGE", "OTHER",
  "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL",
  "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_OTHER", "NO_IMAGE",
  "IMAGE_RECITATION", "UNEXPECTED_TOOL_CALL", "TOO_MANY_TOOL_CALLS",
  "MISSING_THOUGHT_SIGNATURE", "FINISH_REASON_UNSPECIFIED",
]);

// Paths are constructed from the local contract, never from arbitrary model keys.
function safePath(path: PropertyKey[]): Path {
  let node: Shape | undefined = shape;
  return path.slice(0, 6).map(part => {
    if (typeof part === "number" && Number.isSafeInteger(part) && part >= 0 && node?.items) {
      node = node.items;
      return part;
    }
    if (typeof part === "string" && node?.properties && Object.hasOwn(node.properties, part)) {
      node = node.properties[part];
      return part;
    }
    node = undefined;
    return "[unknown]";
  });
}

function fields(input: unknown, node = shape, path: Path = [], output: Path[] = []): Path[] {
  if (output.length >= 80) return output;
  if (record(input) && node.properties) {
    for (const name of Object.keys(node.properties)) {
      if (Object.hasOwn(input, name) && output.length < 80) {
        const next = [...path, name];
        output.push(next);
        fields(input[name], node.properties[name], next, output);
      }
    }
    if (Object.keys(input).some(name => !Object.hasOwn(node.properties!, name)) && output.length < 80)
      output.push([...path, "[unknown]"]);
  } else if (Array.isArray(input) && node.items) {
    input.slice(0, 12).forEach((item, index) => fields(item, node.items!, [...path, index], output));
  }
  return output;
}

function at(input: unknown, path: Path): unknown {
  for (const key of path) {
    if (input === null || typeof input !== "object" || !Object.hasOwn(input, key)) return undefined;
    input = (input as Record<string | number, unknown>)[key];
  }
  return input;
}

function issues(input: unknown): Issue[] {
  const parsed = analysisSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.slice(0, 80).map(issue => ({
    path: safePath(issue.path), code: issue.code,
  }));
  const value = parsed.data;
  const output: Issue[] = [];
  if (value.esMeramenteInformativo && value.requiereActuacion)
    output.push({ path: ["requiereActuacion"], code: "contradictory_flags" });
  if (value.necesitaRevisionProfesional && !value.motivoRevisionProfesional)
    output.push({ path: ["motivoRevisionProfesional"], code: "missing_review_reason" });
  const checkDate = (date: string | null, path: Path) => {
    if (date && (Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date))
      output.push({ path, code: "invalid_calendar_date" });
  };
  value.fechasDetectadas.forEach((date, index) => checkDate(date.fechaISO, ["fechasDetectadas", index, "fechaISO"]));
  value.plazos.forEach((deadline, index) => {
    for (const key of ["fechaNotificacion", "fechaLimite"] as const) {
      checkDate(deadline[key], ["plazos", index, key]);
      if (deadline.calculado && !deadline[key])
        output.push({ path: ["plazos", index, key], code: "missing_deadline_date" });
    }
  });
  return output;
}

function normalizeEmptyNullable(input: unknown): Path[] {
  const normalized: Path[] = [];
  const emptyToNull = (object: Record<string, unknown>, key: string, path: Path) => {
    if (typeof object[key] === "string" && object[key].trim() === "") {
      object[key] = null;
      if (normalized.length < 80) normalized.push([...path, key]);
    }
  };
  if (!record(input)) return normalized;
  for (const key of ["organismoEmisor", "tipoComunicacion", "motivoRevisionProfesional"])
    emptyToNull(input, key, []);
  for (const [list, keys] of [
    ["fechasDetectadas", ["fechaISO"]], ["plazos", ["fechaNotificacion", "fechaLimite"]],
  ] as const) {
    const items = input[list];
    if (Array.isArray(items)) items.forEach((item, index) => {
      if (record(item)) for (const key of keys) emptyToNull(item, key, [list, index]);
    });
  }
  return normalized;
}

export function validateModelResponse(
  response: ModelResponse, model: string, maxChars: number,
  sanitize: (value: Analysis, validate: typeof validateAnalysis) => Analysis,
): Analysis {
  const reason = response.candidates?.[0]?.finishReason;
  const diagnostic = {
    model: ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"].includes(model) ? model : "[unknown]",
    finishReason: reason === undefined ? null : finishReasons.has(reason) ? reason : "[unknown]",
    textExists: false, textLength: 0, jsonParsed: false,
    receivedFields: [] as Path[], issues: [] as Issue[], missingFields: [] as Path[],
    wrongTypeFields: [] as Path[], normalizedFields: [] as Path[], finalIssues: [] as Issue[],
  };
  const reject = (code: string): never => {
    diagnostic.finalIssues.push({ path: [], code });
    throw new AppError("INVALID_RESPONSE", 502);
  };
  try {
    const text = response.text;
    diagnostic.textExists = typeof text === "string" && text.length > 0;
    diagnostic.textLength = typeof text === "string" ? text.length : 0;
    if (!text?.trim()) return reject("empty_text");
    if (text.length > maxChars) return reject("text_too_long");
    let input: unknown;
    try {
      input = JSON.parse(text);
      diagnostic.jsonParsed = true;
    } catch {
      // Only an entire single fenced JSON object; never extract a fragment or repair JSON.
      const fence = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(text.trim());
      if (!fence) return reject("invalid_json");
      try { input = JSON.parse(fence[1]); } catch { return reject("invalid_json"); }
      if (!record(input)) return reject("invalid_json_object");
      diagnostic.jsonParsed = true;
      diagnostic.issues.push({ path: [], code: "markdown_fence" });
    }
    diagnostic.receivedFields = fields(input);
    diagnostic.issues.push(...issues(input));
    diagnostic.missingFields = diagnostic.issues.filter(issue =>
      issue.path.length > 0 && at(input, issue.path) === undefined).map(issue => issue.path);
    diagnostic.wrongTypeFields = diagnostic.issues.filter(issue =>
      (issue.code === "invalid_type" || (issue.code === "invalid_value" && typeof at(input, issue.path) !== "string"))
      && at(input, issue.path) !== undefined).map(issue => issue.path);
    // Even parseable JSON is rejected when Google reports truncation or blocking.
    if (reason !== undefined && reason !== "STOP") return reject("incomplete_generation");
    diagnostic.normalizedFields = normalizeEmptyNullable(input);
    diagnostic.finalIssues = issues(input);
    if (diagnostic.finalIssues.length) throw new AppError("INVALID_RESPONSE", 502);
    const validated = validateAnalysis(input);
    try { return sanitize(validated, sanitized => {
      diagnostic.finalIssues = issues(sanitized);
      return validateAnalysis(sanitized);
    }); } catch {
      if (!diagnostic.finalIssues.length) return reject("sanitization_validation_failed");
      throw new AppError("INVALID_RESPONSE", 502);
    }
  } catch {
    if (!diagnostic.finalIssues.length) diagnostic.finalIssues.push({ path: [], code: "validation_failed" });
    throw new AppError("INVALID_RESPONSE", 502);
  } finally {
    try { console.info("GEMINI_RESPONSE_VALIDATION " + JSON.stringify(diagnostic)); }
    catch { /* Diagnostics must not affect validation or quotas. */ }
  }
}
