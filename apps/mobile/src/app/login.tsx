import { ApiError } from '@shop/api-client';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type TextInput } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SocialButtons } from '@/components/auth/social-buttons';
import { HwasoMark } from '@/components/brand/hwaso-mark';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { appDevice } from '@/lib/device';
import { goBack } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth';
import { useLaunch } from '@/stores/launch';
import { useTheme } from '@/theme';

/** 스플래시가 끝나면 위에서부터 차례로 떠오른다 */
function useRise(delay: number, go: boolean) {
  const reduceMotion = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (!go) return;
    v.value = withDelay(
      reduceMotion ? 0 : delay,
      withTiming(1, { duration: reduceMotion ? 1 : 520, easing: Easing.out(Easing.cubic) }),
    );
  }, [go, delay, reduceMotion, v]);
  return v;
}

function Rise({ v, children }: { v: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: 18 * (1 - v.value) }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** 이보다 낮은 화면(SE 등)은 간편 로그인을 원형 버튼 한 줄로 줄여 스크롤 없이 한 화면에 담는다 */
const COMPACT_HEIGHT = 720;
/** 태블릿에서 폼이 너무 넓어지지 않게 */
const MAX_WIDTH = 420;

/**
 * 로그인 — 로그인이 필요한 동작(관심·입찰·구매·채팅 등)이나 마이 탭에서 띄운다. 닫으면 둘러보던 화면으로.
 * 로그인에 성공하면 루트 가드가 이 화면을 스택에서 빼서 보던 화면으로 돌아간다.
 * 한 화면에 들어가도록 높이에 맞춰 배치하고, 키보드가 올라오거나 큰 글씨 모드로 넘칠 때만 스크롤된다.
 */
export default function LoginScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth', 'common', 'my']);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height - insets.top - insets.bottom < COMPACT_HEIGHT;
  const splashDone = useLaunch((s) => s.splashDone);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const hero = useRise(0, splashDone);
  const form = useRise(120, splashDone);
  const social = useRise(240, splashDone);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const tokens = await api.auth.login({ email: email.trim(), password, device: appDevice() });
      await useAuthStore.getState().setSession(tokens);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr('login.failed'));
    } finally {
      setBusy(false);
    }
  };

  const policy = (slug: 'terms' | 'privacy') =>
    router.push({ pathname: '/policies/[slug]', params: { slug } });

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      {/* 로그인하지 않고 둘러보기 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('login.close')}
        hitSlop={8}
        onPress={goBack}
        style={({ pressed }) => [
          styles.close,
          { top: insets.top + 4, minWidth: t.touch, minHeight: t.touch, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Icon ios="xmark" android="close" color="muted" />
      </Pressable>
      <FormScroll
        contentContainerStyle={[
          styles.body,
          {
            paddingTop: insets.top + (compact ? 16 : 24),
            paddingBottom: insets.bottom + 16,
            gap: compact ? 22 : 28,
          },
        ]}
        alwaysBounceVertical={false}
        keyboardDismissMode="interactive"
      >
        <Rise v={hero}>
          <View style={styles.hero}>
            <HwasoMark size={compact ? 52 : 64} />
            <View style={styles.titleRow}>
              <Text variant="h1" style={compact ? styles.titleCompact : styles.title}>
                {tr('login.brand')}
              </Text>
              <Text variant="small" color="muted">
                畫所
              </Text>
            </View>
            <Text variant={compact ? 'small' : 'body'} color="muted">
              {tr('login.tagline')}
            </Text>
          </View>
        </Rise>

        <Rise v={form}>
          <View style={styles.form}>
            <Field
              label={tr('login.email')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              ref={passwordRef}
              label={tr('login.password')}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              error={error}
            />
            <Button
              title={tr('login.submit')}
              size="lg"
              block
              loading={busy}
              disabled={!email || !password}
              onPress={() => void submit()}
            />
            <View style={styles.links}>
              <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/forgot-password')}>
                <Text variant="small" color="muted">
                  {tr('login.forgotPassword')}
                </Text>
              </Pressable>
              <View style={[styles.dot, { backgroundColor: t.colors.borderStrong }]} />
              <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/signup')}>
                <Text variant="small" color="primary">
                  {tr('login.signupWithEmail')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Rise>

        <Rise v={social}>
          <View style={styles.social}>
            <View style={styles.dividerRow}>
              <View style={[styles.line, { backgroundColor: t.colors.border }]} />
              <Text variant="caption" color="faint">
                {tr('login.socialDivider')}
              </Text>
              <View style={[styles.line, { backgroundColor: t.colors.border }]} />
            </View>
            {/* 로그인되면 루트 가드가 이동을 맡는다 */}
            <SocialButtons compact={compact} onDone={() => {}} />
          </View>
          <View style={[styles.links, { marginTop: compact ? 18 : 24 }]}>
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => policy('terms')}>
              <Text variant="caption" color="faint">
                {tr('my:policy.title.terms')}
              </Text>
            </Pressable>
            <View style={[styles.dot, { backgroundColor: t.colors.border }]} />
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => policy('privacy')}>
              <Text variant="caption" color="faint">
                {tr('my:policy.title.privacy')}
              </Text>
            </Pressable>
          </View>
        </Rise>
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: MAX_WIDTH + 48,
    alignSelf: 'center',
  },
  close: { position: 'absolute', left: 12, zIndex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 },
  title: { fontSize: 30, lineHeight: 38 },
  titleCompact: { fontSize: 26, lineHeight: 32 },
  form: { gap: 14 },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 4 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  social: { gap: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
