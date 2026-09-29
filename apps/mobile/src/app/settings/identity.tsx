import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { BridgeCancelled, verifyIdentity } from '@/lib/bridge';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/** PASS 본인인증: 휴대폰 명의 확인 (판매 정산·성인 인증에 필요) */
export default function IdentityScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.auth.providers,
    staleTime: 600_000,
  });
  const status = useQuery({ queryKey: ['identity'], queryFn: api.auth.identity });
  const [pending, setPending] = useState(false);
  if (!user) return null;
  if (status.isPending) return <Loading variant="text" />;

  const verify = async () => {
    // 키가 없는 개발 환경에서도 화면은 보이게 두고, 눌렀을 때 안내한다
    if (!providers.data?.identity)
      return Alert.alert('본인인증 준비 중', 'PASS 본인인증은 PortOne 키 설정 후 사용할 수 있어요.');
    setPending(true);
    try {
      await verifyIdentity();
      setUser({ ...user, identityVerified: true });
      await qc.invalidateQueries({ queryKey: ['identity'] });
      Alert.alert('본인인증을 완료했어요');
    } catch (e) {
      if (!(e instanceof BridgeCancelled)) Alert.alert('본인인증을 완료하지 못했어요', (e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const s = status.data;
  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: '본인인증' }} />
      {s?.verified ? (
        <View style={[styles.card, { borderColor: t.colors.primary }]}>
          <Text variant="bodyStrong">본인인증 완료 · PASS</Text>
          <Text variant="small" color="muted">
            {s.nameMasked} · {s.phoneMasked} · {s.isAdult ? '성인' : '미성년'}
          </Text>
          {s.verifiedAt && (
            <Text variant="caption" color="muted">
              {new Date(s.verifiedAt).toLocaleDateString('ko-KR')} 인증
            </Text>
          )}
        </View>
      ) : (
        <>
          <Text color="muted">
            휴대폰 PASS 인증으로 명의를 확인합니다. 인증 정보는 중복 가입 방지를 위한 값만 안전하게 보관돼요.
          </Text>
          <Button title="PASS 본인인증" size="lg" loading={pending} onPress={() => void verify()} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  card: { borderWidth: 1, borderRadius: 8, padding: 16, gap: 4 },
});
