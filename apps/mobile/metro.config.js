// Expo 가 모노레포(워크스페이스 패키지)를 자동으로 설정한다 — watchFolders 등을 직접 넣지 않는다
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
