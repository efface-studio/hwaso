import { router } from 'expo-router';
import { Empty } from '@/components/ui/state';
import { useAuthStore } from '@/stores/auth';

export default function ChatScreen() {
  const user = useAuthStore((s) => s.user);
  if (!user)
    return (
      <Empty
        title="로그인하고 판매자와 대화해보세요"
        action={{ title: '로그인', onPress: () => router.push('/login') }}
      />
    );
  return <Empty title="아직 대화가 없어요" description="작품 상세에서 판매자에게 궁금한 점을 물어보세요." />;
}
