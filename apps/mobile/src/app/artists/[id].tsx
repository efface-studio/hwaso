import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ProductGrid } from '@/components/product/product-grid';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';

export default function ArtistScreen() {
  const { t: tr } = useTranslation('home');
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['artist', id], queryFn: () => api.market.artist(id) });
  const a = q.data;
  const years = a && (a.birthYear || a.deathYear) ? `${a.birthYear ?? '?'} – ${a.deathYear ?? ''}` : null;
  return (
    <>
      <Stack.Screen options={{ title: a?.name ?? '' }} />
      <ProductGrid
        params={{ artist: id, sort: 'latest' }}
        emptyTitle={tr('artist.empty')}
        header={
          a ? (
            <View style={{ padding: 16, gap: 4 }}>
              <Text variant="h1">{a.name}</Text>
              {(a.nameEn || years) && (
                <Text color="muted">{[a.nameEn, years].filter(Boolean).join(' · ')}</Text>
              )}
              {a.bio ? <Text style={{ marginTop: 8 }}>{a.bio}</Text> : null}
            </View>
          ) : undefined
        }
      />
    </>
  );
}
