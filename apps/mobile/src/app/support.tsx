import { COMPANY, POLICIES, POLICY_SLUGS } from '@shop/shared';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { actionSheet } from '@/lib/action-sheet';
import { useTheme } from '@/theme';

/**
 * 연락처 행: 전화·메일 앱으로 바로 열거나 번호·주소를 복사한다.
 * (시뮬레이터·메일 계정이 없는 기기에서는 여는 요청이 아무 반응 없이 끝나므로 복사 선택지를 함께 준다)
 */
function contact(title: string, open: { label: string; url: string }, value: string, what: string) {
  actionSheet(title, [
    { label: open.label, onPress: () => void Linking.openURL(open.url).catch(() => undefined) },
    {
      label: `${what} 복사`,
      onPress: () =>
        void Clipboard.setStringAsync(value).then(() => Alert.alert(`${what}를 복사했어요`, value)),
    },
  ]);
}

/** 고객센터: 공지사항·문의 연락처·약관과 정책·사업자 정보·앱 버전 */
export default function SupportScreen() {
  const t = useTheme();
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
    ['상호', COMPANY.name],
    ['대표', COMPANY.ceo],
    ['주소', COMPANY.address],
    ['사업자등록번호', COMPANY.bizNo],
    ['통신판매업신고', COMPANY.mailOrderNo],
    ['개인정보보호책임자', COMPANY.privacyOfficer],
    ['호스팅', COMPANY.hosting],
  ];

  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: '고객센터' }} />
      <Text variant="label" color="muted" style={styles.group}>
        문의
      </Text>
      {row('공지사항', () => router.push('/notices'))}
      {row(
        `전화 ${COMPANY.phone}`,
        () =>
          contact(
            COMPANY.phone,
            { label: '전화 걸기', url: `tel:${COMPANY.phone}` },
            COMPANY.phone,
            '전화번호',
          ),
        COMPANY.hours,
      )}
      {row(`이메일 ${COMPANY.email}`, () =>
        contact(
          COMPANY.email,
          { label: '메일 보내기', url: `mailto:${COMPANY.email}` },
          COMPANY.email,
          '이메일 주소',
        ),
      )}
      <Text variant="label" color="muted" style={styles.group}>
        약관 · 정책
      </Text>
      {POLICY_SLUGS.map((slug) =>
        row(POLICIES[slug].title, () => router.push({ pathname: '/policies/[slug]', params: { slug } })),
      )}
      <Text variant="label" color="muted" style={styles.group}>
        사업자 정보
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
        화소는 통신판매중개자로서 거래 당사자가 아니며, 판매자가 등록한 상품 정보와 거래에 대한 책임은
        판매자에게 있습니다. 결제 대금은 구매 확정 전까지 안전하게 보관됩니다.
      </Text>
      <Text variant="caption" color="muted" style={{ marginTop: 16, textAlign: 'center' }}>
        화소 {Constants.expoConfig?.version ?? ''} · Created by efface
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48 },
  group: { marginTop: 20, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: { flexDirection: 'row', gap: 8 },
});
