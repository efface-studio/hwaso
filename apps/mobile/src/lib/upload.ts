import type { UploadedImage } from '@shop/api-client';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Platform } from 'react-native';
import { api } from './api';

/** 권한이 거절됐을 때 설정으로 안내 (다시 묻지 않는 OS 동작 대응) */
function denied(what: string) {
  Alert.alert(`${what} 접근 권한이 필요해요`, '설정에서 화소의 권한을 허용해주세요.', [
    { text: '취소', style: 'cancel' },
    { text: '설정 열기', onPress: () => void Linking.openSettings() },
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
      denied('카메라');
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

/** 서버 업로드 — 서버가 크기 조정·EXIF(위치 정보) 제거·파생 이미지 생성을 한다 */
export async function uploadAsset(asset: ImagePicker.ImagePickerAsset): Promise<UploadedImage> {
  const form = new FormData();
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  if (Platform.OS === 'web') {
    form.append('file', await (await fetch(asset.uri)).blob(), name);
  } else {
    form.append('file', { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
  }
  return api.market.uploadImageForm(form);
}
