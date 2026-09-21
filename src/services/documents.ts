import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths, Directory } from "expo-file-system";
import { Platform } from "react-native";
import type { DocumentPage } from "../types/document";
import { LIMITS } from "../../shared/analysis";

export type SelectionSource = "camera" | "images" | "pdf";
export const makeId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export async function selectPages(
  source: SelectionSource,
): Promise<DocumentPage[]> {
  if (source === "pdf") {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      multiple: true,
      copyToCacheDirectory: true,
      base64: false,
    });
    return result.canceled
      ? []
      : result.assets.map((a) => ({
          id: makeId(),
          uri: a.uri,
          name: a.name,
          kind: "pdf",
          mimeType: "application/pdf",
          size: a.size,
          pageCount: null,
        }));
  }
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        "Permiso de cámara denegado. Puedes habilitarlo en Ajustes o seleccionar una imagen.",
      );
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 1,
    exif: false,
    base64: false,
    allowsEditing: false,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({
          ...options,
          allowsMultipleSelection: true,
          orderedSelection: true,
          selectionLimit: LIMITS.files,
        });
  return result.canceled
    ? []
    : result.assets.map((a, i) => ({
        id: makeId(),
        uri: a.uri,
        name: a.fileName ?? `pagina-${i + 1}.jpg`,
        kind: "image",
        mimeType: a.mimeType,
        size: a.fileSize,
        pageCount: 1,
      }));
}

export function releasePages(pages: DocumentPage[]) {
  if (Platform.OS === "web") {
    pages.forEach((p) => {
      if (p.uri.startsWith("blob:")) URL.revokeObjectURL(p.uri);
    });
    return;
  }
  let failed = false;
  for (const page of pages) {
    // Only delete disposable copies within Expo's picker cache, never user originals.
    const roots = ["ImagePicker", "DocumentPicker"].map((name) =>
      new Directory(Paths.cache, name).uri.replace(/\/?$/, "/"),
    );
    try {
      if (
        roots.some((root) => page.uri.startsWith(root)) &&
        !page.uri.includes("..")
      ) {
        const file = new File(page.uri);
        if (file.exists) file.delete();
      }
    } catch {
      failed = true;
    }
  }
  if (failed)
    throw new Error("No se pudieron limpiar algunas copias temporales.");
}

export function clearAbandonedPickerCache() {
  if (Platform.OS === "web") return;
  let failed = false;
  for (const name of ["ImagePicker", "DocumentPicker"]) {
    try {
      const directory = new Directory(Paths.cache, name);
      if (directory.exists)
        for (const entry of directory.list())
          if (entry instanceof File) entry.delete();
    } catch {
      failed = true;
    }
  }
  if (failed)
    throw new Error("No se pudieron limpiar algunas copias temporales.");
}
