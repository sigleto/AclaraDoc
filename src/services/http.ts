import {
  QUOTA_MESSAGE,
  validateResult,
  type AnalysisResult,
} from "../../shared/analysis";
import { quotaMessages, quotaSchema, type Quota } from "../../shared/quota";

const errors: Record<string, string> = {
  ...quotaMessages,
  QUOTA_EXHAUSTED: QUOTA_MESSAGE,
  RATE_LIMITED:
    "Demasiadas solicitudes. Espera unos minutos antes de volver a intentarlo.",
  FILE_TOO_LARGE:
    "El archivo o el conjunto de archivos supera el tamaño permitido.",
  TOO_MANY_PAGES: "El documento supera el límite de archivos o páginas del servicio.",
  INVALID_FILE:
    "Archivo no válido. Selecciona JPG, JPEG, PNG o PDF sin contraseña.",
  INVALID_RESPONSE:
    "No se ha recibido un análisis válido. Comprueba el documento original.",
  MODEL_UNAVAILABLE:
    "El modelo solicitado no está disponible para esta cuenta. No se ha cambiado a otro modelo.",
  CONFIGURATION: "El servidor no está configurado para el análisis gratuito.",
  PROVIDER_REQUEST_REJECTED:
    "Google ha rechazado la petición de análisis (400). Hay que revisar su formato o la configuración de la API.",
  PROVIDER_SCHEMA_REJECTED:
    "Google ha rechazado el esquema de respuesta del análisis (400). Hay que corregirlo en el backend.",
  PROVIDER_FREE_TIER_UNAVAILABLE:
    "Google indica que el nivel gratuito no está disponible para esta petición. No se ha activado facturación.",
  PROVIDER_TEMPORARY_ERROR:
    "Google ha devuelto un error temporal de su servicio. Inténtalo más tarde.",
  TIMEOUT: "El análisis ha tardado demasiado. Inténtalo más tarde.",
  CONSENT_REQUIRED: "Debes aceptar el envío del documento antes del análisis.",
};
export class AnalysisError extends Error {
  constructor(message: string, public retryAt: number | null = null) { super(message); }
}
export type AnalysisTransport = { installation: string; onQuota?: (quota: Quota | null) => void };
export async function requestAnalysis(
  url: string,
  body: FormData,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  transport?: AnalysisTransport,
): Promise<AnalysisResult> {
  let response: Response;
  try {
    response = await fetcher(url + "/api/analyze", {
      method: "POST",
      body,
      signal,
      headers: { "X-AclaraDoc-Consent": "accepted-v1", "X-AclaraDoc-Installation": transport?.installation ?? "" },
    });
  } catch {
    if (signal.aborted) throw new Error("Análisis cancelado.");
    throw new AnalysisError(
      "No se pudo conectar con el servidor. Comprueba tu conexión y que el backend está disponible.",
      Date.now(),
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (response.status === 429) throw new Error(QUOTA_MESSAGE);
    if (response.status >= 500) throw new AnalysisError("El servidor de análisis no está disponible. Inténtalo más tarde.", Date.now() + 60_000);
    throw new Error(errors.INVALID_RESPONSE);
  }
  const quota = quotaSchema.safeParse((payload as { quota?: unknown } | null)?.quota);
  if (quota.success) transport?.onQuota?.(quota.data);
  else if ((payload as { simulated?: unknown } | null)?.simulated === true) transport?.onQuota?.(null);
  if (!response.ok) {
    const code = (payload as { error?: { code?: string } })?.error?.code;
    const seconds = (payload as { error?: { retryAfterSeconds?: unknown } })?.error?.retryAfterSeconds;
    const knownDelay = typeof seconds === "number" && Number.isInteger(seconds) && seconds > 0 && seconds <= 86_400 ? seconds : null;
    const retryable = ["IP_LIMIT", "DEVICE_LIMIT", "GLOBAL_LIMIT", "QUOTA_EXHAUSTED", "BUSY", "PROVIDER_TEMPORARY_ERROR", "TIMEOUT", "UNAVAILABLE"].includes(code ?? "");
    const retryAt = retryable ? Date.now() + (knownDelay ?? 60) * 1000 : null;
    const message = errors[code ?? ""] ?? (response.status === 429 ? QUOTA_MESSAGE : response.status === 413 ? errors.FILE_TOO_LARGE : response.status >= 500 ? "El servidor de análisis no está disponible. Inténtalo más tarde." : "La solicitud no es válida. Vuelve a seleccionar el documento.");
    // Keep Google's required quota message verbatim. Retry timing is separate UI.
    throw new AnalysisError(message, retryAt);
  }
  try {
    return validateResult(payload);
  } catch {
    throw new Error(errors.INVALID_RESPONSE);
  }
}
