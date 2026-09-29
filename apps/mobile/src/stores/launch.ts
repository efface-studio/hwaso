import { create } from 'zustand';

/** 앱 시작 스플래시가 끝났는지 — 첫 화면(로그인)의 등장 애니메이션을 스플래시 뒤에 맞춘다 */
export const useLaunch = create<{ splashDone: boolean; finishSplash: () => void }>((set) => ({
  splashDone: false,
  finishSplash: () => set({ splashDone: true }),
}));
