import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authService from '../services/authService';

describe('Authentication Security & State Behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('does NOT restore unauthorized admin sessions from localStorage', () => {
    // Attempting to simulate a legacy fake admin session in localStorage
    localStorage.setItem(
      'restaurantos_session_user',
      JSON.stringify({
        uid: 'fake-admin-uid',
        email: 'attacker@evil.com',
        role: 'owner'
      })
    );

    // Verify localStorage has no effect on real auth subscription
    let reportedUser: any = undefined;
    const unsub = authService.subscribeToAuth((user) => {
      reportedUser = user;
    });

    // Subscribing to real Firebase auth will report null (or actual Firebase user), not the localStorage injection
    expect(reportedUser === undefined || reportedUser === null).toBe(true);
    if (typeof unsub === 'function') unsub();
  });

  it('does NOT provide any guest admin bypass method in authService', () => {
    // Assert that dangerous bypasses have been completely removed from the exported module
    expect((authService as any).loginAsGuestDemo).toBeUndefined();
    expect((authService as any).loginWithMock).toBeUndefined();
  });
});
