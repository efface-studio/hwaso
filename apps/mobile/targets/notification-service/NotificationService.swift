import Intents
import UIKit
import UserNotifications

/// 푸시가 화면에 뜨기 전에 실행된다 (서버가 aps.mutable-content = 1 로 보낸 알림만).
/// 페이로드 body.sender 에 보낸 사람이 있으면 프로필 사진을 받아 커뮤니케이션 알림(INSendMessageIntent)으로 바꾼다
/// — 카카오톡처럼 왼쪽에 보낸 사람 사진이 크게 보인다. 사진이 없거나 받지 못해도 이름으로 보인다.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  /// 확장은 약 30초 안에 끝나야 한다 — 사진 받기는 그보다 짧게
  private static let avatarTimeout: TimeInterval = 8

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    guard
      let content = request.content.mutableCopy() as? UNMutableNotificationContent,
      let body = content.userInfo["body"] as? [String: Any],
      let sender = body["sender"] as? [String: Any],
      let name = sender["name"] as? String, !name.isEmpty
    else {
      contentHandler(request.content)
      return
    }
    bestAttempt = content
    let senderId = (sender["id"] as? String) ?? name

    Self.loadAvatar(sender["avatarUrl"] as? String) { image in
      // 채팅이 아닌 알림(팔로우·후기·문의)은 제목에 내용이 있다 — 커뮤니케이션 알림은 제목 자리에 이름을 쓰므로 본문 앞으로 옮긴다
      if content.title != name, !content.title.isEmpty {
        content.body = content.body.isEmpty ? content.title : "\(content.title)\n\(content.body)"
      }
      let person = INPerson(
        personHandle: INPersonHandle(value: senderId, type: .unknown),
        nameComponents: nil,
        displayName: name,
        image: image,
        contactIdentifier: nil,
        customIdentifier: senderId
      )
      let intent = INSendMessageIntent(
        recipients: nil,
        outgoingMessageType: .outgoingMessageText,
        content: content.body,
        speakableGroupName: nil,
        conversationIdentifier: content.threadIdentifier.isEmpty ? senderId : content.threadIdentifier,
        serviceName: nil,
        sender: person,
        attachments: nil
      )
      if let image {
        intent.setImage(image, forParameterNamed: \.sender)
      }
      let interaction = INInteraction(intent: intent, response: nil)
      interaction.direction = .incoming
      interaction.donate { _ in
        let updated = (try? content.updating(from: intent)) ?? content
        self.finish(updated)
      }
    }
  }

  override func serviceExtensionTimeWillExpire() {
    // 시간이 다 되면 사진 없이 원래 알림이라도 보인다
    if let bestAttempt { finish(bestAttempt) }
  }

  private func finish(_ content: UNNotificationContent) {
    guard let handler = contentHandler else { return }
    contentHandler = nil
    handler(content)
  }

  /// 프로필 사진(WebP)을 받아 PNG 로 바꾼다 — INImage 가 WebP 를 그리지 못하는 경우가 있어서
  private static func loadAvatar(_ urlString: String?, completion: @escaping (INImage?) -> Void) {
    guard let urlString, let url = URL(string: urlString) else {
      completion(nil)
      return
    }
    var request = URLRequest(url: url)
    request.timeoutInterval = avatarTimeout
    URLSession.shared.dataTask(with: request) { data, response, _ in
      guard
        let data,
        (response as? HTTPURLResponse)?.statusCode == 200,
        let png = UIImage(data: data)?.pngData()
      else {
        completion(nil)
        return
      }
      completion(INImage(imageData: png))
    }.resume()
  }
}
