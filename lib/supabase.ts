import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import type { Database } from '@/types/database';

// SecureStore has a 2048-byte limit per key.
// We chunk the session token into 1900-byte slices to stay safely under it.
const CHUNK_SIZE = 1900;

function chunkString(str: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += CHUNK_SIZE) {
    chunks.push(str.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

const ChunkedSecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    // Try reading chunk 0; if it exists, reassemble all chunks
    const firstChunk = await SecureStore.getItemAsync(`${key}.0`);
    if (firstChunk === null) return null;

    const chunks: string[] = [firstChunk];
    let index = 1;
    while (true) {
      const chunk = await SecureStore.getItemAsync(`${key}.${index}`);
      if (chunk === null) break;
      chunks.push(chunk);
      index++;
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const chunks = chunkString(value);
    // Write all new chunks
    await Promise.all(
      chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}.${i}`, chunk))
    );
    // Delete any leftover chunks from a previously longer value
    let index = chunks.length;
    while (true) {
      const existing = await SecureStore.getItemAsync(`${key}.${index}`);
      if (existing === null) break;
      await SecureStore.deleteItemAsync(`${key}.${index}`);
      index++;
    }
  },

  async removeItem(key: string): Promise<void> {
    let index = 0;
    while (true) {
      const existing = await SecureStore.getItemAsync(`${key}.${index}`);
      if (existing === null) break;
      await SecureStore.deleteItemAsync(`${key}.${index}`);
      index++;
    }
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ChunkedSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
