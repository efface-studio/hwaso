import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { Button } from './button';
import { Text } from './text';

export function Loading() {
  const t = useTheme();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel="불러오는 중">
      <ActivityIndicator color={t.colors.muted} />
    </View>
  );
}

export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { title: string; onPress: () => void };
}) {
  return (
    <View style={styles.center}>
      <Text variant="bodyStrong" style={styles.text}>
        {title}
      </Text>
      {description && (
        <Text variant="small" color="muted" style={styles.text}>
          {description}
        </Text>
      )}
      {action && (
        <Button title={action.title} variant="outline" onPress={action.onPress} style={{ marginTop: 12 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 },
  text: { textAlign: 'center' },
});
