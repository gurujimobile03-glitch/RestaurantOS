/**
 * Utility functions for resolving public application URLs.
 * Ensures generated invitation links, password reset links, and share links
 * use the public Cloud Run URL instead of the internal developer studio URL (aistudio.google.com),
 * preventing Google 403 errors when opened on external devices or phones.
 */

export const PUBLIC_APP_URL = 'https://ais-pre-4rf3jgxyfvttprip76s56n-1055228822160.asia-southeast1.run.app';

export function getPublicAppOrigin(): string {
  if (typeof window === 'undefined') {
    return PUBLIC_APP_URL;
  }

  const currentHost = window.location.hostname || '';
  const currentOrigin = window.location.origin || '';

  // If accessed from internal developer studio URL, default to the public preview URL
  if (currentHost.includes('aistudio.google.com') || currentOrigin.includes('aistudio.google.com')) {
    return PUBLIC_APP_URL;
  }

  // If on a valid public domain (Cloud Run app or custom domain), use current origin
  if (currentOrigin && (currentOrigin.startsWith('http://') || currentOrigin.startsWith('https://'))) {
    return currentOrigin;
  }

  return PUBLIC_APP_URL;
}

export function buildPublicUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${getPublicAppOrigin()}${cleanPath}`;
}
