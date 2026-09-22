import { z } from "zod";

// Absolute end assertion: unlike $, this also rejects a trailing newline.
export const installationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![\s\S])/i;
export const quotaSchema = z.object({
  remaining: z.number().int().min(0).max(20),
  limit: z.number().int().min(1).max(20),
  resetAt: z.string().datetime(),
}).refine(value => value.remaining <= value.limit);
export type Quota = z.infer<typeof quotaSchema>;
export const quotaMessages = {
  INSTALLATION_REQUIRED: "No se pudo identificar esta instalación. Cierra y vuelve a abrir la aplicación.",
  IP_LIMIT: "Se han agotado los análisis temporales de esta conexión.",
  DEVICE_LIMIT: "Has alcanzado el límite diario de análisis de este dispositivo.",
  GLOBAL_LIMIT: "Se ha agotado el límite diario gratuito del servicio.",
  BUSY: "El servicio está atendiendo otros análisis. Espera un momento.",
} as const;
