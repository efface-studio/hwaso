import { ApiError } from '@shop/api-client';
import { containsProhibited, createReviewSchema } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormScroll } from '@/components/ui/form-scroll';
import { MediaImage } from '@/components/ui/media-image';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import i18n from '@/i18n';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { pickImages, uploadAll } from '@/lib/upload';
import { useTheme } from '@/theme';

const MAX_IMAGES = 5;
const errMsg = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : i18n.t('common:state.actionFailed');

/** 거래 후기: 별점 + 내용 + 사진(최대 5장). 작성 후 30일 안에는 수정·삭제할 수 있다 */
export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { t: tr } = useTranslation(['order', 'common']);
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
      const keys = (await uploadAll(assets)).map((i) => i.key);
      setImages((prev) => [...prev, ...keys].slice(0, MAX_IMAGES));
    } catch (e) {
      Alert.alert(tr('review.uploadFailed'), errMsg(e));
    } finally {
      setUploading(false);
    }
  };
  const submit = () => {
    const r = createReviewSchema.safeParse({ rating, comment, imageKeys: images });
    if (!r.success)
      return setError(
        r.error.issues[0]?.path[0] === 'comment' ? tr('review.commentMin') : tr('review.checkContent'),
      );
    if (containsProhibited(comment)) return setError(tr('common:validation.prohibited'));
    setError(null);
    save.mutate();
  };

  if (mine.isPending) return <Loading variant="text" />;
  const locked = !!existing && !existing.editable;

  return (
    <FormScroll style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: existing ? tr('review.myTitle') : tr('review.writeTitle') }} />
      <Text variant="label">{tr('review.question')}</Text>
      <View style={styles.stars} accessibilityLabel={tr('review.ratingA11y', { rating })}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={tr('review.starA11y', { count: n })}
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
        label={tr('review.label')}
        multiline
        maxLength={1000}
        editable={!locked}
        value={comment}
        onChangeText={setComment}
        style={{ minHeight: 140, textAlignVertical: 'top' }}
        placeholder={tr('review.placeholder')}
        error={error}
      />
      <Text variant="label">{tr('review.photos', { count: images.length, max: MAX_IMAGES })}</Text>
      <View style={styles.photos}>
        {images.map((key) => (
          <View key={key} style={[styles.photo, { backgroundColor: t.colors.surface2 }]}>
            <MediaImage mediaKey={key} displayWidth={72} style={StyleSheet.absoluteFill} contentFit="cover" />
            {!locked && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('review.removePhoto')}
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
          <Button
            title={tr('review.addPhoto')}
            variant="outline"
            loading={uploading}
            onPress={() => void addPhotos()}
          />
        )}
      </View>
      {locked ? (
        <Text variant="small" color="muted">
          {tr('review.locked')}
        </Text>
      ) : (
        <Button
          title={existing ? tr('review.update') : tr('review.submit')}
          size="lg"
          loading={save.isPending}
          disabled={uploading}
          onPress={submit}
        />
      )}
      {existing?.editable && (
        <Button
          title={tr('review.delete')}
          variant="ghost"
          loading={remove.isPending}
          onPress={() =>
            Alert.alert(tr('review.deleteTitle'), undefined, [
              { text: tr('common:action.cancel'), style: 'cancel' },
              { text: tr('common:action.delete'), style: 'destructive', onPress: () => remove.mutate() },
            ])
          }
        />
      )}
    </FormScroll>
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
