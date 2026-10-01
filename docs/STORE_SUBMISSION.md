# 스토어 심사 제출 가이드 (App Store · Google Play)

App Store Connect 와 Google Play Console 에 입력할 답변, 심사 메모, 제출 전 점검 목록이다. 빌드·서명·EAS 절차는 docs/MOBILE_RELEASE.md, 동의·탈퇴·Apple 토큰은 docs/AUTH.md §5·§7·§11 을 본다.

- 앱: 화소 (`dev.efface.hwaso`, iOS 는 iPhone·iPad — `ios.supportsTablet = true`, 세로 전용·iPad 전체 화면(`ios.requireFullScreen = true`). App Store Connect 에 iPad 13" 세로 스크린숏이 필요하고, 심사자가 iPad 에서 실행해 볼 수 있다)
- 웹: `https://hwaso.kr` (아래 `<web>`)
- 개인정보 처리방침: `<web>/privacy` · 이용약관: `<web>/terms` · 청약철회·환불: `<web>/policy/refund`
- 계정 삭제 안내(로그인 불필요): `<web>/account-deletion` · 지원: `<web>/support`

## 1. App Store Connect — 앱 개인정보 (App Privacy)

**추적(Tracking): 아니요.** 광고 SDK·타사 분석 SDK 가 없고, 다른 회사의 앱·웹사이트 데이터와 결합하지 않는다. ATT 프롬프트를 띄우지 않는다.

모든 항목은 **사용자에게 연결됨(Linked to the user) · 추적에 사용 안 함** 이다. 목적은 **앱 기능(App Functionality)** 이 기본이고, 표에 적은 경우만 더한다.

| 데이터 유형 (App Store 분류)       | 수집 내용                                                                                                     | 목적                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 연락처 정보 › 이름                 | 배송 받는 분, 본인인증 이름(마스킹 저장)                                                                      | 앱 기능                            |
| 연락처 정보 › 이메일 주소          | 로그인 이메일 (Apple 개인정보 보호 릴레이 포함)                                                               | 앱 기능                            |
| 연락처 정보 › 전화번호             | 배송 연락처, 본인인증 번호(마스킹 저장)                                                                       | 앱 기능                            |
| 연락처 정보 › 물리적 주소          | 배송지                                                                                                        | 앱 기능                            |
| 금융 정보 › 기타 금융 정보         | 판매자 정산 계좌(암호화)                                                                                      | 앱 기능                            |
| 금융 정보 › 결제 정보              | **수집 안 함으로 답한다** — 카드 정보는 토스페이먼츠 결제창이 직접 처리하고 앱·서버는 결제 승인 번호만 받는다 | —                                  |
| 사용자 콘텐츠 › 사진 또는 비디오   | 프로필·작품·후기·채팅 사진                                                                                    | 앱 기능                            |
| 사용자 콘텐츠 › 기타 사용자 콘텐츠 | 작품 설명, 후기, 문의, 채팅 메시지                                                                            | 앱 기능                            |
| 사용자 콘텐츠 › 고객 지원          | 신고·문의 내용                                                                                                | 앱 기능                            |
| 식별자 › 사용자 ID                 | 회원 ID, 소셜 로그인 식별자                                                                                   | 앱 기능                            |
| 식별자 › 기기 ID                   | 푸시 알림 토큰                                                                                                | 앱 기능                            |
| 구입 항목 › 구입 내역              | 주문·낙찰·입찰 기록                                                                                           | 앱 기능                            |
| 기타 데이터                        | 본인인증 연계정보(CI) 해시, 성인 여부                                                                         | 앱 기능 (중복 가입·부정 거래 방지) |

수집하지 **않음**: 위치(정밀·대략), 건강·피트니스, 연락처(주소록), 검색 기록, 브라우징 기록, 민감한 정보, 오디오, 게임 플레이, 광고 데이터, 성능·충돌 데이터(크래시 SDK 없음), 제품 상호작용 분석.

> 크래시 리포팅·분석 SDK 를 추가하면 "진단"·"사용 데이터" 항목과 `app.config.ts` 의 `ios.privacyManifests.NSPrivacyCollectedDataTypes` 를 함께 고친다.

## 2. Google Play — 데이터 보안 (Data safety)

| 질문                                             | 답                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| 필수 사용자 데이터 유형을 수집하거나 공유하나요? | 예                                                                          |
| 전송 중 암호화되나요?                            | 예 (모든 통신 HTTPS/TLS)                                                    |
| 사용자가 데이터 삭제를 요청할 수 있나요?         | 예 — 앱 › 마이 › 설정 › 회원 탈퇴, 웹 안내 `https://<web>/account-deletion` |
| 계정 삭제 URL                                    | `https://<web>/account-deletion`                                            |
| 독립적인 보안 검토                               | 아니요                                                                      |
| 가족 정책 대상                                   | 아니요 (만 14세 미만 가입 불가)                                             |

수집 항목 (모두 **수집**, **공유 안 함**, 처리 목적 "앱 기능"·"계정 관리", 필수/선택 표시):

| 카테고리 › 유형                   | 필수/선택           | 비고                |
| --------------------------------- | ------------------- | ------------------- |
| 개인 정보 › 이름                  | 선택 (구매·판매 시) | 배송·본인인증       |
| 개인 정보 › 이메일 주소           | 필수                | 로그인              |
| 개인 정보 › 사용자 ID             | 필수                | 회원·소셜 식별자    |
| 개인 정보 › 주소                  | 선택 (구매 시)      | 배송지              |
| 개인 정보 › 전화번호              | 선택 (구매 시)      | 배송 연락처         |
| 개인 정보 › 기타 정보             | 선택 (판매자)       | CI 해시·성인 여부   |
| 금융 정보 › 구매 기록             | 선택                | 주문·낙찰           |
| 금융 정보 › 기타 금융 정보        | 선택 (판매자)       | 정산 계좌(암호화)   |
| 메시지 › 기타 인앱 메시지         | 선택                | 채팅                |
| 사진 및 동영상 › 사진             | 선택                | 작품·후기·프로필    |
| 앱 활동 › 기타 사용자 생성 콘텐츠 | 선택                | 작품 설명·후기·문의 |
| 기기 또는 기타 ID                 | 필수                | 푸시 토큰           |

"공유"는 **안 함**으로 답한다 — 결제대행(토스페이먼츠)·본인인증(포트원)·푸시(Google/Expo)·호스팅은 서비스 제공자(처리 위탁)로 Play 정책상 공유가 아니다. 거래 성사 시 판매자에게 배송 정보를 주는 것은 사용자가 시작한 전송으로 공유에서 제외된다.

## 3. 연령 등급 설문

### App Store (Age Rating)

| 항목                                | 답                                                              |
| ----------------------------------- | --------------------------------------------------------------- |
| 만화 또는 판타지 폭력 / 사실적 폭력 | 없음                                                            |
| 성적인 콘텐츠 또는 노출             | **드물게/경미** — 고전 누드 회화·조각 작품 사진 (예술 목적)     |
| 비속어 또는 저속한 유머             | 없음 (금칙어 필터·신고로 관리)                                  |
| 성숙한/선정적 주제                  | **드물게/경미** — 미술 작품의 주제                              |
| 공포·호러                           | 없음                                                            |
| 의학·치료 정보                      | 없음                                                            |
| 알코올·담배·약물 사용 또는 언급     | 없음 (주류 판매 없음)                                           |
| 모의 도박 / 실제 도박(Gambling)     | 없음 — 경매는 실물 작품의 가격 경쟁이며 우연에 의한 보상이 없다 |
| 콘테스트                            | 없음                                                            |
| 무제한 웹 접근                      | 없음 (결제·본인인증 웹 창은 지정 도메인만)                      |
| 사용자 생성 콘텐츠                  | **예** — 작품 등록·후기·문의                                    |
| 사용자 간 메시지·채팅               | **예** — 1:1 채팅                                               |
| 광고                                | 없음                                                            |

예상 등급: 12+ (UGC·메시징 + 경미한 성숙 주제). 결과가 17+ 로 나오면 누드 항목 답을 다시 확인한다.

### Google Play (IARC)

- 카테고리: 기타(쇼핑/마켓플레이스)
- 폭력·공포·약물·도박·비속어: 아니요
- 성적 콘텐츠: 예술적 누드(비선정적)만 — "예술·교육 맥락의 누드"
- 사용자 상호작용: **사용자 간 상호작용 가능(채팅)**, **사용자 생성 콘텐츠 공유**, 디지털 상품 구매 없음(실물 상품 구매 있음)
- 위치 공유: 아니요

## 4. 심사 메모 (App Review Notes) 템플릿

> 계정 정보는 **이 문서에 쓰지 않는다.** 제출 직전 운영 서버에 심사용 계정을 만들고 App Store Connect 의 "로그인 필요" 칸에만 넣는다. 심사가 끝나면 비밀번호를 바꾸거나 계정을 정지한다.

```
Demo account (Sign-in required)
- Username / Password: entered in the "Sign-in information" fields.
- The account is a regular buyer account with consent completed. A seller account is also provided in the notes field if needed.

Guest browsing
- Home, search, artwork detail, auctions, artist and seller profiles, notices, and policies are available without signing in.
- Sign-in is requested only for chat, bidding, favorites, following, cart/checkout, orders, selling, and reporting.

Payments (Guideline 3.1.3(e))
- Hwaso is a marketplace for physical artworks and collectibles shipped to the buyer. Payments for these physical goods are processed by Toss Payments (a Korean PG) in a web payment sheet. No digital content or features are unlocked through payment, so In-App Purchase is not used.

Sign in with Apple (Guideline 4.8)
- Offered on the sign-in screen alongside Kakao, Naver, and Google. We request name and email only; users may hide their email (Apple private relay is supported).

Account deletion (Guideline 5.1.1(v))
- My > Settings > Delete account. Users without a password (social sign-in) confirm with the same social provider. Deleting an account also revokes the Sign in with Apple token.
- Public instructions: https://<web>/account-deletion

User-generated content (Guideline 1.2)
- Terms of Use include a zero-tolerance policy for objectionable content and abusive users.
- Users can report artworks, reviews, chat messages, and users, and can block users (blocked users' artworks, reviews, and messages are hidden).
- Reports are reviewed within 24 hours; offending content is removed and the user is restricted.
- Objectionable words are filtered on nicknames, listings, reviews, inquiries, and chat.

Consent
- New users (including social sign-in) must accept Terms, Privacy, and confirm they are 14 or older before posting anything. Marketing messages are opt-in.

Operator tools
- Administrator features are available only to accounts with an admin role on the server. For admin accounts, double-tapping the "My" tab opens the admin console. Regular and demo accounts cannot access it.

Artwork content
- Some listings are photographs of classical nude paintings or sculptures (artistic context).
```

## 5. 제출 전 점검

### 운영 환경 변수 (apps/api)

- [ ] `APPLE_BUNDLE_ID=dev.efface.hwaso` — 비어 있으면 `/auth/providers` 의 `appleNative` 가 false 가 되어 **Apple 로그인 버튼이 사라진다** (4.8 반려 사유)
- [ ] `APPLE_SIGNIN_KEY_ID`·`APPLE_SIGNIN_TEAM_ID`·`APPLE_SIGNIN_PRIVATE_KEY` (또는 `APNS_*`) — Sign in with Apple 이 켜진 .p8. 없으면 탈퇴 시 Apple 토큰 revoke 를 건너뛴다 (서버 로그 `apple revoke skipped`)
- [ ] `DEMO_ACCOUNTS` **비움** — 데모 모드에서는 가입·탈퇴·소셜 로그인이 막혀 심사가 반려된다 (docs/AUTH.md §10)
- [ ] `PORTONE_API_SECRET`·`PORTONE_STORE_ID`·`PORTONE_IDENTITY_CHANNEL_KEY` 설정 — 본인인증 화면이 "지금은 본인인증을 할 수 없어요" 로 막히지 않게
- [ ] `TOSS_SECRET_KEY`·`TOSS_CLIENT_KEY` 운영 키 (모의 입금 버튼은 개발 빌드에만 보인다)
- [ ] `SMTP_URL`·`MAIL_FROM` 운영 값
- [ ] `KAKAO_*`·`NAVER_*`·`GOOGLE_*`·`APPLE_CLIENT_ID` 등 쓰는 provider 만 설정 (설정한 것만 버튼 노출)
- [ ] `prisma migrate deploy` 로 `20261002000000_store_review` 적용 (기존 가입자 동의 시각 백필)

### Apple Developer · 메일

- [ ] App ID `dev.efface.hwaso` 에 Sign in with Apple 기능 ON, 웹 로그인을 쓰면 Services ID 도메인·Return URL 등록
- [ ] **Sign in with Apple › 이메일 소스 등록**: `MAIL_FROM` 발신 도메인(SPF/DKIM 통과)과 발신 주소를 Apple Developer › Services › Sign in with Apple for Email Communication 에 등록 — 안 하면 `@privaterelay.appleid.com` 사용자에게 인증번호·안내 메일이 가지 않는다

### 콘텐츠 · 정책

- [ ] `packages/shared/src/company.ts` 의 `TODO(사업자 정보)` 자리표시자를 실제 사업자 정보로 교체 (상호·대표·주소·사업자등록번호·통신판매업 신고번호·개인정보 보호책임자·호스팅)
- [ ] `<web>/privacy`·`/terms`·`/policy/refund`·`/account-deletion`·`/support` 가 로그인 없이 열린다
- [ ] 개인정보 처리방침의 처리 위탁 목록이 실제 계약(호스팅·CDN·메일 발송 대행사)과 같다
- [ ] 심사용 계정: 운영 서버에 새로 만들고 필수 동의 완료, 거래·채팅 샘플 데이터 확인 (자격 증명은 App Store Connect 에만)
- [ ] 신고 처리 담당자·24시간 내 검토 절차 운영 (관리자 › 신고)

### 앱 동작 (실기기)

- [ ] iPad(또는 iPad 시뮬레이터) 세로 화면에서 둘러보기·로그인·결제 화면이 늘어지거나 겹치지 않는다 — 심사 기기가 iPad 일 수 있다 (2.1 앱 완성도·4.0 디자인)
- [ ] App Store Connect 미디어: iPhone 6.9" 와 iPad 13" 세로 스크린숏 업로드
- [ ] 로그인 없이 홈·검색·작품 상세·경매·프로필·정책 열람, 행동 버튼은 로그인 화면으로
- [ ] 소셜 첫 가입 → 동의 화면 → 동의 전에는 글쓰기·채팅 불가
- [ ] Apple 로그인 → 탈퇴 → 설정 › Apple ID › 암호 및 보안 › Apple로 로그인 목록에서 앱이 사라짐 (revoke 확인)
- [ ] 소셜 전용 계정(비밀번호 없음) 탈퇴가 소셜 재확인으로 끝까지 된다
- [ ] 후기·채팅 메시지·작품·회원 신고, 차단 후 해당 회원 작품·후기가 보이지 않음
- [ ] 금칙어 입력 시 등록 거부 안내
- [ ] 알림 권한은 처음 채팅·입찰·관심·팔로우 때 안내 후 요청 (로그인 직후 요청하지 않음)
- [ ] 결제창·본인인증 창에 "로그인하려고 합니다" 시스템 경고가 뜨지 않음
- [ ] 광고성 알림은 마케팅 수신 동의자에게만, `(광고)` 표시, 21~8시 푸시 없음
