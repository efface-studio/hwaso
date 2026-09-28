import { COMPANY } from '@shop/shared';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { env } from '@/lib/env';
import { useTheme } from '@/theme';

/** 약관·정책은 웹과 같은 문서를 인앱 브라우저로 연다 (한 곳에서만 관리) */
const POLICIES: [string, string][] = [
  ['/terms', '이용약관'],
  ['/privacy', '개인정보처리방침'],
  ['/policy/auction', '경매 운영 정책'],
  ['/policy/authenticity', '진품 보증·검수 정책'],
];

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
      {row(`전화 ${COMPANY.phone}`, () => void Linking.openURL(`tel:${COMPANY.phone}`), COMPANY.hours)}
      {row(`이메일 ${COMPANY.email}`, () => void Linking.openURL(`mailto:${COMPANY.email}`))}
      <Text variant="label" color="muted" style={styles.group}>
        약관 · 정책
      </Text>
      {POLICIES.map(([path, label]) =>
        row(label, () => void WebBrowser.openBrowserAsync(`${env.webUrl}${path}`)),
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
