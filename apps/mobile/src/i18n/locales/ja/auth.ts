import type ko from '../ko/auth';
import type { Translation } from '../../types';

const ja: Translation<typeof ko> = {
  login: {
    brand: 'Hwaso',
    tagline: '作品と人が出会う場所',
    email: 'メールアドレス',
    password: 'パスワード',
    submit: 'ログイン',
    forgotPassword: 'パスワードをお忘れの方',
    signupWithEmail: 'メールアドレスで登録',
    socialDivider: 'かんたんログイン',
    failed: 'ログインできませんでした。ネットワークを確認してください。',
  },
  signup: {
    title: 'メールアドレスで登録',
    almostDone: 'あと少しです',
    password: 'パスワード',
    passwordHint: '8文字以上、英字・数字・記号のうち2種類以上',
    nickname: 'ニックネーム',
    nicknameHint: '2〜20文字、他の会員に表示される名前です',
    agreeTerms: '利用規約・プライバシーポリシーに同意（必須）',
    viewTerms: '見る',
    agreeMarketing: 'イベント・特典のお知らせを受け取る（任意）',
    submit: '登録する',
    failed: '登録できませんでした。',
  },
  forgotPassword: {
    title: 'パスワードの再設定',
    newPassword: '新しいパスワード',
    submit: 'パスワードを変更',
    doneTitle: 'パスワードを変更しました',
    doneMessage: '新しいパスワードでログインしてください。',
    failed: '変更できませんでした。',
  },
  emailCode: {
    email: 'メールアドレス',
    send: '認証コードを受け取る',
    sentGuide: '{{email}} に送信した6桁のコードを入力してください。有効期限は10分です。',
    code: '認証コード',
    resendIn: '再送信（{{seconds}}秒）',
    resend: '認証コードを再送信',
    changeEmail: 'メールアドレスを変更',
    sendFailed: '認証コードを送信できませんでした。',
    verifyFailed: '認証できませんでした。',
  },
  social: {
    continueWith: '{{provider}}で続ける',
    redirecting: '移動中…',
    notConfiguredTitle: '{{provider}}ログインは準備中です',
    notConfiguredMessage: 'APIキーを設定すると利用できます（apps/api/.env）。',
    appleBuildOnlyTitle: 'Appleログインはアプリのビルドでのみ利用できます',
    appleBuildOnlyMessage: 'Expo Goでは利用できません。開発ビルド（expo run:ios）で実行してください。',
    failedTitle: 'ログインできませんでした',
  },
  validation: {
    passwordMin: 'パスワードは8文字以上で入力してください。',
    passwordMax: 'パスワードは72文字以下で入力してください。',
    passwordLetter: '英字を含めてください。',
    passwordDigit: '数字を含めてください。',
    nicknameMin: 'ニックネームは2文字以上で入力してください。',
    nicknameMax: 'ニックネームは20文字以下で入力してください。',
    nicknameChars: 'ハングル・英字・数字・_ . のみ使用できます。',
  },
};

export default ja;
