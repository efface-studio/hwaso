import { ApiError } from '@shop/api-client';
import { containsProhibited, nicknameSchema } from '@shop/shared';
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import i18n from '@/i18n';
import { AvatarCropper } from '@/components/avatar-cropper';
import { Avatar } from '@/components/ui/avatar';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { actionSheet } from '@/lib/action-sheet';
import { api } from '@/lib/api';
import { pickImageFile, pickImages, uploadAsset, type LocalImage } from '@/lib/upload';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';
import { nicknameIssueMessage } from '@/components/auth/validation';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : i18n.t('common:state.saveFailed'));

const AVATAR_SIZE = 104;

/**
 * 프로필: 사진(촬영·앨범·파일·삭제 → 원형으로 확대·이동해 자르기)·닉네임·소개·거래 지역.
 * 저장은 헤더 오른쪽 버튼
 */
export default function ProfileScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [nickname, setNickname] = useState(user?.profile.nickname ?? '');
  const [bio, setBio] = useState(user?.profile.bio ?? '');
  const [region, setRegion] = useState(user?.profile.region ?? '');
  const [avatarKey, setAvatarKey] = useState(user?.profile.avatarKey ?? null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 소개·지역에 쓸 수 없는 표현이 있을 때 (닉네임·서버 오류는 error) */
  const [fieldError, setFieldError] = useState<{ bio?: string; region?: string }>({});
  /** 고른 사진 — 자르기 화면에서 영역을 맞춘 뒤 올린다 */
  const [cropping, setCropping] = useState<LocalImage | null>(null);
  const cancelCrop = useCallback(() => setCropping(null), []);
  if (!user) return null;

  const dirty =
    nickname !== user.profile.nickname ||
    bio !== user.profile.bio ||
    region !== (user.profile.region ?? '') ||
    avatarKey !== user.profile.avatarKey;

  const pick = async (source: 'camera' | 'library' | 'file') => {
    const image = source === 'file' ? await pickImageFile() : (await pickImages(source, 1))[0];
    if (image) setCropping(image);
  };
  const upload = async (image: LocalImage) => {
    setCropping(null);
    setUploading(true);
    try {
      setAvatarKey((await uploadAsset(image)).key);
    } catch (e) {
      Alert.alert(tr('profile.uploadFailed'), errMsg(e));
    } finally {
      setUploading(false);
    }
  };
  const photoMenu = () =>
    actionSheet(tr('profile.photo.title'), [
      { label: tr('profile.photo.camera'), onPress: () => void pick('camera') },
      { label: tr('profile.photo.library'), onPress: () => void pick('library') },
      { label: tr('profile.photo.file'), onPress: () => void pick('file') },
      ...(avatarKey
        ? [{ label: tr('profile.photo.remove'), destructive: true, onPress: () => setAvatarKey(null) }]
        : []),
    ]);
  const save = async () => {
    const n = nicknameSchema.safeParse(nickname);
    const prohibited = tr('common:validation.prohibited');
    const fields = {
      bio: containsProhibited(bio) ? prohibited : undefined,
      region: containsProhibited(region) ? prohibited : undefined,
    };
    setFieldError(fields);
    if (!n.success) return setError(nicknameIssueMessage(n.error.issues[0]!));
    if (containsProhibited(n.data)) return setError(prohibited);
    setError(null);
    if (fields.bio || fields.region) return;
    setPending(true);
    try {
      setUser(await api.auth.updateProfile({ nickname: n.data, bio, region: region || null, avatarKey }));
      router.back();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <Stack.Screen
        options={{
          title: tr('profile.title'),
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: pending ? tr('profile.saving') : tr('common:action.save'),
              variant: 'prominent',
              tintColor: t.colors.primary,
              disabled: !dirty || pending || uploading,
              onPress: () => void save(),
            },
          ],
        }}
      />

      <View style={styles.avatarSection}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('profile.photo.a11yLabel')}
          accessibilityHint={tr('profile.photo.a11yHint')}
          onPress={photoMenu}
          disabled={uploading}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Avatar avatarKey={avatarKey} name={nickname || user.profile.nickname} size={AVATAR_SIZE} />
          {uploading && (
            <View style={[styles.uploading, { backgroundColor: '#00000066' }]}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          <View
            style={[styles.badge, { backgroundColor: t.colors.primary, borderColor: t.colors.background }]}
          >
            <Icon ios="camera.fill" android="photo_camera" color="primaryForeground" size={15} />
          </View>
        </Pressable>
        {/* 소셜 가입 때 서버가 만든 임시 주소는 보이지 않는다 */}
        {!user.emailMissing && (
          <Text variant="small" color="muted">
            {user.email}
          </Text>
        )}
      </View>

      <View style={styles.form}>
        <Field
          label={tr('profile.nickname')}
          counter
          maxLength={20}
          value={nickname}
          onChangeText={setNickname}
          error={error}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />
        <Field
          label={tr('profile.bio')}
          counter
          multiline
          maxLength={300}
          value={bio}
          onChangeText={setBio}
          placeholder={tr('profile.bioPlaceholder')}
          hint={tr('profile.bioHint')}
          error={fieldError.bio}
          style={styles.bio}
        />
        <Field
          label={tr('profile.region')}
          maxLength={50}
          value={region}
          onChangeText={setRegion}
          placeholder={tr('profile.regionPlaceholder')}
          error={fieldError.region}
          returnKeyType="done"
        />
      </View>
      <AvatarCropper image={cropping} onCancel={cancelCrop} onDone={(img) => void upload(img)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 32 },
  avatarSection: { alignItems: 'center', gap: 12 },
  uploading: {
    ...StyleSheet.absoluteFill,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { gap: 20 },
  bio: { minHeight: 112, textAlignVertical: 'top', paddingTop: 12, paddingBottom: 12 },
});
