import { QUOTA_MESSAGE } from "../../shared/analysis.js";
import { quotaMessages } from "../../shared/quota.js";
export const messages = {
  ...quotaMessages,
  QUOTA_EXHAUSTED: QUOTA_MESSAGE,
  RATE_LIMITED:
    "Demasiadas solicitudes. Espera unos minutos antes de volver a intentarlo.",
  FILE_TOO_LARGE:
    "El archivo o el conjunto de archivos supera el tamaño permitido.",
  INVALID_FILE:
    "Archivo no válido. Selecciona JPG, JPEG, PNG o PDF sin contraseña.",
  TOO_MANY_PAGES: "El documento supera el límite de archivos o páginas del servicio.",
  INVALID_REQUEST:
    "La solicitud no es válida. Vuelve a seleccionar el documento.",
  CONSENT_REQUIRED: "Debes aceptar el envío del documento antes del análisis.",
  INVALID_RESPONSE:
    "No se ha recibido un análisis válido. Comprueba el documento original.",
  TIMEOUT: "El análisis ha tardado demasiado. Inténtalo más tarde.",
  CANCELLED: "Análisis cancelado.",
  UNAVAILABLE:
    "El servicio de análisis no está disponible. Inténtalo más tarde.",
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
  ORIGIN_DENIED: "Este origen no tiene permiso para acceder al servidor.",
} as const;
export type ErrorCode = keyof typeof messages;
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public status: number,
  ) {
    super(messages[code]);
  }
}
export function providerError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const value = error as {
    status?: number;
    code?: number;
    name?: string;
    message?: unknown;
  } | null;
  const status = value?.status ?? value?.code;
  if (status === 429) return new AppError("QUOTA_EXHAUSTED", 429);
  if (status === 404) return new AppError("MODEL_UNAVAILABLE", 503);
  if (status === 401 || status === 403)
    return new AppError("CONFIGURATION", 503);
  if (status === 400) {
    // Inspect only to choose a fixed public category; never return or log the
    // provider message, which may contain request data or internal details.
    const message = typeof value?.message === "string" ? value.message : "";
    if (/free tier.{0,80}(not available|not supported)/i.test(message))
      return new AppError("PROVIDER_FREE_TIER_UNAVAILABLE", 503);
    if (/response[_ ]?json[_ ]?schema|response[_ ]?schema|too many states|schema.{0,80}(complex|unsupported|invalid)/i.test(message))
      return new AppError("PROVIDER_SCHEMA_REJECTED", 503);
    return new AppError("PROVIDER_REQUEST_REJECTED", 503);
  }
  if (value?.name === "AbortError" || status === 504 || status === 408)
    return new AppError("TIMEOUT", 504);
  if (status === 500 || status === 502 || status === 503)
    return new AppError("PROVIDER_TEMPORARY_ERROR", 503);
  return new AppError("UNAVAILABLE", 503);
}
