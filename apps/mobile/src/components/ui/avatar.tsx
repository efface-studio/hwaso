import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { MediaImage } from './media-image';
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
  const { t: tr } = useTranslation('common');
  return (
    <View
      accessibilityLabel={tr('ui.profilePhoto', { name })}
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
        <MediaImage mediaKey={avatarKey} displayWidth={size} style={{ width: size, height: size }} />
      ) : (
        <Text variant={size >= 56 ? 'h2' : 'label'} color="muted">
          {name.slice(0, 1)}
        </Text>
      )}
    </View>
  );
}
