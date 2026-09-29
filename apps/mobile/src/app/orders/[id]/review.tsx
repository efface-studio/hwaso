import { ApiError } from '@shop/api-client';
import { createReviewSchema } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { goBack } from '@/lib/nav';
import { pickImages, uploadAsset } from '@/lib/upload';
import { useTheme } from '@/theme';

const MAX_IMAGES = 5;
const errMsg = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : '처리하지 못했어요.';

/** 거래 후기: 별점 + 내용 + 사진(최대 5장). 작성 후 30일 안에는 수정·삭제할 수 있다 */
export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ['review', id], queryFn: () => api.community.myReview(id) });
  const existing = mine.data;
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setRating(existing.rating);
    setComment(existing.comment);
    setImages(existing.images.map((i) => i.key));
  }, [existing]);

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['review', id] });
    void qc.invalidateQueries({ queryKey: ['order', id] });
    goBack();
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { rating, comment: comment.trim(), imageKeys: images };
      return existing ? api.community.updateReview(existing.id, body) : api.community.createReview(id, body);
    },
    onSuccess: done,
    onError: (e) => Alert.alert(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.community.deleteReview(existing!.id),
    onSuccess: done,
    onError: (e) => Alert.alert(errMsg(e)),
  });

  const addPhotos = async () => {
    const assets = await pickImages('library', MAX_IMAGES - images.length);
    if (!assets.length) return;
    setUploading(true);
    try {
      const keys = (await Promise.all(assets.map(uploadAsset))).map((i) => i.key);
      setImages((prev) => [...prev, ...keys].slice(0, MAX_IMAGES));
    } catch (e) {
      Alert.alert('사진을 올리지 못했어요', errMsg(e));
    } finally {
      setUploading(false);
    }
  };
  const submit = () => {
    const r = createReviewSchema.safeParse({ rating, comment, imageKeys: images });
    if (!r.success) return setError(r.error.issues[0]?.message ?? '내용을 확인해주세요.');
    setError(null);
    save.mutate();
  };

  if (mine.isPending) return <Loading variant="text" />;
  const locked = !!existing && !existing.editable;

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: existing ? '내 거래 후기' : '거래 후기 쓰기' }} />
      <Text variant="label">거래는 어떠셨나요?</Text>
      <View style={styles.stars} accessibilityLabel={`별점 ${rating}점`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${n}점`}
            accessibilityState={{ selected: n === rating }}
            disabled={locked}
            onPress={() => setRating(n)}
            hitSlop={6}
          >
            <Text
              style={{
                fontSize: 36,
                lineHeight: 44,
                color: n <= rating ? t.colors.warning : t.colors.border,
              }}
            >
              ★
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="후기"
        multiline
        maxLength={1000}
        editable={!locked}
        value={comment}
        onChangeText={setComment}
        style={{ minHeight: 140, textAlignVertical: 'top' }}
        placeholder="작품 상태, 포장, 응대는 어땠는지 알려주세요. (5자 이상)"
        error={error}
      />
      <Text variant="label">
        사진 ({images.length}/{MAX_IMAGES})
      </Text>
      <View style={styles.photos}>
        {images.map((key) => (
          <View key={key} style={[styles.photo, { backgroundColor: t.colors.surface2 }]}>
            <Image source={mediaUrl(key, 400)} style={StyleSheet.absoluteFill} contentFit="cover" />
            {!locked && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="사진 빼기"
                onPress={() => setImages((prev) => prev.filter((k) => k !== key))}
                style={[styles.remove, { backgroundColor: t.colors.overlay }]}
              >
                <Text variant="caption" style={{ color: '#fff' }}>
                  ✕
                </Text>
              </Pressable>
            )}
          </View>
        ))}
        {!locked && images.length < MAX_IMAGES && (
          <Button title="+ 사진" variant="outline" loading={uploading} onPress={() => void addPhotos()} />
        )}
      </View>
      {locked ? (
        <Text variant="small" color="muted">
          작성 후 30일이 지나 수정할 수 없어요.
        </Text>
      ) : (
        <Button
          title={existing ? '수정하기' : '후기 남기기'}
          size="lg"
          loading={save.isPending}
          disabled={uploading}
          onPress={submit}
        />
      )}
      {existing?.editable && (
        <Button
          title="후기 삭제"
          variant="ghost"
          loading={remove.isPending}
          onPress={() =>
            Alert.alert('후기를 삭제할까요?', undefined, [
              { text: '취소', style: 'cancel' },
              { text: '삭제', style: 'destructive', onPress: () => remove.mutate() },
            ])
          }
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  stars: { flexDirection: 'row', gap: 6 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  photo: { width: 72, height: 72, overflow: 'hidden', borderRadius: 4 },
  remove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
