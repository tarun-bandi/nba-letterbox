import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export async function pickAndUploadAvatar(
  userId: string,
): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const fileName = `${userId}/${Date.now()}.${ext}`;

  // Fetch the image as blob
  const response = await fetch(asset.uri);
  const blob = await response.blob();

  // Read blob as ArrayBuffer
  const arrayBuffer = await new Response(blob).arrayBuffer();

  const { error } = await supabase.storage
    .from('avatars')
    .upload(fileName, arrayBuffer, {
      contentType: asset.mimeType ?? `image/${ext}`,
      upsert: true,
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}
