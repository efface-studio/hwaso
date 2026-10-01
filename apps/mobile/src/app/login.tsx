import { ApiError } from '@shop/api-client';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, useWindowDimensions, View, type TextInput } from 'react-native';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { appDevice } from '@/lib/device';
import { goBack } from '@/lib/nav';
import { biometricKind, hasQuickLogin, signInWithQuickLogin, type BiometricKind } from '@/lib/quick-login';
import { secure } from '@/lib/secure';
import { useAuthStore } from '@/stores/auth';
import { enterAsGuest, useEntry } from '@/stores/entry';
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
/** 아이디(이메일) 저장 — 비밀이 아니지만 다른 값과 같은 키체인에 둔다 */
const SAVED_EMAIL_KEY = 'hwaso.savedEmail';
/** 자동 로그인 선택을 기억한다 (끈 경우만 '0') */
const AUTO_LOGIN_KEY = 'hwaso.autoLogin';

const QUICK_ICON: Record<
  BiometricKind,
  { ios: 'faceid' | 'touchid' | 'lock.shield'; android: 'fingerprint' }
> = {
  face: { ios: 'faceid', android: 'fingerprint' },
  touch: { ios: 'touchid', android: 'fingerprint' },
  fingerprint: { ios: 'touchid', android: 'fingerprint' },
  biometric: { ios: 'lock.shield', android: 'fingerprint' },
};

/**
 * 로그인. 두 가지로 열린다.
 * - 첫 화면: 로그인하지 않은 채 앱을 열면 index 가 보낸다. 닫기 대신 아래 "둘러보기"로 로그인 없이 들어간다
 * - 로그인이 필요한 동작(관심·입찰·구매·채팅 등)이나 마이 탭에서 띄울 때: 왼쪽 위 닫기로 둘러보던 화면으로
 * 로그인에 성공하면 루트 가드가 이 화면을 스택에서 빼서 보던 화면(첫 화면이었으면 홈)으로 간다.
 * 한 화면에 들어가도록 높이에 맞춰 배치하고, 키보드가 올라오거나 큰 글씨 모드로 넘칠 때만 스크롤된다.
 */
