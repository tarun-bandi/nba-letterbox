import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
  show: (message: string, type?: ToastType) => void;
  hide: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: '',
  type: 'success',
  visible: false,
  show: (message, type = 'success') => {
    if (timer) clearTimeout(timer);
    set({ message, type, visible: true });
    timer = setTimeout(() => {
      set({ visible: false });
    }, 2500);
  },
  hide: () => {
    if (timer) clearTimeout(timer);
    set({ visible: false });
  },
}));
