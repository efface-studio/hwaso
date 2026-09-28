import { ApiError } from '@shop/api-client';
import { sellerRegisterSchema } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/inputs';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const BANKS = [
  'KB국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  'NH농협은행',
  'IBK기업은행',
  '카카오뱅크',
  '토스뱅크',
  '케이뱅크',
  'SC제일은행',
  '부산은행',
  '대구은행',
  '우체국',
].map((b) => ({ value: b, label: b }));

/** 판매자 등록 ↔ 정산 정보 조회·수정 (계좌번호는 서버가 암호화해 보관) */
export default function SellerRegisterScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.auth.providers,
    staleTime: 600_000,
  });
  const info = useQuery({
    queryKey: ['seller-info'],
    queryFn: api.auth.seller,
    enabled: !!user?.isSeller,
    retry: false,
  });
  const [bankName, setBankName] = useState<string>();
  const [bankAccount, setBankAccount] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!info.data) return;
    setBankName(info.data.bankName);
    setAccountHolder(info.data.accountHolder);
    setBusinessName(info.data.businessName ?? '');
  }, [info.data]);

  if (!user)
    return (
      <Empty title="로그인이 필요해요" action={{ title: '로그인', onPress: () => router.push('/login') }} />
    );
  if (providers.isPending || (user.isSeller && info.isPending)) return <Loading />;
  const needsIdentity = !!providers.data?.identity && !user.identityVerified;

  const submit = async () => {
    setError(null);
    const body = {
      bankName: bankName ?? '',
      bankAccount,
      accountHolder,
      businessName: businessName || undefined,
    };
    setPending(true);
    try {
      if (user.isSeller) {
        await api.auth.updateSeller({ ...body, bankAccount: bankAccount || undefined });
        await qc.invalidateQueries({ queryKey: ['seller-info'] });
        setBankAccount('');
        Alert.alert('정산 정보를 저장했어요');
      } else {
        const parsed = sellerRegisterSchema.safeParse(body);
        if (!parsed.success) throw new ApiError(400, 'VALIDATION_FAILED', parsed.error.issues[0]!.message);
        setUser(await api.auth.registerSeller(parsed.data));
        Alert.alert('판매자 등록을 마쳤어요', '이제 작품을 등록할 수 있어요.');
        router.replace('/sell/new');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '잠시 문제가 발생했어요. 다시 시도해주세요.');
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
      <Stack.Screen options={{ title: user.isSeller ? '판매자 정보' : '판매자 등록' }} />
      <Text color="muted">판매 대금을 받을 계좌를 등록해주세요. 계좌번호는 암호화되어 보관됩니다.</Text>
      {needsIdentity ? (
        <Empty
          title="본인인증이 필요해요"
          description="판매 대금 정산을 위해 먼저 마이 › 계정 설정에서 휴대폰 본인인증을 해주세요."
          action={{ title: '마이로 가기', onPress: () => router.push('/my') }}
        />
      ) : (
        <>
          {info.data && (
            <Text variant="small" color="muted">
              등록된 계좌: {info.data.bankName} {info.data.bankAccountMasked}
              {info.data.verified ? ' · 인증 판매자' : ''}
            </Text>
          )}
          <SelectField
            label="은행"
            value={bankName}
            onChange={setBankName}
            options={BANKS}
            placeholder="은행 선택"
          />
          <Field
            label="계좌번호"
            keyboardType="number-pad"
            autoComplete="off"
            value={bankAccount}
            onChangeText={(v) => setBankAccount(v.replace(/[^\d-]/g, ''))}
            hint={user.isSeller ? '바꿀 때만 입력하세요.' : '숫자만 입력해주세요.'}
          />
          <Field label="예금주" value={accountHolder} onChangeText={setAccountHolder} maxLength={50} />
          <Field
            label="상호 (선택)"
            value={businessName}
            onChangeText={setBusinessName}
            maxLength={100}
            hint="갤러리·사업자라면 입력해주세요."
          />
          {error && (
            <Text variant="small" color="destructive" accessibilityLiveRegion="assertive">
              {error}
            </Text>
          )}
          <Button
            title={user.isSeller ? '저장' : '판매자 등록'}
            size="lg"
            loading={pending}
            onPress={() => void submit()}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
});
