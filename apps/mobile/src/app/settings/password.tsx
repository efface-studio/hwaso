import { ApiError } from '@shop/api-client';
import { passwordSchema } from '@shop/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/** 비밀번호 변경 (소셜 가입자는 비밀번호 설정). 바꾸면 다른 기기는 로그아웃된다 */
export default function PasswordScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!user) return null;

  const save = async () => {
    const p = passwordSchema.safeParse(next);
    if (!p.success) return setError(p.error.issues[0]!.message);
    setError(null);
    setPending(true);
    try {
      await api.auth.changePassword({
        currentPassword: user.hasPassword ? current : '-',
        newPassword: next,
      });
      setUser({ ...user, hasPassword: true });
      Alert.alert('비밀번호를 바꿨어요', '다른 기기에서는 로그아웃됩니다.');
      goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '바꾸지 못했어요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: user.hasPassword ? '비밀번호 변경' : '비밀번호 설정' }} />
      {!user.hasPassword && (
        <Text color="muted">
          소셜 로그인으로 가입했어요. 비밀번호를 설정하면 이메일로도 로그인할 수 있어요.
        </Text>
      )}
      {user.hasPassword && (
        <Field
          label="현재 비밀번호"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          value={current}
          onChangeText={setCurrent}
        />
      )}
      <Field
        label="새 비밀번호"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        value={next}
        onChangeText={setNext}
        hint="8자 이상, 영문과 숫자를 포함해주세요."
        error={error}
      />
      <Button
        title={user.hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
        size="lg"
        loading={pending}
        disabled={!next || (user.hasPassword && !current)}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
});
