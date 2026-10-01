import { ApiError } from '@shop/api-client';
import { passwordSchema } from '@shop/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormScroll } from '@/components/ui/form-scroll';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useScreenGuard } from '@/lib/screen-guard';
import { goBack } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';
import { passwordIssueMessage } from '@/components/auth/validation';

/** 비밀번호 변경 (소셜 가입자는 비밀번호 설정). 바꾸면 다른 기기는 로그아웃된다 */
export default function PasswordScreen() {
  // 비밀번호 입력 화면 — 캡처·화면 녹화 차단
  useScreenGuard();
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!user) return null;

  const save = async () => {
    const p = passwordSchema.safeParse(next);
    if (!p.success) return setError(passwordIssueMessage(p.error.issues[0]!, next));
    setError(null);
    setPending(true);
    try {
      await api.auth.changePassword({
        currentPassword: user.hasPassword ? current : '-',
        newPassword: next,
      });
      setUser({ ...user, hasPassword: true });
      Alert.alert(tr('password.changedTitle'), tr('password.changedMessage'));
      goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr('password.failed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <FormScroll style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: user.hasPassword ? tr('password.change') : tr('password.set') }} />
      {!user.hasPassword && <Text color="muted">{tr('password.socialNotice')}</Text>}
      {user.hasPassword && (
        <Field
          label={tr('password.current')}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          value={current}
          onChangeText={setCurrent}
        />
      )}
      <Field
        label={tr('password.new')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        value={next}
        onChangeText={setNext}
        hint={tr('password.hint')}
        error={error}
      />
      <Button
        title={user.hasPassword ? tr('password.change') : tr('password.set')}
        size="lg"
        loading={pending}
        disabled={!next || (user.hasPassword && !current)}
        onPress={() => void save()}
      />
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
});
