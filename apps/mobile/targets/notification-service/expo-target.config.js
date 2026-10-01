/**
 * 알림 서비스 확장 — 푸시가 화면에 뜨기 전에 보낸 사람 이름·프로필 사진을 붙여 커뮤니케이션 알림으로 바꾼다.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'notification-service',
  name: 'NotificationService',
  bundleIdentifier: '.NotificationService',
  deploymentTarget: '15.1',
  frameworks: ['Intents', 'UserNotifications', 'UIKit'],
});
