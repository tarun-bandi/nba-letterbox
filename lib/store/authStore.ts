import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  onboardingCompleted: boolean;
  setSession: (session: Session | null) => void;
  setLoading: (isLoading: boolean) => void;
  setOnboardingCompleted: (completed: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  onboardingCompleted: false,
  setSession: (session) =>
    set({ session, user: session?.user ?? null }),
  setLoading: (isLoading) => set({ isLoading }),
  setOnboardingCompleted: (onboardingCompleted) => set({ onboardingCompleted }),
}));
