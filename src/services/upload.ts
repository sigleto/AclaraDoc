import { LIMITS } from "../../shared/analysis";

type UploadSource = {
  exists: boolean;
  size: number;
  bytes(): Promise<Uint8Array>;
};

export function appendNativeUpload(
  body: FormData,
  file: UploadSource,
  name: string,
  mime: string,
): number {
  if (!file.exists)
    throw new Error("La copia del archivo ya no está disponible. Vuelve a seleccionarlo.");
  if (file.size > LIMITS.fileBytes)
    throw new Error("Cada archivo puede ocupar como máximo 4 MB.");

  // Expo 57 fetch reads bytes(), not React Native's legacy { uri } parts.
  // Expose only the generated name and MIME, never the original name or URI.
  body.append("files", {
    name,
    type: mime,
    bytes: () => file.bytes(),
  } as unknown as Blob);
  return file.size;
}
