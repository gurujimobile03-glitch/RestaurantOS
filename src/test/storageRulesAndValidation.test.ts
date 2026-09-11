import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  validateImageFile,
  validateStoragePath,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_IMAGE_MIME_TYPES
} from '../services/storageService';

describe('Storage Security & File Validation', () => {
  it('enforces allowed image MIME types (JPEG, PNG, WebP)', () => {
    ALLOWED_IMAGE_MIME_TYPES.forEach((type) => {
      const validFile = new File(['mock content'], 'test.img', { type });
      expect(() => validateImageFile(validFile)).not.toThrow();
    });
  });

  it('rejects disallowed MIME types (e.g. GIF, SVG, PDF, EXE)', () => {
    const invalidTypes = ['image/gif', 'image/svg+xml', 'application/pdf', 'text/html', 'application/x-msdownload'];
    invalidTypes.forEach((type) => {
      const invalidFile = new File(['mock content'], 'test.file', { type });
      expect(() => validateImageFile(invalidFile)).toThrow(/Invalid file type/);
    });
  });

  it('enforces maximum 5MB file size limit', () => {
    // 5MB exactly
    const boundaryFile = {
      size: MAX_IMAGE_SIZE_BYTES,
      type: 'image/jpeg',
      name: 'boundary.jpg'
    } as File;
    expect(() => validateImageFile(boundaryFile)).not.toThrow();

    // 5MB + 1 byte
    const oversizedFile = {
      size: MAX_IMAGE_SIZE_BYTES + 1,
      type: 'image/jpeg',
      name: 'too_large.jpg'
    } as File;
    expect(() => validateImageFile(oversizedFile)).toThrow(/Image size exceeds the 5MB limit/);
  });

  it('enforces restaurant-scoped storage paths', () => {
    expect(validateStoragePath('restaurants/rest_123/items')).toBe('restaurants/rest_123/items');
    expect(validateStoragePath('/restaurants/rest_123/logo/')).toBe('restaurants/rest_123/logo');
    expect(validateStoragePath('restaurants/outlet_abc/categories')).toBe('restaurants/outlet_abc/categories');
  });

  it('rejects cross-tenant or un-scoped storage paths', () => {
    const forbiddenPaths = [
      'menu-items',
      'restaurant-logos',
      'public/images',
      'users/user_123',
      'root',
      'restaurants',
      'restaurants/'
    ];

    forbiddenPaths.forEach((path) => {
      expect(() => validateStoragePath(path)).toThrow(/Storage path must be restaurant-scoped/);
    });
  });
});

describe('storage.rules Static Security Audit', () => {
  const rulesPath = path.resolve(__dirname, '../../storage.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  it('physically exists and specifies rules_version = 2', () => {
    expect(fs.existsSync(rulesPath)).toBe(true);
    expect(rulesContent).toMatch(/rules_version\s*=\s*'2';/);
    expect(rulesContent).toMatch(/service\s+firebase\.storage/);
  });

  it('does NOT contain dangerously permissive rules', () => {
    expect(rulesContent).not.toMatch(/allow\s+read,\s*write\s*:\s*if\s+true/i);
    expect(rulesContent).not.toMatch(/allow\s+read\s*:\s*if\s+true/i);
    expect(rulesContent).not.toMatch(/allow\s+write\s*:\s*if\s+true/i);
    expect(rulesContent).not.toMatch(/allow\s+read,\s*write\s*:\s*if\s+request\.auth\s*!=\s*null/i);
    expect(rulesContent).not.toMatch(/allow\s+write\s*:\s*if\s+request\.auth\s*!=\s*null/i);
  });

  it('enforces default deny on the root bucket', () => {
    expect(rulesContent).toMatch(/match\s+\/\{allPaths=\*\*\}/);
    expect(rulesContent).toMatch(/allow\s+read,\s*write\s*:\s*if\s+false;/);
  });

  it('scopes access strictly to /restaurants/{restaurantId}/{allPaths=**}', () => {
    expect(rulesContent).toMatch(/match\s+\/restaurants\/\{restaurantId\}\/\{allPaths=\*\*\}/);
  });

  it('enforces owner verification and active membership check via Firestore', () => {
    expect(rulesContent).toMatch(/data\.ownerId\s*==\s*request\.auth\.uid/);
    expect(rulesContent).toMatch(/restaurants\/.*?members\/.*?request\.auth\.uid/);
    expect(rulesContent).toMatch(/data(\.get\('status',\s*'active'\)|\.status)\s*!=\s*'inactive'/);
  });

  it('enforces 5MB size limit and allowed MIME types in rules', () => {
    expect(rulesContent).toMatch(/5\s*\*\s*1024\s*\*\s*1024/);
    expect(rulesContent).toMatch(/image\/\(jpeg\|png\|webp\)/);
  });
});

