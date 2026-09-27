import { create } from 'zustand';

export type ToastTone = 'default' | 'success' | 'destructive';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  /** ms. 0 이면 수동으로 닫는다 */
  duration: number;
  /** 누르면 이동 (알림·채팅 토스트) */
  href?: string;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string, opts?: { tone?: ToastTone; duration?: number; href?: string }) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, opts) => {
    const id = ++seq;
    const duration = opts?.duration ?? 3000;
    set((s) => ({
      toasts: [
        ...s.toasts.slice(-2),
        { id, message, tone: opts?.tone ?? 'default', duration, href: opts?.href },
      ],
    }));
    if (duration > 0) setTimeout(() => get().dismiss(id), duration);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  show: (m: string) => useToastStore.getState().show(m),
  success: (m: string) => useToastStore.getState().show(m, { tone: 'success' }),
  error: (m: string) => useToastStore.getState().show(m, { tone: 'destructive', duration: 5000 }),
  link: (m: string, href: string) => useToastStore.getState().show(m, { href, duration: 5000 }),
};
