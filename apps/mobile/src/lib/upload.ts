import type { UploadedImage } from '@shop/api-client';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Platform } from 'react-native';
import i18n from '@/i18n';
import { api } from './api';

/** 권한이 거절됐을 때 설정으로 안내 (다시 묻지 않는 OS 동작 대응) */
function denied(what: string) {
  Alert.alert(i18n.t('common:upload.permissionTitle', { what }), i18n.t('common:upload.permissionMessage'), [
    { text: i18n.t('common:action.cancel'), style: 'cancel' },
    { text: i18n.t('common:action.openSettings'), onPress: () => void Linking.openSettings() },
  ]);
}

/** 앨범에서 고르기 또는 촬영. 취소하면 빈 배열 */
export async function pickImages(
  source: 'library' | 'camera',
  max = 1,
): Promise<ImagePicker.ImagePickerAsset[]> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      denied(i18n.t('common:upload.camera'));
      return [];
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, exif: false });
    return r.canceled ? [] : r.assets;
  }
  // iOS 14+ / Android 13+ 는 시스템 사진 선택기를 써서 권한 없이도 고를 수 있다
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: max > 1,
    selectionLimit: max,
    quality: 0.85,
    exif: false,
    orderedSelection: true,
    // iOS: HEIC 등은 기기에서 JPEG 로 바꿔 받는다 — 서버의 HEIC 디코딩(장당 1~2초)은 웹 업로드용으로 남긴다
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  return r.canceled ? [] : r.assets;
}

/** 업로드할 이미지 (앨범·촬영 결과, 파일, 잘라낸 이미지). 크기는 앨범·촬영 결과처럼 알 때만 */
export type LocalImage = Pick<ImagePicker.ImagePickerAsset, 'uri' | 'fileName' | 'mimeType'> &
  Partial<Pick<ImagePicker.ImagePickerAsset, 'width' | 'height'>>;

/** 파일 앱에서 이미지 고르기. 취소하면 null */
export async function pickImageFile(): Promise<LocalImage | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
  const f = r.canceled ? undefined : r.assets[0];
  return f ? { uri: f.uri, fileName: f.name, mimeType: f.mimeType } : null;
}

/** 회전(EXIF 방향)을 적용한 이미지와 실제 픽셀 크기 — 자르기 좌표를 정확히 맞추기 위해 먼저 그린다 */
export async function normalizeImage(uri: string) {
  const ref = await ImageManipulator.manipulate(uri).renderAsync();
  return ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
}

/** 정사각형으로 잘라 size 로 줄인 JPEG */
export async function cropSquare(
  uri: string,
  rect: { originX: number; originY: number; width: number; height: number },
  size: number,
): Promise<LocalImage> {
  const ref = await ImageManipulator.manipulate(uri)
    .crop(rect)
    .resize({ width: size, height: size })
    .renderAsync();
  const r = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return { uri: r.uri, fileName: `avatar-${Date.now()}.jpg`, mimeType: 'image/jpeg' };
}

/** 업로드 전 긴 변 상한 — 서버 파생본 최대 폭(1600)보다 넉넉하고, 원본(12~48MP)보다 훨씬 가볍다 */
const UPLOAD_MAX_EDGE = 2400;

/**
 * 긴 변이 UPLOAD_MAX_EDGE 보다 크면 줄여 JPEG 로 다시 저장한다 (원본 3~10MB → 보통 1MB 안팎).
 * 이미 작으면(잘라 낸 프로필 사진 등) 그대로 둔다. 실패하면 원본을 그대로 올린다.
 * 원본은 한 번만 디코딩한다 — 12~48MP 사진은 디코딩 한 번에 수백 ms·수백 MB 라, 세 장을 함께 올릴 때 특히 크다.
 */
async function shrinkForUpload(asset: LocalImage): Promise<LocalImage> {
  if (Platform.OS === 'web') return asset;
  // 앨범·촬영 결과는 크기를 알려 준다 — 작으면 디코딩하지 않고 그대로 올린다
  if (asset.width && asset.height && Math.max(asset.width, asset.height) <= UPLOAD_MAX_EDGE) return asset;
  // 큰 비트맵(원본·작업 중 이미지)은 GC 를 기다리지 않고 끝나는 대로 놓는다
  const held: { release(): void }[] = [];
  try {
    const load = ImageManipulator.manipulate(asset.uri);
    held.push(load);
    const image = await load.renderAsync();
    held.push(image);
    const long = Math.max(image.width, image.height);
    if (long <= UPLOAD_MAX_EDGE) return asset;
    const scale = UPLOAD_MAX_EDGE / long;
    // 방금 디코딩한(방향까지 바로잡은) 이미지를 그대로 줄인다 — 파일을 다시 읽어 디코딩하지 않는다
    const shrink = ImageManipulator.manipulate(image).resize({
      width: Math.round(image.width * scale),
      height: Math.round(image.height * scale),
    });
    held.push(shrink);
    const resized = await shrink.renderAsync();
    held.push(resized);
    const out = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    return { uri: out.uri, fileName: `photo-${Date.now()}.jpg`, mimeType: 'image/jpeg' };
  } catch {
    return asset;
  } finally {
    for (const h of held) h.release();
  }
}

/** 서버 업로드 — 앱에서 먼저 줄이고, 서버가 크기 조정·EXIF(위치 정보) 제거·파생 이미지 생성을 한다 */
export async function uploadAsset(original: LocalImage): Promise<UploadedImage> {
  const asset = await shrinkForUpload(original);
  const form = new FormData();
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  if (Platform.OS === 'web') {
    form.append('file', await (await fetch(asset.uri)).blob(), name);
  } else {
    form.append('file', { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
  }
  return api.market.uploadImageForm(form);
}

/**
 * 여러 장을 동시에 limit 장씩 올린다. 결과는 고른 순서대로(실패한 자리는 null), 한 장 끝날 때마다 onEach.
 */
export async function uploadAssets(
  assets: LocalImage[],
  { limit = 3, onEach }: { limit?: number; onEach?: () => void } = {},
): Promise<(UploadedImage | null)[]> {
  const out: (UploadedImage | null)[] = new Array(assets.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < assets.length) {
      const i = next++;
      out[i] = await uploadAsset(assets[i]!).catch(() => null);
      onEach?.();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, assets.length) }, worker));
  return out;
}

/**
 * 모두 올려야 하는 경우(채팅 사진 묶음·후기 사진): 동시에 limit 장씩, 고른 순서대로. 한 장이라도 실패하면 그 오류로 끝난다.
 * 한꺼번에 올리면 원본 디코딩(장당 수십~수백 MB)이 겹쳐 메모리 경고로 앱이 종료될 수 있다.
 */
export async function uploadAll(assets: LocalImage[], limit = 3): Promise<UploadedImage[]> {
  const out: UploadedImage[] = [];
  let next = 0;
  const worker = async () => {
    while (next < assets.length) {
      const i = next++;
      out[i] = await uploadAsset(assets[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, assets.length) }, worker));
  return out;
}
