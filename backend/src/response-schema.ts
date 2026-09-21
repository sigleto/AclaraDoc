import { z } from "zod";
import { analysisSchema } from "../../shared/analysis.js";

// Keep the generation schema small. The full shared Zod contract still checks
// lengths, array limits, dates and consistency after receiving the response.
function simplify(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (["type", "enum", "required"].includes(key)) result[key] = item;
    else if (key === "properties") {
      result[key] = Object.fromEntries(
        Object.entries(item as Record<string, unknown>).map(([name, child]) => [
          name,
          simplify(child),
        ]),
      );
    } else if (key === "items") result[key] = simplify(item);
    else if (key === "anyOf") result[key] = (item as unknown[]).map(simplify);
  }
  return result;
}

export const geminiResponseSchema = simplify(z.toJSONSchema(analysisSchema));
