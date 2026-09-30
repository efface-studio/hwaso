import type ko from '../ko/auth';
import type { Translation } from '../../types';

const en: Translation<typeof ko> = {
  login: {
    brand: 'Hwaso',
    tagline: 'Where art meets people',
    email: 'Email',
    password: 'Password',
    submit: 'Log in',
    forgotPassword: 'Forgot password?',
    signupWithEmail: 'Sign up with email',
    socialDivider: 'Or continue with',
    failed: "Couldn't log in. Please check your connection.",
  },
  signup: {
    title: 'Sign up with email',
    almostDone: 'Almost there',
    password: 'Password',
    passwordHint: '8+ characters, using at least 2 of letters, numbers, and symbols',
    nickname: 'Nickname',
    nicknameHint: '2–20 characters, shown to other members',
    agreeTerms: 'I agree to the Terms of Service and Privacy Policy (required)',
    viewTerms: 'View',
    agreeMarketing: 'Get event and offer notifications (optional)',
    submit: 'Sign up',
    failed: "Couldn't sign up.",
  },
  forgotPassword: {
    title: 'Reset password',
    newPassword: 'New password',
    submit: 'Change password',
    doneTitle: 'Password changed',
    doneMessage: 'Please log in with your new password.',
    failed: "Couldn't change your password.",
  },
  emailCode: {
    email: 'Email',
    send: 'Send code',
    sentGuide: 'Enter the 6-digit code we sent to {{email}}. It’s valid for 10 minutes.',
    code: 'Verification code',
    resendIn: 'Resend ({{seconds}}s)',
    resend: 'Resend code',
    changeEmail: 'Change email',
    sendFailed: "Couldn't send the code.",
    verifyFailed: "Couldn't verify the code.",
  },
  social: {
    continueWith: 'Continue with {{provider}}',
    redirecting: 'Redirecting…',
    notConfiguredTitle: '{{provider}} login isn’t set up yet',
    notConfiguredMessage: 'Available once the API keys are configured (apps/api/.env).',
    appleBuildOnlyTitle: 'Apple login only works in an app build',
    appleBuildOnlyMessage: 'It isn’t available in Expo Go. Please run a development build (expo run:ios).',
    failedTitle: "Couldn't log in",
  },
  validation: {
    passwordMin: 'Password must be at least 8 characters.',
    passwordMax: 'Password must be 72 characters or fewer.',
    passwordLetter: 'Please include a letter.',
    passwordDigit: 'Please include a number.',
    nicknameMin: 'Nickname must be at least 2 characters.',
    nicknameMax: 'Nickname must be 20 characters or fewer.',
    nicknameChars: 'Only Korean, English letters, numbers, _ and . are allowed.',
  },
};

export default en;
