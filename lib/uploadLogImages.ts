import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const BUCKET = 'game-log-images';
const MAX_IMAGES = 4;

/** Opens the image picker with multi-select (up to MAX_IMAGES - currentCount). */
export async function pickLogImages(
  remaining: number,
): Promise<ImagePicker.ImagePickerAsset[] | null> {
  if (Platform.OS === 'web') {
    return pickLogImagesWeb(remaining);
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 0.8,
  });

  if (result.canceled || !result.assets.length) return null;
  return result.assets;
}

/** Web-specific file picker using a hidden <input> element. */
function pickLogImagesWeb(
  remaining: number,
): Promise<ImagePicker.ImagePickerAsset[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = remaining > 1;
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const files = input.files;
      if (!files || files.length === 0) {
        resolve(null);
        input.remove();
        return;
      }

      const selected = Array.from(files).slice(0, remaining);
      let processed = 0;
      const assets: ImagePicker.ImagePickerAsset[] = [];

      selected.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUri = reader.result as string;
          // Create an image to get dimensions
          const img = new Image();
          img.onload = () => {
            assets.push({
              uri: dataUri,
              width: img.width,
              height: img.height,
              mimeType: file.type || 'image/jpeg',
              fileName: file.name,
            } as ImagePicker.ImagePickerAsset);
            processed++;
            if (processed === selected.length) {
              resolve(assets);
              input.remove();
            }
          };
          img.onerror = () => {
            // Still add the asset without dimensions
            assets.push({
              uri: dataUri,
              width: 0,
              height: 0,
              mimeType: file.type || 'image/jpeg',
              fileName: file.name,
            } as ImagePicker.ImagePickerAsset);
            processed++;
            if (processed === selected.length) {
              resolve(assets);
              input.remove();
            }
          };
          img.src = dataUri;
        };
        reader.readAsDataURL(file);
      });
    });

    // Handle cancel (user closes file dialog without selecting)
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });

    document.body.appendChild(input);
    input.click();
  });
}

/** Uploads a single image to the game-log-images bucket. Returns the public URL. */
export async function uploadLogImage(
  userId: string,
  uri: string,
  mimeType?: string | null,
): Promise<string> {
  const ext = uri.startsWith('data:')
    ? (uri.match(/data:image\/(\w+)/)?.[1] ?? 'jpg')
    : (uri.split('.').pop()?.toLowerCase() ?? 'jpg');
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const response = await fetch(uri);
  const blob = await response.blob();
  const arrayBuffer = await new Response(blob).arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, arrayBuffer, {
      contentType: mimeType ?? `image/${ext}`,
      upsert: false,
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

/** Deletes an image from storage given its public URL. */
export async function deleteLogImage(publicUrl: string): Promise<void> {
  // Public URL format: .../storage/v1/object/public/game-log-images/{path}
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;

  const path = publicUrl.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export { MAX_IMAGES };
