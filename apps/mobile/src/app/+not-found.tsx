import { router } from 'expo-router';
import { Empty } from '@/components/ui/state';

export default function NotFound() {
  return (
    <Empty
      kind="notfound"
      title="페이지를 찾을 수 없어요"
      action={{ title: '홈으로', onPress: () => router.replace('/home') }}
    />
  );
}