export default function LoginScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth', 'common', 'my']);
  // 돌아갈 화면이 없으면 앱의 첫 화면으로 열린 것
  const [first] = useState(() => !router.canGoBack());
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height - insets.top - insets.bottom < COMPACT_HEIGHT;
  const splashDone = useLaunch((s) => s.splashDone);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveEmail, setSaveEmail] = useState(false);
  const persistent = useAuthStore((s) => s.persistent);
  const [quickKind, setQuickKind] = useState<BiometricKind | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // 저장한 아이디 · 자동 로그인 선택 · 이 기기의 빠른 로그인을 불러온다
  useEffect(() => {
    void secure.get(SAVED_EMAIL_KEY).then((saved) => {
      if (!saved) return;
      setEmail((cur) => cur || saved);
      setSaveEmail(true);
    });
    void secure.get(AUTO_LOGIN_KEY).then((v) => useAuthStore.getState().setPersistent(v !== '0'));
    void hasQuickLogin()
      .then(async (has) => (has ? biometricKind() : null))
      .then(setQuickKind)
      .catch(() => setQuickKind(null));
  }, []);

  const setAutoLogin = (on: boolean) => {
    useAuthStore.getState().setPersistent(on);
    void (on ? secure.remove(AUTO_LOGIN_KEY) : secure.set(AUTO_LOGIN_KEY, '0'));
  };

  const hero = useRise(0, splashDone);
  const form = useRise(120, splashDone);
  const social = useRise(240, splashDone);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = email.trim();
      const tokens = await api.auth.login({ email: id, password, device: appDevice() });
      await (saveEmail ? secure.set(SAVED_EMAIL_KEY, id) : secure.remove(SAVED_EMAIL_KEY));
      useEntry.setState({ interactiveLogin: 'password' });
      await useAuthStore.getState().setSession(tokens);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr('login.failed'));
    } finally {
      setBusy(false);
    }
  };

  /** Face ID·지문으로 꺼낸 자격으로 로그인 (비밀번호를 기기에 두지 않는다) */
  const quickLogin = async () => {
    setQuickBusy(true);
    setError(null);
    useEntry.setState({ interactiveLogin: 'quick' });
    try {
      const r = await signInWithQuickLogin(tr('quick.prompt'));
      if (r !== 'ok') useEntry.setState({ interactiveLogin: null });
      if (r === 'invalid') {
        setQuickKind(null);
        Alert.alert(tr('quick.invalidTitle'), tr('quick.invalidMessage'));
      }
    } catch (e) {
      useEntry.setState({ interactiveLogin: null });
      setError(e instanceof ApiError ? e.message : tr('login.failed'));
    } finally {
      setQuickBusy(false);
    }
  };

  /** 닫기(둘러보던 화면으로) · 둘러보기(첫 화면에서 홈으로). 로그인 뒤 열려던 링크는 버린다 */
  const close = () => {
    enterAsGuest();
    if (first) router.replace('/home');
    else goBack();
  };

  const policy = (slug: 'terms' | 'privacy') =>
    router.push({ pathname: '/policies/[slug]', params: { slug } });

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      {/* 로그인이 필요한 동작에서 띄웠으면 닫고 둘러보던 화면으로 (첫 화면이면 아래 "둘러보기") */}
      {!first && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('login.close')}
          hitSlop={8}
          onPress={close}
          style={({ pressed }) => [
            styles.close,
            { top: insets.top + 4, minWidth: t.touch, minHeight: t.touch, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Icon ios="xmark" android="close" color="muted" />
        </Pressable>
      )}
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
              <Text
                variant="h1"
                style={[
                  compact ? styles.titleCompact : styles.title,
                  t.scale > 1 && { fontSize: Math.round(30 * t.scale), lineHeight: Math.round(38 * t.scale) },
                ]}
              >
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
            {quickKind && (
              <Button
                title={tr(`quick.button.${quickKind}`)}
                variant="secondary"
                size="lg"
                block
                loading={quickBusy}
                disabled={busy}
                icon={<Icon {...QUICK_ICON[quickKind]} color="secondaryForeground" />}
                onPress={() => void quickLogin()}
              />
            )}
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
            <View style={styles.options}>
              <View style={styles.option}>
                <Checkbox label={tr('login.saveEmail')} checked={saveEmail} onChange={setSaveEmail} />
              </View>
              <View style={styles.option}>
                <Checkbox label={tr('login.autoLogin')} checked={persistent} onChange={setAutoLogin} />
              </View>
            </View>
            <Button
              title={tr('login.submit')}
              size="lg"
              block
              loading={busy}
              disabled={!email || !password || quickBusy}
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
            {/* 로그인되면 루트 가드가 이동을 맡는다. 새로 가입했으면 동의·가입 축하가 먼저라 빠른 로그인은 다음 로그인 때 묻는다 */}
            <SocialButtons
              compact={compact}
              onDone={(isNewUser) => {
                if (!isNewUser) useEntry.setState({ interactiveLogin: 'social' });
              }}
            />
          </View>
          {/* 로그인 없이 둘러보기 (App Store 5.1.1 — 계정이 필요 없는 기능은 로그인 없이 쓸 수 있어야 한다) */}
          {first && (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={close}
              style={({ pressed }) => [styles.browse, { minHeight: t.touch, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text variant="small" color="muted">
                {tr('login.browse')}
              </Text>
              <Icon ios="chevron.right" android="chevron_right" color="muted" size={12 * t.scale} />
            </Pressable>
          )}
          <View style={[styles.links, { marginTop: first ? 4 : compact ? 18 : 24 }]}>
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
  options: { flexDirection: 'row', gap: 12, marginTop: -6 },
  option: { flex: 1 },
  browse: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 12,
    alignSelf: 'center',
    paddingHorizontal: 12,
  },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 4 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  social: { gap: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
