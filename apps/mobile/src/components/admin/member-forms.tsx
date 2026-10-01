import { ApiError } from '@shop/api-client';
import {
  ADMIN_CREATABLE_ROLES,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  type AdminUpdateUserInput,
  type AdminUserDetail,
  type Role,
} from '@shop/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { RadioList } from '@/components/ui/radio';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { ROLE_LABEL } from '@/lib/admin';
import { api } from '@/lib/api';
import { copySensitive } from '@/lib/clipboard';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

type Errors = Record<string, string>;

/** 조치 후 다시 불러올 목록·상세 */
const INVALIDATE = ['users', 'user', 'sellers'];

/** zod 결과 → 칸별 첫 오류 */
const issuesToErrors = (issues: { path: PropertyKey[]; message: string }[]): Errors => {
  const out: Errors = {};
  for (const i of issues) out[String(i.path[0] ?? '_')] ??= i.message;
  return out;
};

/** 서버가 준 칸별 오류(details.fields)가 있으면 칸 아래에, 없으면 알림으로 */
function serverErrors(e: unknown, setErrors: (v: Errors) => void) {
  const fields = e instanceof ApiError ? (e.details?.fields as Errors | undefined) : undefined;
  if (fields && Object.keys(fields).length) return setErrors(fields);
  Alert.alert(e instanceof ApiError ? e.message : '처리하지 못했습니다.');
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const k of INVALIDATE) void qc.invalidateQueries({ queryKey: ['admin', k] });
  };
}

function SwitchRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <View style={[styles.switchRow, { minHeight: t.touch }]}>
        <Text style={{ flex: 1 }}>{label}</Text>
        <Switch
          style={{ alignSelf: 'center' }}
          value={value}
          onValueChange={onChange}
          trackColor={{ true: t.colors.primary }}
          accessibilityLabel={label}
        />
      </View>
      {hint && (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      )}
    </View>
  );
}

/** 입력 묶음 제목 */
function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="label" color="muted" accessibilityRole="header">
      {children}
    </Text>
  );
}

/**
 * 계정 생성 시트: 이메일·닉네임·역할·비밀번호(자동 생성 또는 직접). 인증 메일 없이 인증 완료로 만들고,
 * 첫 로그인 때 약관 동의 화면을 거친다. 자동 생성한 임시 비밀번호는 만든 직후 한 번만 보여준다.
 */
export function CreateMemberSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const me = useAuthStore((s) => s.user);
  const invalidate = useInvalidate();
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [generate, setGenerate] = useState(true);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<{ id: string; email: string; password: string } | null>(null);
  // 관리자·최고 관리자는 최고 관리자만 만들 수 있다 (서버가 같은 규칙으로 다시 검사)
  const roles: Role[] = me?.role === 'SUPER_ADMIN' ? [...ADMIN_CREATABLE_ROLES, 'SUPER_ADMIN'] : ['USER'];

  const create = useMutation({
    mutationFn: api.admin.createUser,
    onSuccess: (r) => {
      invalidate();
      if (r.temporaryPassword) setDone({ id: r.user.id, email: r.user.email, password: r.temporaryPassword });
      else {
        Alert.alert('계정을 만들었어요');
        onCreated(r.user.id);
      }
    },
    onError: (e) => serverErrors(e, setErrors),
  });

  const submit = () => {
    const r = adminCreateUserSchema.safeParse({
      email,
      nickname,
      role,
      ...(generate ? {} : { password }),
      ...(reason.trim() ? { reason } : {}),
    });
    if (!r.success) return setErrors(issuesToErrors(r.error.issues));
    setErrors({});
    create.mutate(r.data);
  };

  if (done)
    return (
      <Sheet title="계정을 만들었어요" onClose={() => onCreated(done.id)}>
        <Text color="muted">
          {done.email} 계정의 임시 비밀번호예요. 이 화면을 닫으면 다시 볼 수 없으니 회원에게 안전하게
          전달해주세요.
        </Text>
        <View style={styles.secret}>
          <Text
            variant="h2"
            selectable
            style={styles.mono}
            accessibilityLabel={`임시 비밀번호 ${done.password.split('').join(' ')}`}
          >
            {done.password}
          </Text>
        </View>
        <Button
          title="복사"
          variant="outline"
          block
          onPress={() =>
            void copySensitive(done.password).then(() =>
              Alert.alert('복사했어요', '2분 뒤 클립보드에서 지워져요.'),
            )
          }
        />
        <Button title="확인" block onPress={() => onCreated(done.id)} />
      </Sheet>
    );

  return (
    <Sheet title="계정 생성" onClose={onClose}>
      <Text variant="small" color="muted">
        인증 메일 없이 이메일 인증 완료로 만들어요. 첫 로그인 때 약관 동의 화면이 나와요.
      </Text>
      <View style={styles.section}>
        <SectionTitle>계정</SectionTitle>
        <Field
          label="이메일"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          maxLength={254}
        />
        <Field
          label="닉네임"
          value={nickname}
          onChangeText={setNickname}
          error={errors.nickname}
          hint="한글·영문·숫자·_ . 2~20자"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
      </View>
      {roles.length > 1 && (
        <View style={styles.section}>
          <SectionTitle>역할</SectionTitle>
          <RadioList
            label="역할"
            value={role}
            onChange={setRole}
            options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          />
          {errors.role && (
            <Text variant="caption" color="destructive">
              {errors.role}
            </Text>
          )}
        </View>
      )}
      <View style={styles.section}>
        <SectionTitle>비밀번호</SectionTitle>
        <SwitchRow
          label="임시 비밀번호 자동 생성"
          value={generate}
          onChange={setGenerate}
          hint={generate ? '만든 직후 한 번만 보여드려요.' : undefined}
        />
        {!generate && (
          <Field
            label="비밀번호"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            hint="영문·숫자 포함 8자 이상"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="off"
            textContentType="none"
            maxLength={72}
          />
        )}
      </View>
      <Field
        label="사유 (선택)"
        value={reason}
        onChangeText={setReason}
        error={errors.reason}
        hint="감사 로그에 남아요."
        maxLength={500}
      />
      <Button title="만들기" block loading={create.isPending} onPress={submit} />
    </Sheet>
  );
}

