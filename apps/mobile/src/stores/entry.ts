import { create } from 'zustand';

interface EntryState {
  /** 로그인하지 않고 둘러보기를 골랐는지 — 이번 실행 동안만 기억한다 (다음 실행은 다시 로그인 화면부터) */
  guest: boolean;
  /** 로그인해야 열리는 딥링크·알림 경로 — 로그인(또는 세션 복구)이 끝나면 연다 */
  pending: string | null;
  /** 방금 로그인 화면에서 직접 로그인했는지 — 빠른 로그인 안내·기기 묶기를 한 번 한다 */
  interactiveLogin: 'password' | 'social' | 'quick' | null;
}

/** 앱 첫 화면(로그인 ↔ 둘러보기)과 로그인 뒤 이동 */
export const useEntry = create<EntryState>(() => ({ guest: false, pending: null, interactiveLogin: null }));

/** 둘러보기로 들어간다 (미뤄 둔 링크는 버린다) */
export const enterAsGuest = () => useEntry.setState({ guest: true, pending: null });
