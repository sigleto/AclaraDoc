import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths, Directory } from 'expo-file-system';
import { Platform } from 'react-native';
import type { DocumentPage } from '../types/document';

export type SelectionSource = 'camera' | 'images' | 'pdf';
export const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export async function selectPages(source: SelectionSource): Promise<DocumentPage[]> {
  if (source === 'pdf') {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: false, base64: false });
    return result.canceled ? [] : result.assets.map(a => ({ id: makeId(), uri: a.uri, name: a.name, kind: 'pdf', pageCount: null }));
  }
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Permiso de cámara denegado. Puedes habilitarlo en Ajustes o seleccionar una imagen.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false, base64: false, allowsEditing: false };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, orderedSelection: true, selectionLimit: 0 });
  return result.canceled ? [] : result.assets.map((a, i) => ({ id: makeId(), uri: a.uri, name: a.fileName ?? `Página ${i + 1}`, kind: 'image', pageCount: 1 }));
}

export function releasePages(pages: DocumentPage[]) {
  if (Platform.OS === 'web') {
    pages.forEach(p => { if (p.uri.startsWith('blob:')) URL.revokeObjectURL(p.uri); });
    return;
  }
  for (const page of pages) {
    // Only delete disposable copies within Expo's picker cache, never user originals.
    const root = new Directory(Paths.cache, 'ImagePicker').uri.replace(/\/?$/, '/');
    if (page.uri.startsWith(root) && !page.uri.includes('..')) {
      const file = new File(page.uri);
      if (file.exists) file.delete();
    }
  }
}

export function clearAbandonedPickerCache() {
  if (Platform.OS === 'web') return;
  const directory = new Directory(Paths.cache, 'ImagePicker');
  if (directory.exists) for (const entry of directory.list()) if (entry instanceof File) entry.delete();
}
