import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WatchMode } from '@/types/database';

interface PreferencesState {
  defaultWatchMode: WatchMode | null;
  spoilerFreeMode: boolean;
  setDefaultWatchMode: (mode: WatchMode | null) => void;
  setSpoilerFreeMode: (enabled: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      defaultWatchMode: null,
      spoilerFreeMode: false,
      setDefaultWatchMode: (defaultWatchMode) => set({ defaultWatchMode }),
      setSpoilerFreeMode: (spoilerFreeMode) => set({ spoilerFreeMode }),
    }),
    {
      name: 'nba-letterbox-preferences',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
