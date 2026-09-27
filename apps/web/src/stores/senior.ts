import { create } from 'zustand';

export const SENIOR_STORAGE_KEY = 'shop-senior';

/** 첫 페인트 전에 시니어 모드를 적용해 글자 크기가 바뀌며 흔들리는 것을 막는다 */
export const seniorInitScript = `try{if(localStorage.getItem('${SENIOR_STORAGE_KEY}')==='1')document.documentElement.setAttribute('data-senior','')}catch(e){}`;

interface SeniorState {
  enabled: boolean;
  hydrate: () => void;
  setEnabled: (v: boolean) => void;
}

/**
 * 시니어 모드: 큰 글씨·큰 버튼·진한 글자·움직임 없음·아이콘에 글자 표시.
 * 기기별 설정(접근성 설정과 같은 성격)이라 브라우저에 저장한다.
 */
export const useSeniorStore = create<SeniorState>((set) => ({
  enabled: false,
  hydrate: () => set({ enabled: document.documentElement.hasAttribute('data-senior') }),
  setEnabled: (enabled) => {
    const root = document.documentElement;
    if (enabled) root.setAttribute('data-senior', '');
    else root.removeAttribute('data-senior');
    try {
      if (enabled) localStorage.setItem(SENIOR_STORAGE_KEY, '1');
      else localStorage.removeItem(SENIOR_STORAGE_KEY);
    } catch {
      // 저장소를 쓸 수 없으면 이번 방문에만 적용된다
    }
    set({ enabled });
  },
}));
