import type { MeDto } from '@shop/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { hasSessionHint, useAuthStore } from './auth';

const user = { id: 'u1' } as MeDto;

describe('session hint', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ accessToken: null, user: null, ready: false });
  });

  it('is absent for a visitor who never signed in (so boot skips the refresh call)', () => {
    expect(hasSessionHint()).toBe(false);
  });

  it('is kept after sign-in and removed on sign-out', () => {
    useAuthStore.getState().setSession({ accessToken: 'a', user });
    expect(hasSessionHint()).toBe(true);
    useAuthStore.getState().clear();
    expect(hasSessionHint()).toBe(false);
  });
});
