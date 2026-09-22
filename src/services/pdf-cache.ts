import { LIMITS } from "../../shared/analysis";

export interface PdfCopy {
  exists: boolean;
  size: number;
  delete(): void;
}
export interface PdfSource<T extends PdfCopy> {
  size: number;
  copy(destination: T): Promise<void>;
}
class SelectionError extends Error {}

// The picker grants access to the original. Keep only our own private copies;
// never move/delete originals, including when a later file fails to copy.
export async function cachePdfSelection<T extends PdfCopy>(
  sources: PdfSource<T>[],
  createCopy: () => T,
): Promise<T[]> {
  const copies: T[] = [];
  try {
    if (sources.length > LIMITS.files)
      throw new SelectionError("Selecciona como máximo 6 archivos.");
    let total = 0;
    for (const source of sources) {
      if (source.size > LIMITS.fileBytes)
        throw new SelectionError("Cada archivo puede ocupar como máximo 4 MB.");
      const copy = createCopy();
      copies.push(copy);
      await source.copy(copy);
      if (!copy.exists || !Number.isSafeInteger(copy.size) || copy.size <= 0)
        throw new SelectionError("No se pudo preparar una copia legible del PDF. Descárgalo en el móvil y vuelve a seleccionarlo.");
      if (copy.size > LIMITS.fileBytes)
        throw new SelectionError("Cada archivo puede ocupar como máximo 4 MB.");
      total += copy.size;
      if (total > LIMITS.totalBytes)
        throw new SelectionError("El conjunto de archivos supera los 10 MB permitidos.");
    }
    return copies;
  } catch (error) {
    let cleanupFailed = false;
    for (const copy of copies) {
      try { if (copy.exists) copy.delete(); }
      catch { cleanupFailed = true; }
    }
    const message = error instanceof SelectionError ? error.message : "No se pudo copiar el PDF. Descárgalo en el móvil y vuelve a seleccionarlo.";
    throw new Error(message + (cleanupFailed ? " No se pudieron limpiar algunas copias; se intentará al reiniciar." : ""));
  }
}