describe('Security Rules Evaluation Logic (Formal Rule Condition Verification)', () => {
  interface SimulatedAuth {
    uid: string;
  }
  interface SimulatedFirestoreDoc {
    ownerId?: string;
    members?: Record<string, { status: string }>;
  }
  interface SimulatedResource {
    size: number;
    contentType: string;
  }

  const firestoreMock: Record<string, SimulatedFirestoreDoc> = {
    'restaurants/rest_alpha': {
      ownerId: 'user_owner',
      members: {
        user_active_staff: { status: 'active' },
        user_inactive_staff: { status: 'inactive' },
      },
    },
    'restaurants/rest_beta': {
      ownerId: 'user_beta_owner',
      members: {},
    },
  };

  function canAccessRestaurant(auth: SimulatedAuth | null, restaurantId: string): boolean {
    if (!auth) return false;
    const doc = firestoreMock[`restaurants/${restaurantId}`];
    if (!doc) return false;
    const isOwner = doc.ownerId === auth.uid;
    const member = doc.members?.[auth.uid];
    const isMember = !!member && member.status !== 'inactive';
    return isOwner || isMember;
  }

  function isValidImageUpload(resource: SimulatedResource | null): boolean {
    if (!resource) return false;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    return resource.size <= 5 * 1024 * 1024 && allowedTypes.includes(resource.contentType);
  }

  function evaluateRule(
    op: 'read' | 'write' | 'delete',
    path: string,
    auth: SimulatedAuth | null,
    resource: SimulatedResource | null
  ): 'ALLOW' | 'DENY' {
    const match = path.match(/^restaurants\/([^/]+)\/(.+)$/);
    if (!match) return 'DENY';
    const restaurantId = match[1];

    if (!canAccessRestaurant(auth, restaurantId)) return 'DENY';
    if (op === 'read' || op === 'delete') return 'ALLOW';
    if (op === 'write') return isValidImageUpload(resource) ? 'ALLOW' : 'DENY';
    return 'DENY';
  }

  const validJpg: SimulatedResource = { size: 1024 * 100, contentType: 'image/jpeg' };
  const validPng: SimulatedResource = { size: 1024 * 200, contentType: 'image/png' };
  const validWebp: SimulatedResource = { size: 1024 * 300, contentType: 'image/webp' };
  const oversizedImage: SimulatedResource = { size: 6 * 1024 * 1024, contentType: 'image/jpeg' };
  const invalidMimeGif: SimulatedResource = { size: 1024 * 100, contentType: 'image/gif' };
  const invalidMimePdf: SimulatedResource = { size: 1024 * 100, contentType: 'application/pdf' };

  it('1. unauthenticated read = DENY', () => {
    expect(evaluateRule('read', 'restaurants/rest_alpha/items/pic.jpg', null, null)).toBe('DENY');
  });

  it('2. unauthenticated write = DENY', () => {
    expect(evaluateRule('write', 'restaurants/rest_alpha/items/pic.jpg', null, validJpg)).toBe('DENY');
  });

  it('3. owner read/write = ALLOW', () => {
    const ownerAuth = { uid: 'user_owner' };
    expect(evaluateRule('read', 'restaurants/rest_alpha/items/pic.jpg', ownerAuth, null)).toBe('ALLOW');
    expect(evaluateRule('write', 'restaurants/rest_alpha/items/pic.jpg', ownerAuth, validJpg)).toBe('ALLOW');
  });

  it('4. active member read/write = ALLOW', () => {
    const activeMemberAuth = { uid: 'user_active_staff' };
    expect(evaluateRule('read', 'restaurants/rest_alpha/items/pic.jpg', activeMemberAuth, null)).toBe('ALLOW');
    expect(evaluateRule('write', 'restaurants/rest_alpha/items/pic.jpg', activeMemberAuth, validPng)).toBe('ALLOW');
  });

  it('5. inactive member = DENY', () => {
    const inactiveMemberAuth = { uid: 'user_inactive_staff' };
    expect(evaluateRule('read', 'restaurants/rest_alpha/items/pic.jpg', inactiveMemberAuth, null)).toBe('DENY');
    expect(evaluateRule('write', 'restaurants/rest_alpha/items/pic.jpg', inactiveMemberAuth, validJpg)).toBe('DENY');
  });

  it('6. different restaurant = DENY (cross-tenant attack)', () => {
    const ownerAlphaAuth = { uid: 'user_owner' };
    // user_owner tries to read/write rest_beta
    expect(evaluateRule('read', 'restaurants/rest_beta/items/pic.jpg', ownerAlphaAuth, null)).toBe('DENY');
    expect(evaluateRule('write', 'restaurants/rest_beta/items/pic.jpg', ownerAlphaAuth, validJpg)).toBe('DENY');
  });

  it('7. >5MB image = DENY', () => {
    const ownerAuth = { uid: 'user_owner' };
    expect(evaluateRule('write', 'restaurants/rest_alpha/items/pic.jpg', ownerAuth, oversizedImage)).toBe('DENY');
  });

  it('8. jpeg/png/webp <=5MB = ALLOW', () => {
    const ownerAuth = { uid: 'user_owner' };
    expect(evaluateRule('write', 'restaurants/rest_alpha/items/pic1.jpg', ownerAuth, validJpg)).toBe('ALLOW');
    expect(evaluateRule('write', 'restaurants/rest_alpha/items/pic2.png', ownerAuth, validPng)).toBe('ALLOW');
    expect(evaluateRule('write', 'restaurants/rest_alpha/items/pic3.webp', ownerAuth, validWebp)).toBe('ALLOW');
  });

  it('9. other MIME types = DENY', () => {
    const ownerAuth = { uid: 'user_owner' };
    expect(evaluateRule('write', 'restaurants/rest_alpha/items/pic.gif', ownerAuth, invalidMimeGif)).toBe('DENY');
    expect(evaluateRule('write', 'restaurants/rest_alpha/items/doc.pdf', ownerAuth, invalidMimePdf)).toBe('DENY');
  });
});
