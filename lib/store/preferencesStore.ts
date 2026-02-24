import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WatchMode } from '@/types/database';

interface PreferencesState {
  defaultWatchMode: WatchMode | null;
  spoilerFreeMode: boolean;
  notifyReactions: boolean;
  notifyComments: boolean;
  notifyFollows: boolean;
  setDefaultWatchMode: (mode: WatchMode | null) => void;
  setSpoilerFreeMode: (enabled: boolean) => void;
  setNotifyReactions: (enabled: boolean) => void;
  setNotifyComments: (enabled: boolean) => void;
  setNotifyFollows: (enabled: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      defaultWatchMode: null,
      spoilerFreeMode: false,
      notifyReactions: true,
      notifyComments: true,
      notifyFollows: true,
      setDefaultWatchMode: (defaultWatchMode) => set({ defaultWatchMode }),
      setSpoilerFreeMode: (spoilerFreeMode) => set({ spoilerFreeMode }),
      setNotifyReactions: (notifyReactions) => set({ notifyReactions }),
      setNotifyComments: (notifyComments) => set({ notifyComments }),
      setNotifyFollows: (notifyFollows) => set({ notifyFollows }),
    }),
    {
      name: 'nba-letterbox-preferences',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
