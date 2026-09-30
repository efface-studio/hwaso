import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Empty } from '@/components/ui/state';

export default function NotFound() {
  const { t: tr } = useTranslation('common');
  return (
    <Empty
      kind="notfound"
      title={tr('notFound.title')}
      action={{ title: tr('notFound.goHome'), onPress: () => router.replace('/home') }}
    />
  );
}
