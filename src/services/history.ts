import { z } from "zod";
import {
  mockAnalysis,
  validateResult,
  type AnalysisResult,
} from "../../shared/analysis";
export const HISTORY_KEY = "aclaradoc.history.v1";
export const HISTORY_LIMIT = 50;
const legacy = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  simulated: z.literal(true),
  summary: z.string(),
  issuer: z.string(),
  communicationType: z.string(),
});

export function encodeHistory(results: AnalysisResult[]): string {
  // Zod strips unknown keys at every level. Never persist documents or attachments.
  return JSON.stringify(results.slice(0, HISTORY_LIMIT).map(validateResult));
}
export function decodeHistory(raw: string | null): AnalysisResult[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Historial local no válido.");
  return parsed.slice(0, HISTORY_LIMIT).map((item) => {
    if (item && !("analysis" in item)) {
      const old = legacy.parse(item);
      return validateResult({
        id: old.id,
        createdAt: old.createdAt,
        simulated: true,
        analysis: mockAnalysis(),
      });
    }
    return validateResult(item);
  });
}
