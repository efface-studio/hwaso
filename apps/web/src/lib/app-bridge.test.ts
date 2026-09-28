import { describe, expect, it } from 'vitest';
import { appReturnUrl, withParams } from './app-bridge';

describe('appReturnUrl', () => {
  it('allows only the app scheme in production', () => {
    expect(appReturnUrl('hwaso://pay-result', 'production')).toBe('hwaso://pay-result');
    expect(appReturnUrl('https://evil.example/steal', 'production')).toBeNull();
    expect(appReturnUrl('exp://192.168.0.2:8081/--/pay-result', 'production')).toBeNull();
    expect(appReturnUrl('http://localhost:8081/pay-result', 'production')).toBeNull();
    expect(appReturnUrl('hwaso:evil', 'production')).toBeNull();
    expect(appReturnUrl(null, 'production')).toBeNull();
  });

  it('also allows Expo Go and the local web preview during development', () => {
    expect(appReturnUrl('exp://192.168.0.2:8081/--/pay-result', 'development')).toBe(
      'exp://192.168.0.2:8081/--/pay-result',
    );
    expect(appReturnUrl('http://localhost:8081/pay-result', 'development')).toBe(
      'http://localhost:8081/pay-result',
    );
    expect(appReturnUrl('http://localhost.evil.example/x', 'development')).toBeNull();
  });
});

describe('withParams', () => {
  it('appends query params, keeping existing ones', () => {
    expect(withParams('hwaso://pay-result', { code: 'USER_CANCEL' })).toBe(
      'hwaso://pay-result?code=USER_CANCEL',
    );
    expect(withParams('exp://h:1/--/r?a=1', { b: '한' })).toBe('exp://h:1/--/r?a=1&b=%ED%95%9C');
  });
});
