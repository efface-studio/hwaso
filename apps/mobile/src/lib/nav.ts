import { router } from 'expo-router';

/** 뒤로 갈 화면이 없으면(딥링크·푸시로 바로 열린 경우) 홈으로 */
export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/home'));
