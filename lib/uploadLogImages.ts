import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

const BUCKET = 'game-log-images';
const MAX_IMAGES = 4;

/** Opens the image picker with multi-select (up to MAX_IMAGES - currentCount). */
export async function pickLogImages(
  remaining: number,
): Promise<ImagePicker.ImagePickerAsset[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 0.8,
  });

  if (result.canceled || !result.assets.length) return null;
  return result.assets;
}

/** Uploads a single image to the game-log-images bucket. Returns the public URL. */
export async function uploadLogImage(
  userId: string,
  uri: string,
  mimeType?: string | null,
): Promise<string> {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
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
