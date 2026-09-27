'use client';

import { ApiError } from '@shop/api-client';
import { sellerRegisterSchema } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { useAuthProviders } from '@/components/auth/social-buttons';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/field';
import { Breadcrumb } from '@/components/ui/navigation';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { safeNext } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

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

/** 판매자 등록 ↔ 정산 정보 조회 ↔ 수정 */
function SellerForm() {
  const user = useAuthStore((s) => s.user)!;
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'), '/sell');
  const qc = useQueryClient();
  const providers = useAuthProviders();
  const info = useQuery({
    queryKey: ['seller-info'],
    queryFn: api.auth.seller,
    enabled: user.isSeller,
    retry: false,
  });
  const [bankName, setBankName] = useState<string>();
  const [bankAccount, setBankAccount] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (info.data) {
      setBankName(info.data.bankName);
      setAccountHolder(info.data.accountHolder);
      setBusinessName(info.data.businessName ?? '');
    }
  }, [info.data]);

  const needsIdentity = !!providers.data?.identity && !user.identityVerified;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
        toast.success('정산 정보를 저장했어요');
      } else {
        const parsed = sellerRegisterSchema.safeParse(body);
        if (!parsed.success) throw new ApiError(400, 'VALIDATION_FAILED', parsed.error.issues[0]!.message);
        setUser(await api.auth.registerSeller(parsed.data));
        toast.success('판매자 등록을 마쳤어요');
        router.replace(next);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page-x mx-auto max-w-xl py-6 md:py-10">
      <Breadcrumb
        items={[{ href: '/my', label: '마이' }, { label: user.isSeller ? '판매자 정보' : '판매자 등록' }]}
      />
      <h1 className="mt-4 text-h1">{user.isSeller ? '판매자 정보' : '판매자 등록'}</h1>
      <p className="mt-1 text-body text-muted">
        판매 대금을 받을 계좌를 등록해주세요. 계좌번호는 암호화되어 보관됩니다.
      </p>

      {needsIdentity ? (
        <Alert tone="warning" title="본인인증이 필요해요" className="mt-6">
          판매 대금 정산을 위해 먼저 본인인증을 해주세요.{' '}
          <Link
            href="/my/settings#identity"
            className="font-semibold text-foreground underline underline-offset-2"
          >
            본인인증 하러 가기
          </Link>
        </Alert>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          {error && <Alert tone="destructive">{error}</Alert>}
          {info.data && (
            <p className="flex items-center gap-2 text-small text-muted">
              등록된 계좌: {info.data.bankName} {info.data.bankAccountMasked}
              {info.data.verified && <Badge tone="primary">인증 판매자</Badge>}
            </p>
          )}
          <Field label="은행" required>
            {(p) => (
              <Select
                {...p}
                value={bankName}
                onValueChange={setBankName}
                options={BANKS}
                placeholder="은행 선택"
              />
            )}
          </Field>
          <Field
            label="계좌번호"
            required={!user.isSeller}
            hint={user.isSeller ? '바꿀 때만 입력하세요.' : '숫자만 입력해주세요.'}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                autoComplete="off"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value.replace(/[^\d-]/g, ''))}
              />
            )}
          </Field>
          <Field label="예금주" required>
            {(p) => <Input {...p} value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />}
          </Field>
          <Field label="상호 (선택)" hint="갤러리·사업자라면 입력해주세요.">
            {(p) => <Input {...p} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />}
          </Field>
          <Button type="submit" size="lg" block loading={pending}>
            {user.isSeller ? '저장' : '판매자 등록'}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function SellerPage() {
  return (
    <RequireAuth>
      <Suspense>
        <SellerForm />
      </Suspense>
    </RequireAuth>
  );
}
