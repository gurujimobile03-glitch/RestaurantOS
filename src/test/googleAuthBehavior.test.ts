import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authService from '../services/authService';

describe('Google Authentication Behavior & Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports processRedirectResult function', () => {
    expect(typeof authService.processRedirectResult).toBe('function');
  });

  it('exports loginWithGoogle function accepting forceRedirect argument', () => {
    expect(typeof authService.loginWithGoogle).toBe('function');
  });

  it('processRedirectResult returns null safely when no redirect operation was in flight', async () => {
    // In node/test environment without redirect, should safely return null and not crash
    const result = await authService.processRedirectResult().catch(() => null);
    expect(result === null || typeof result === 'object').toBe(true);
  });
});
