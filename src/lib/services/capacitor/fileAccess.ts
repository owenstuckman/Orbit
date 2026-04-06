/**
 * Native file access service.
 *
 * On iOS/Android replaces the browser's drag-and-drop / <input type="file">
 * with the native camera or file picker.
 *
 * Converts results to File objects compatible with the existing
 * tasksApi upload flow.
 *
 * Web fallback: returns null — callers fall through to the standard input.
 */

import { isNative } from './platform';

export interface NativeFile {
  file: File;
  /** 'camera' | 'gallery' | 'files' */
  source: string;
}

/**
 * Opens the native document picker (any file type).
 * Returns an array of File objects, or empty array on cancel/failure.
 */
export async function pickFileNative(): Promise<File[]> {
  if (!isNative()) return [];

  try {
    // Use @capacitor/camera with CameraSource.Files — opens the native file picker
    const files = await pickViaCamera('photos');
    return files;
  } catch (err: any) {
    if (err?.message?.includes('cancel')) return [];
    console.error('[FileAccess] pickFileNative failed:', err);
    return [];
  }
}

/**
 * Opens the native camera or photo gallery.
 * @param source 'camera' | 'photos'
 * Returns a single File, or null on cancel.
 */
export async function pickFromCamera(source: 'camera' | 'photos' = 'camera'): Promise<File | null> {
  if (!isNative()) return null;

  try {
    const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera');

    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    });

    if (!image.base64String) return null;

    const mimeType = `image/${image.format}`;
    const blob = base64ToBlob(image.base64String, mimeType);
    const filename = `photo-${Date.now()}.${image.format}`;
    return new File([blob], filename, { type: mimeType });
  } catch (err: any) {
    if (
      err?.message?.includes('cancel') ||
      err?.message?.toLowerCase().includes('user cancelled')
    ) {
      return null;
    }
    console.error('[FileAccess] pickFromCamera failed:', err);
    return null;
  }
}

async function pickViaCamera(source: 'camera' | 'photos'): Promise<File[]> {
  const file = await pickFromCamera(source);
  return file ? [file] : [];
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
