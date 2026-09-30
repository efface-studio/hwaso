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
  });
  return r.canceled ? [] : r.assets;
}

/** 업로드할 이미지 (앨범·촬영 결과, 파일, 잘라낸 이미지) */
export type LocalImage = Pick<ImagePicker.ImagePickerAsset, 'uri' | 'fileName' | 'mimeType'>;

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

/** 서버 업로드 — 서버가 크기 조정·EXIF(위치 정보) 제거·파생 이미지 생성을 한다 */
export async function uploadAsset(asset: LocalImage): Promise<UploadedImage> {
  const form = new FormData();
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  if (Platform.OS === 'web') {
    form.append('file', await (await fetch(asset.uri)).blob(), name);
  } else {
    form.append('file', { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
  }
  return api.market.uploadImageForm(form);
}
