import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Checkbox } from '@/components/ui/checkbox';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

export interface AgreementState {
  terms: boolean;
  privacy: boolean;
  ageOver14: boolean;
  marketing: boolean;
}

export const NO_AGREEMENT: AgreementState = {
  terms: false,
  privacy: false,
  ageOver14: false,
  marketing: false,
};

/** 필수 항목(이용약관·개인정보·만 14세)에 모두 동의했는지 */
export const requiredAgreed = (a: AgreementState) => a.terms && a.privacy && a.ageOver14;

/**
 * 약관 동의 묶음 (이메일 가입·소셜 첫 로그인 동의 화면 공용).
 * 필수 항목을 따로 받고, 선택(마케팅)은 나눠 둔다. 약관 본문은 '보기'로 연다.
 */
export function Agreements({
  value,
  onChange,
}: {
  value: AgreementState;
  onChange: (v: AgreementState) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('auth');
  const all = value.terms && value.privacy && value.ageOver14 && value.marketing;
  const view = (slug: 'terms' | 'privacy') => (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tr('agreement.viewA11y', {
        title: slug === 'terms' ? tr('agreement.terms') : tr('agreement.privacy'),
      })}
      hitSlop={8}
      onPress={() => router.push({ pathname: '/policies/[slug]', params: { slug } })}
    >
      <Text variant="small" color="muted">
        {tr('agreement.view')}
      </Text>
    </Pressable>
  );
  const set = (patch: Partial<AgreementState>) => onChange({ ...value, ...patch });
  return (
    <View>
      <Checkbox
        label={tr('agreement.all')}
        strong
        checked={all}
        onChange={(v) => onChange({ terms: v, privacy: v, ageOver14: v, marketing: v })}
      />
      <View style={[styles.divider, { backgroundColor: t.colors.borderSoft }]} />
      <Checkbox
        label={tr('agreement.terms')}
        checked={value.terms}
        onChange={(v) => set({ terms: v })}
        trailing={view('terms')}
      />
      <Checkbox
        label={tr('agreement.privacy')}
        checked={value.privacy}
        onChange={(v) => set({ privacy: v })}
        trailing={view('privacy')}
      />
      <Checkbox
        label={tr('agreement.ageOver14')}
        checked={value.ageOver14}
        onChange={(v) => set({ ageOver14: v })}
      />
      <Checkbox
        label={tr('agreement.marketing')}
        checked={value.marketing}
        onChange={(v) => set({ marketing: v })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
