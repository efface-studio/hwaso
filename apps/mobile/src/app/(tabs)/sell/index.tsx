import { router } from 'expo-router';
import { Empty } from '@/components/ui/state';
import { useAuthStore } from '@/stores/auth';

export default function SellScreen() {
  const user = useAuthStore((s) => s.user);
  if (!user)
    return (
      <Empty
        title="작품을 판매하려면 로그인해주세요"
        action={{ title: '로그인', onPress: () => router.push('/login') }}
      />
    );
  return <Empty title="작품 등록" description="사진 촬영부터 가격 설정까지 곧 앱에서 할 수 있어요." />;
}
