import { Image } from 'expo-image';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { PixelRatio, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { mediaUrl } from '@/lib/media';
import { TAB_BAR_SCALE, useTheme } from '@/theme';

/** 원형 프로필 크기 (pt) — 태블릿은 탭 바 배율만큼 크게 */
const AVATAR = Math.round(24 * TAB_BAR_SCALE);
/** 캡처할 아이콘 크기 (pt): 원형 프로필 + 아래 글자 */
const W = Math.round(36 * TAB_BAR_SCALE);
const H = Math.round(42 * TAB_BAR_SCALE);

type Icon = { default: ImageSourcePropType; selected: ImageSourcePropType };

/**
 * 마이 탭 아이콘: 원형 프로필 사진(없으면 이니셜) 아래에 "마이" 글자.
 * iOS 26 에서 오른쪽에 분리된 탭(search 역할)은 시스템이 글자를 그리지 않아 글자까지 이미지에 담는다.
 * 탭 아이콘은 UIImage 를 그대로 그려 모양을 자를 수 없으므로, 화면 뒤에 그린 뒤 투명 PNG 로 캡처해 넘긴다
 * (기본·선택 두 장 — 선택되면 테두리와 글자가 브랜드 색). 캡처 전에는 null (기본 아이콘을 쓴다).
 */
export function useMyTabIcon({
  avatarKey,
  name,
  label,
}: {
  avatarKey: string | null;
  name: string;
  label: string;
}) {
  const t = useTheme();
  // 사진·이름·테마·글자 크기가 바뀌면 다시 캡처한다
  const signature = [avatarKey, name.slice(0, 1), label, t.scheme, t.senior].join('|');
  const [icon, setIcon] = useState<{ signature: string; icon: Icon } | null>(null);
  const capture = (
    <MyTabCapture
      key={signature}
      avatarKey={avatarKey}
      initial={name.slice(0, 1)}
      label={label}
      onCapture={(i) => setIcon({ signature, icon: i })}
    />
  );
  return { icon: icon?.signature === signature ? icon.icon : null, capture };
}

function MyTabCapture({
  avatarKey,
  initial,
  label,
  onCapture,
}: {
  avatarKey: string | null;
  initial: string;
  label: string;
  onCapture: (icon: Icon) => void;
}) {
  const t = useTheme();
  const normalRef = useRef<View>(null);
  const selectedRef = useRef<View>(null);
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;
  // 사진은 두 장(기본·선택) 모두 그려진 뒤, 이니셜은 배치된 뒤 캡처한다
  const [shown, setShown] = useState(0);
  const [laidOut, setLaidOut] = useState(false);
  const ready = laidOut && (!avatarKey || shown >= 2);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (!normalRef.current || !selectedRef.current) return;
      const opts = { format: 'png', result: 'tmpfile' } as const;
      Promise.all([captureRef(normalRef, opts), captureRef(selectedRef, opts)])
        .then(([n, s]) => {
          if (cancelled) return;
          onCaptureRef.current({
            // 캡처는 기기 배율(@2x·@3x)로 저장된다 — 배율을 알려야 1배로 줄이지 않고 선명하게 그린다
            default: { uri: n, width: W, height: H, scale: PixelRatio.get() },
            selected: { uri: s, width: W, height: H, scale: PixelRatio.get() },
          });
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [ready]);

  const render = (selected: boolean, ref: RefObject<View | null>) => (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="none"
      style={styles.capture}
      onLayout={selected ? () => setLaidOut(true) : undefined}
    >
      {/* 캡처(view-shot)는 테두리 있는 뷰의 overflow 마스크를 반영하지 않아, 사진 자체를 둥글게 그리고
          선택 테두리는 위에 겹친다 */}
      <View style={styles.avatar}>
        {avatarKey ? (
          <Image
            source={mediaUrl(avatarKey, 400)}
            style={styles.round}
            contentFit="cover"
            onDisplay={() => setShown((n) => n + 1)}
          />
        ) : (
          <View style={[styles.round, styles.center, { backgroundColor: t.colors.surface2 }]}>
            <Text style={[styles.initial, { color: t.colors.muted }]}>{initial}</Text>
          </View>
        )}
        {selected && <View style={[styles.round, styles.ring, { borderColor: t.colors.primary }]} />}
      </View>
      <Text
        style={[
          styles.label,
          {
            color: selected ? t.colors.primary : t.colors.foreground,
            fontSize: (t.senior ? 13 : 11) * TAB_BAR_SCALE,
            lineHeight: (t.senior ? 16 : 14) * TAB_BAR_SCALE,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <>
      {render(false, normalRef)}
      {render(true, selectedRef)}
    </>
  );
}

const styles = StyleSheet.create({
  // 탭 화면 아래(먼저 그려지는 형제)에 두어 사용자에게는 보이지 않는다
  capture: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: W,
    height: H,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
  },
  avatar: { width: AVATAR, height: AVATAR },
  round: { position: 'absolute', top: 0, left: 0, width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  center: { alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1.5 },
  initial: { fontSize: 11 * TAB_BAR_SCALE, fontWeight: '600' },
  // 다른 탭 글자(시스템 탭 바 라벨)와 같은 굵기·크기
  label: { fontWeight: '500' },
});
