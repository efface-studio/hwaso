import { ApiError } from '@shop/api-client';
import { sellerRegisterSchema } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet } from 'react-native';
import { BankField } from '@/components/bank-picker';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormScroll } from '@/components/ui/form-scroll';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useScreenGuard } from '@/lib/screen-guard';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';
import { schemaMessage } from '@/i18n/validation';

/** 판매자 등록 ↔ 정산 정보 조회·수정 (계좌번호는 서버가 암호화해 보관) */
export default function SellerRegisterScreen() {
  // 정산 계좌가 보이는 화면 — 캡처·화면 녹화 차단
  useScreenGuard();
  const t = useTheme();
  const { t: tr } = useTranslation(['sell', 'common']);
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
      <Empty
        kind="lock"
        title={tr('gate.loginRequired')}
        action={{ title: tr('gate.login'), onPress: () => router.push('/login') }}
      />
    );
  if (providers.isPending || (user.isSeller && info.isPending)) return <Loading variant="text" />;
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
        Alert.alert(tr('register.saved'));
      } else {
        const parsed = sellerRegisterSchema.safeParse(body);
        if (!parsed.success)
          throw new ApiError(400, 'VALIDATION_FAILED', schemaMessage(parsed.error.issues[0]!.message));
        setUser(await api.auth.registerSeller(parsed.data));
        Alert.alert(tr('register.done'), tr('register.doneMessage'));
        router.replace('/sell/new');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr('error.generic'));
    } finally {
      setPending(false);
    }
  };

  return (
    <FormScroll style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen
        options={{ title: user.isSeller ? tr('register.titleSeller') : tr('common:screen.sellerRegister') }}
      />
      <Text color="muted">{tr('register.intro')}</Text>
      {needsIdentity ? (
        <Empty
          kind="lock"
          title={tr('register.identityTitle')}
          description={tr('register.identityDescription')}
          action={{ title: tr('register.identityAction'), onPress: () => router.push('/settings/identity') }}
        />
      ) : (
        <>
          {info.data && (
            <Text variant="small" color="muted">
              {tr('register.current', { bank: info.data.bankName, account: info.data.bankAccountMasked })}
              {info.data.verified ? tr('register.verified') : ''}
            </Text>
          )}
          <BankField label={tr('register.bank')} value={bankName} onChange={setBankName} />
          <Field
            label={tr('register.accountNumber')}
            keyboardType="number-pad"
            autoComplete="off"
            value={bankAccount}
            onChangeText={(v) => setBankAccount(v.replace(/[^\d-]/g, ''))}
            hint={user.isSeller ? tr('register.accountHintEdit') : tr('register.accountHint')}
          />
          <Field
            label={tr('register.holder')}
            value={accountHolder}
            onChangeText={setAccountHolder}
            maxLength={50}
          />
          <Field
            label={tr('register.business')}
            value={businessName}
            onChangeText={setBusinessName}
            maxLength={100}
            hint={tr('register.businessHint')}
          />
          {error && (
            <Text variant="small" color="destructive" accessibilityLiveRegion="assertive">
              {error}
            </Text>
          )}
          <Button
            title={user.isSeller ? tr('common:action.save') : tr('register.submit')}
            size="lg"
            loading={pending}
            onPress={() => void submit()}
          />
        </>
      )}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
});
