import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { deviceLanguage, LANGUAGE_NAME, LANGUAGES } from '@/i18n';
import { selectionHaptic } from '@/lib/haptics';
import { usePrefs, type LanguagePreference } from '@/stores/prefs';
import { useTheme } from '@/theme';

/** 언어 선택: 기기 언어 따르기 + 지원 언어 (이름은 각 언어로 적는다) */
export default function LanguageScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const language = usePrefs((s) => s.language);
  const setLanguage = usePrefs((s) => s.setLanguage);
  const options: { value: LanguagePreference; label: string; hint?: string }[] = [
    {
      value: 'system',
      label: tr('language.system'),
      hint: `${tr('language.systemHint')} · ${LANGUAGE_NAME[deviceLanguage()]}`,
    },
    ...LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAME[l] })),
  ];
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
    >
      <Stack.Screen options={{ title: tr('language.title') }} />
      <View accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = language === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                selectionHaptic();
                setLanguage(o.value);
              }}
              style={({ pressed }) => [
                styles.row,
                { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 },
                pressed && { backgroundColor: t.colors.surface2 },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text>{o.label}</Text>
                {o.hint && (
                  <Text variant="caption" color="muted">
                    {o.hint}
                  </Text>
                )}
              </View>
              {on && <Icon ios="checkmark" android="check" color="primary" size={18} />}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 48 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