/** 회원 정보 수정 시트: 바뀐 칸만 보낸다. 역할·정지는 상세 화면의 관리 메뉴에서 */
export function EditMemberSheet({ u, onClose }: { u: AdminUserDetail; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [nickname, setNickname] = useState(u.nickname);
  const [email, setEmail] = useState(u.email);
  const [verified, setVerified] = useState(!!u.emailVerifiedAt);
  const [bio, setBio] = useState(u.profile.bio);
  const [region, setRegion] = useState(u.profile.region ?? '');
  const [businessName, setBusinessName] = useState(u.seller?.businessName ?? '');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const emailChanged = email.trim().toLowerCase() !== u.email;

  const save = useMutation({
    mutationFn: (b: AdminUpdateUserInput) => api.admin.updateUser(u.id, b),
    onSuccess: () => {
      invalidate();
      Alert.alert('회원 정보를 수정했어요');
      onClose();
    },
    onError: (e) => serverErrors(e, setErrors),
  });

  const submit = () => {
    const b: Record<string, unknown> = {};
    if (nickname.trim() !== u.nickname) b.nickname = nickname;
    if (emailChanged) b.email = email;
    // 주소를 바꾸면 인증 여부를 함께 보낸다 (안 보내면 서버가 인증 전으로 둔다)
    if (emailChanged || verified !== !!u.emailVerifiedAt) b.emailVerified = verified;
    if (bio.trim() !== u.profile.bio) b.bio = bio;
    if ((region.trim() || null) !== u.profile.region) b.region = region.trim() || null;
    if (u.seller && (businessName.trim() || null) !== u.seller.businessName)
      b.businessName = businessName.trim() || null;
    if (!Object.keys(b).length) return onClose();
    if (reason.trim()) b.reason = reason;
    const r = adminUpdateUserSchema.safeParse(b);
    if (!r.success) return setErrors(issuesToErrors(r.error.issues));
    setErrors({});
    save.mutate(r.data);
  };

  return (
    <Sheet title="정보 수정" onClose={onClose}>
      <View style={styles.section}>
        <SectionTitle>계정</SectionTitle>
        <Field
          label="닉네임"
          value={nickname}
          onChangeText={setNickname}
          error={errors.nickname}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        <Field
          label="이메일"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            // 새 주소는 기본으로 인증 전 — 관리자가 확인했으면 켠다
            if (v.trim().toLowerCase() !== u.email) setVerified(false);
            else setVerified(!!u.emailVerifiedAt);
          }}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          maxLength={254}
        />
        <SwitchRow
          label="이메일 인증 완료"
          value={verified}
          onChange={setVerified}
          hint={emailChanged ? '새 주소를 직접 확인했을 때만 켜주세요.' : undefined}
        />
      </View>
      <View style={styles.section}>
        <SectionTitle>프로필</SectionTitle>
        <Field
          label="소개"
          value={bio}
          onChangeText={setBio}
          error={errors.bio}
          multiline
          counter
          maxLength={300}
          style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }}
        />
        <Field label="지역" value={region} onChangeText={setRegion} error={errors.region} maxLength={50} />
        {u.seller && (
          <Field
            label="상호"
            value={businessName}
            onChangeText={setBusinessName}
            error={errors.businessName}
            maxLength={60}
          />
        )}
      </View>
      <Field
        label="사유 (선택)"
        value={reason}
        onChangeText={setReason}
        hint="감사 로그에 남아요."
        maxLength={500}
      />
      <Button title="저장" block loading={save.isPending} onPress={submit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14, marginTop: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  secret: { paddingVertical: 16, alignItems: 'center' },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 1 },
});
