import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
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

// On web, use localStorage. On native, use SecureStore with chunking.
let storageAdapter: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

if (Platform.OS === 'web') {
  storageAdapter = {
    async getItem(key: string) {
      return localStorage.getItem(key);
    },
    async setItem(key: string, value: string) {
      localStorage.setItem(key, value);
    },
    async removeItem(key: string) {
      localStorage.removeItem(key);
    },
  };
} else {
  // Lazy-import SecureStore only on native to avoid web crash
  const SecureStore = require('expo-secure-store');

  storageAdapter = {
    async getItem(key: string): Promise<string | null> {
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
      await Promise.all(
        chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}.${i}`, chunk))
      );
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
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
