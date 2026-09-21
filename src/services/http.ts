import {
  QUOTA_MESSAGE,
  validateResult,
  type AnalysisResult,
} from "../../shared/analysis";

const errors: Record<string, string> = {
  QUOTA_EXHAUSTED: QUOTA_MESSAGE,
  RATE_LIMITED:
    "Demasiadas solicitudes. Espera unos minutos antes de volver a intentarlo.",
  FILE_TOO_LARGE:
    "El archivo o el conjunto de archivos supera el tamaño permitido.",
  TOO_MANY_PAGES: "Se permiten como máximo 6 archivos y 6 páginas en total.",
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
export async function requestAnalysis(
  url: string,
  body: FormData,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AnalysisResult> {
  let response: Response;
  try {
    response = await fetcher(url + "/api/analyze", {
      method: "POST",
      body,
      signal,
      headers: { "X-AclaraDoc-Consent": "accepted-v1" },
    });
  } catch {
    if (signal.aborted) throw new Error("Análisis cancelado.");
    throw new Error(
      "No se pudo conectar con el servidor. Comprueba tu conexión y que el backend está disponible.",
    );
  }
  if (response.status === 429) {
    throw new Error(QUOTA_MESSAGE);
  }
  if (response.status === 413) throw new Error(errors.FILE_TOO_LARGE);
  if (
    response.status >= 500 &&
    response.status !== 502 &&
    response.status !== 504
  ) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      errors[payload?.error?.code] ??
        "El servidor de análisis no está disponible. Inténtalo más tarde.",
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(errors.INVALID_RESPONSE);
  }
  if (!response.ok) {
    const code = (payload as { error?: { code?: string } })?.error?.code;
    throw new Error(
      errors[code ?? ""] ??
        "La solicitud no es válida. Vuelve a seleccionar el documento.",
    );
  }
  try {
    return validateResult(payload);
  } catch {
    throw new Error(errors.INVALID_RESPONSE);
  }
}
