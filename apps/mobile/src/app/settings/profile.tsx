import { ApiError } from '@shop/api-client';
import { nicknameSchema } from '@shop/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { actionSheet } from '@/lib/action-sheet';
import { api } from '@/lib/api';
import { pickImages, uploadAsset } from '@/lib/upload';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '저장하지 못했어요.');

/** 프로필: 사진(촬영·앨범·삭제)·닉네임·소개·거래 지역 */
export default function ProfileScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [nickname, setNickname] = useState(user?.profile.nickname ?? '');
  const [bio, setBio] = useState(user?.profile.bio ?? '');
  const [region, setRegion] = useState(user?.profile.region ?? '');
  const [avatarKey, setAvatarKey] = useState(user?.profile.avatarKey ?? null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  const pick = async (source: 'camera' | 'library') => {
    const [asset] = await pickImages(source, 1);
    if (!asset) return;
    setUploading(true);
    try {
      setAvatarKey((await uploadAsset(asset)).key);
    } catch (e) {
      Alert.alert('사진을 올리지 못했어요', errMsg(e));
    } finally {
      setUploading(false);
    }
  };
  const photoMenu = () =>
    actionSheet('프로필 사진', [
      { label: '사진 찍기', onPress: () => void pick('camera') },
      { label: '앨범에서 선택', onPress: () => void pick('library') },
      ...(avatarKey ? [{ label: '사진 삭제', destructive: true, onPress: () => setAvatarKey(null) }] : []),
    ]);
  const save = async () => {
    const n = nicknameSchema.safeParse(nickname);
    if (!n.success) return setError(n.error.issues[0]!.message);
    setError(null);
    setPending(true);
    try {
      setUser(await api.auth.updateProfile({ nickname: n.data, bio, region: region || null, avatarKey }));
      Alert.alert('프로필을 저장했어요');
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
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: '프로필' }} />
      <View style={styles.avatarRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="프로필 사진 변경" onPress={photoMenu}>
          <Avatar avatarKey={avatarKey} name={nickname || user.profile.nickname} size={88} />
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Button
            title={uploading ? '올리는 중…' : '사진 변경'}
            variant="outline"
            size="sm"
            onPress={photoMenu}
          />
          <Text variant="caption" color="muted">
            JPG·PNG·HEIC · 20MB 이하
          </Text>
        </View>
      </View>
      <Field label="닉네임" maxLength={20} value={nickname} onChangeText={setNickname} error={error} />
      <Field
        label="소개"
        multiline
        maxLength={300}
        value={bio}
        onChangeText={setBio}
        hint="판매자 프로필에 표시돼요."
        style={{ minHeight: 100, textAlignVertical: 'top', paddingTop: 10 }}
      />
      <Field
        label="거래 지역"
        maxLength={50}
        value={region}
        onChangeText={setRegion}
        placeholder="예) 서울 종로구"
      />
      <Button title="저장" size="lg" loading={pending} disabled={uploading} onPress={() => void save()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
