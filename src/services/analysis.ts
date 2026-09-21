import { Platform } from "react-native";
import { File } from "expo-file-system";
import { LIMITS, mockAnalysis } from "../../shared/analysis";
import type { AnalysisResult, SelectedDocument } from "../types/document";
import { requestAnalysis } from "./http";
import { appendNativeUpload } from "./upload";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "")
  .trim()
  .replace(/\/$/, "");
export const usesBackend = API_URL.length > 0;

export async function analyzeDocument(
  document: SelectedDocument,
  signal: AbortSignal,
  consent: boolean,
): Promise<AnalysisResult> {
  if (!document.pages.length)
    throw new Error("Añade al menos una imagen o un PDF.");
  if (signal.aborted) throw new Error("Análisis cancelado.");
  if (!usesBackend)
    return {
      id: document.id,
      createdAt: new Date().toISOString(),
      simulated: true,
      analysis: mockAnalysis(),
    };
  if (!consent) throw new Error("Debes aceptar el envío antes de analizar.");
  if (!/^https?:\/\//.test(API_URL))
    throw new Error("La dirección del backend no es válida.");
  if (document.pages.length > LIMITS.files)
    throw new Error("Se permiten como máximo 6 archivos.");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 60_000);
  try {
    const body = new FormData();
    let total = 0;
    for (const [index, page] of document.pages.entries()) {
      if (controller.signal.aborted) throw new Error("Análisis cancelado.");
      const mime =
        page.mimeType ??
        (page.kind === "pdf"
          ? "application/pdf"
          : /\.png$/i.test(page.name)
            ? "image/png"
            : "image/jpeg");
      if (!["application/pdf", "image/jpeg", "image/png"].includes(mime))
        throw new Error(
          "Selecciona imágenes JPG/PNG o PDF. HEIC no está admitido.",
        );
      const name =
        "pagina-" +
        (index + 1) +
        (mime === "application/pdf"
          ? ".pdf"
          : mime === "image/png"
            ? ".png"
            : ".jpg");
      if ((page.size ?? 0) > LIMITS.fileBytes)
        throw new Error("Cada archivo puede ocupar como máximo 4 MB.");
      if (Platform.OS === "web") {
        const blob = await (
          await fetch(page.uri, { signal: controller.signal })
        ).blob();
        if (blob.size > LIMITS.fileBytes)
          throw new Error("Cada archivo puede ocupar como máximo 4 MB.");
        total += blob.size;
        body.append("files", blob, name);
      } else {
        total += appendNativeUpload(body, new File(page.uri), name, mime);
      }
      if (total > LIMITS.totalBytes)
        throw new Error("El conjunto de archivos supera los 10 MB permitidos.");
    }
    return await requestAnalysis(API_URL, body, controller.signal);
  } catch (error) {
    if (timedOut)
      throw new Error("El análisis ha tardado demasiado. Inténtalo más tarde.");
    if (signal.aborted) throw new Error("Análisis cancelado.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
