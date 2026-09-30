import type ko from '../ko/auth';
import type { Translation } from '../../types';

const zhHant: Translation<typeof ko> = {
  login: {
    brand: 'Hwaso',
    tagline: '作品與人相遇的地方',
    email: '電子郵件',
    password: '密碼',
    submit: '登入',
    forgotPassword: '忘記密碼',
    signupWithEmail: '使用電子郵件註冊',
    socialDivider: '快速登入',
    failed: '無法登入，請檢查網路連線。',
  },
  signup: {
    title: '使用電子郵件註冊',
    almostDone: '就快完成了',
    password: '密碼',
    passwordHint: '至少 8 個字元，包含英文、數字、符號中的至少 2 種',
    nickname: '暱稱',
    nicknameHint: '2–20 個字元，其他會員會看到的名稱',
    agreeTerms: '同意服務條款與隱私權政策（必填）',
    viewTerms: '查看',
    agreeMarketing: '接收活動與優惠通知（選填）',
    submit: '註冊',
    failed: '無法註冊。',
  },
  forgotPassword: {
    title: '重設密碼',
    newPassword: '新密碼',
    submit: '變更密碼',
    doneTitle: '已變更密碼',
    doneMessage: '請使用新密碼登入。',
    failed: '無法變更。',
  },
  emailCode: {
    email: '電子郵件',
    send: '取得驗證碼',
    sentGuide: '請輸入寄至 {{email}} 的 6 位數驗證碼，10 分鐘內有效。',
    code: '驗證碼',
    resendIn: '重新取得（{{seconds}}秒）',
    resend: '重新取得驗證碼',
    changeEmail: '變更電子郵件',
    sendFailed: '無法寄送驗證碼。',
    verifyFailed: '無法驗證。',
  },
  social: {
    continueWith: '使用{{provider}}繼續',
    redirecting: '正在前往…',
    notConfiguredTitle: '{{provider}}登入尚未開放',
    notConfiguredMessage: '設定 API 金鑰後即可使用（apps/api/.env）。',
    appleBuildOnlyTitle: 'Apple 登入僅能在 App 建置版本中使用',
    appleBuildOnlyMessage: 'Expo Go 無法使用，請以開發建置（expo run:ios）執行。',
    failedTitle: '無法登入',
  },
  validation: {
    passwordMin: '密碼至少需要 8 個字元。',
    passwordMax: '密碼不得超過 72 個字元。',
    passwordLetter: '請包含英文字母。',
    passwordDigit: '請包含數字。',
    nicknameMin: '暱稱至少需要 2 個字元。',
    nicknameMax: '暱稱不得超過 20 個字元。',
    nicknameChars: '僅可使用韓文、英文字母、數字、_ 和 .。',
  },
};

export default zhHant;
