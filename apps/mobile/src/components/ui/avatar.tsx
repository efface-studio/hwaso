import { Image } from 'expo-image';
import { View } from 'react-native';
import { mediaUrl } from '@/lib/media';
import { useTheme } from '@/theme';
import { Text } from './text';

export function Avatar({
  avatarKey,
  name,
  size = 40,
}: {
  avatarKey: string | null;
  name: string;
  size?: number;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityLabel={`${name} 프로필 사진`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: t.colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {avatarKey ? (
        <Image source={mediaUrl(avatarKey, 400)} style={{ width: size, height: size }} />
      ) : (
        <Text variant={size >= 56 ? 'h2' : 'label'} color="muted">
          {name.slice(0, 1)}
        </Text>
      )}
    </View>
  );
}
