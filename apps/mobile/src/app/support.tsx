import { COMPANY, POLICY_SLUGS } from '@shop/shared';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { actionSheet } from '@/lib/action-sheet';
import { useTheme } from '@/theme';
import { readable } from '@/hooks/use-layout';

/**
 * 연락처 행: 전화·메일 앱으로 바로 열거나 번호·주소를 복사한다.
 * (시뮬레이터·메일 계정이 없는 기기에서는 여는 요청이 아무 반응 없이 끝나므로 복사 선택지를 함께 준다)
 */
function contact(
  title: string,
  open: { label: string; url: string },
  value: string,
  copy: { label: string; done: string },
) {
  actionSheet(title, [
    { label: open.label, onPress: () => void Linking.openURL(open.url).catch(() => undefined) },
    {
      label: copy.label,
      onPress: () => void Clipboard.setStringAsync(value).then(() => Alert.alert(copy.done, value)),
    },
  ]);
}

/** 고객센터: 공지사항·문의 연락처·약관과 정책·사업자 정보·앱 버전 */
export default function SupportScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const row = (label: string, onPress: () => void, sub?: string) => (
    <Pressable
      key={label}
      accessibilityRole="link"
      onPress={onPress}
      style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}
    >
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {sub && (
          <Text variant="caption" color="muted">
            {sub}
          </Text>
        )}
      </View>
      <Text color="faint">›</Text>
    </Pressable>
  );
  const info: [string, string][] = [
    [tr('support.company.name'), COMPANY.name],
    [tr('support.company.ceo'), COMPANY.ceo],
    [tr('support.company.address'), COMPANY.address],
    [tr('support.company.bizNo'), COMPANY.bizNo],
    [tr('support.company.mailOrderNo'), COMPANY.mailOrderNumber],
    [
      tr('support.company.privacyOfficer'),
      `${COMPANY.privacyOfficer.name} (${COMPANY.privacyOfficer.email})`,
    ],
    [tr('support.company.hosting'), COMPANY.hostingProvider],
  ];

  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: tr('common:screen.support') }} />
      <Text variant="label" color="muted" style={styles.group}>
        {tr('support.contactGroup')}
      </Text>
      {row(tr('support.notices'), () => router.push('/notices'))}
      {row(
        tr('support.phone', { phone: COMPANY.phone }),
        () =>
          contact(COMPANY.phone, { label: tr('support.call'), url: `tel:${COMPANY.phone}` }, COMPANY.phone, {
            label: tr('support.copyPhone'),
            done: tr('support.phoneCopied'),
          }),
        // 상담 시간 (COMPANY.hours 와 같은 내용을 언어별로)
        tr('support.hours'),
      )}
      {row(tr('support.email', { email: COMPANY.email }), () =>
        contact(
          COMPANY.email,
          { label: tr('support.sendEmail'), url: `mailto:${COMPANY.email}` },
          COMPANY.email,
          { label: tr('support.copyEmail'), done: tr('support.emailCopied') },
        ),
      )}
      <Text variant="label" color="muted" style={styles.group}>
        {tr('support.policiesGroup')}
      </Text>
      {POLICY_SLUGS.map((slug) =>
        row(tr(`policy.title.${slug}`), () =>
          router.push({ pathname: '/policies/[slug]', params: { slug } }),
        ),
      )}
      <Text variant="label" color="muted" style={styles.group}>
        {tr('support.companyGroup')}
      </Text>
      <View style={{ gap: 4 }}>
        {info.map(([k, v]) => (
          <View key={k} style={styles.info}>
            <Text variant="small" color="muted" style={{ width: 120 }}>
              {k}
            </Text>
            <Text variant="small" style={{ flex: 1 }}>
              {v}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" color="muted" style={{ marginTop: 16 }}>
        {tr('support.disclaimer')}
      </Text>
      <Text variant="caption" color="muted" style={{ marginTop: 16, textAlign: 'center' }}>
        {tr('support.version', { version: Constants.expoConfig?.version ?? '' })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { ...readable, padding: 16, paddingBottom: 48 },
  group: { marginTop: 20, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: { flexDirection: 'row', gap: 8 },
});
