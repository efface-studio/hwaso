import { create } from 'zustand';

/** 가입 축하 팝업 (이메일 가입·소셜 가입 마무리 직후 한 번). 루트의 WelcomeHost 가 그린다 */
export const useWelcome = create<{ nickname: string | null }>(() => ({ nickname: null }));

export const showWelcome = (nickname: string) => useWelcome.setState({ nickname });
export const closeWelcome = () => useWelcome.setState({ nickname: null });
