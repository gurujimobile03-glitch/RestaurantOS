import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('firestore.rules Static Security & RBAC Audit', () => {
  const rulesPath = path.resolve(__dirname, '../../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  it('physically exists and specifies rules_version = 2', () => {
    expect(fs.existsSync(rulesPath)).toBe(true);
    expect(rulesContent).toMatch(/rules_version\s*=\s*'2';/);
    expect(rulesContent).toMatch(/service\s+cloud\.firestore/);
  });

  it('does NOT contain dangerously permissive rules (allow read, write: if true)', () => {
    expect(rulesContent).not.toMatch(/allow\s+read,\s*write\s*:\s*if\s+true/i);
    expect(rulesContent).not.toMatch(/allow\s+read\s*:\s*if\s+true/i);
    expect(rulesContent).not.toMatch(/allow\s+write\s*:\s*if\s+true/i);
    expect(rulesContent).not.toMatch(/allow\s+read,\s*write\s*:\s*if\s+request\.auth\s*!=\s*null\s*;/i);
    expect(rulesContent).not.toMatch(/allow\s+write\s*:\s*if\s+request\.auth\s*!=\s*null\s*;/i);
  });

  it('enforces default deny on root document match', () => {
    expect(rulesContent).toMatch(/match\s+\/\{document=\*\*\}/);
    expect(rulesContent).toMatch(/allow\s+read,\s*write\s*:\s*if\s+false;/);
  });

  it('enforces owner verification helper (isOwnerOfRestaurant)', () => {
    expect(rulesContent).toMatch(/function\s+isOwnerOfRestaurant\s*\(restaurantId\)/);
    expect(rulesContent).toMatch(/data\.ownerId\s*==\s*request\.auth\.uid/);
  });

  it('enforces active membership verification helper (isMemberOfRestaurant)', () => {
    expect(rulesContent).toMatch(/function\s+isMemberOfRestaurant\s*\(restaurantId\)/);
    expect(rulesContent).toMatch(/data\.isActive\s*==\s*true/);
    expect(rulesContent).toMatch(/status\s*!=\s*'inactive'/);
  });

  it('enforces role-based helper (isMemberWithRole & isMemberWithRoles)', () => {
    expect(rulesContent).toMatch(/function\s+getMemberRole\s*\(restaurantId\)/);
    expect(rulesContent).toMatch(/function\s+isMemberWithRole\s*\(restaurantId,\s*role\)/);
    expect(rulesContent).toMatch(/function\s+isMemberWithRoles\s*\(restaurantId,\s*roles\)/);
  });

  it('enforces strict staff /members subcollection security', () => {
    // Read: Owner, Manager, or Self only
    expect(rulesContent).toMatch(/match\s+\/members\/\{memberId\}/);
    expect(rulesContent).toMatch(/isOwnerOfRestaurant\(restaurantId\)/);
    expect(rulesContent).toMatch(/isMemberWithRole\(restaurantId,\s*'manager'\)/);
    expect(rulesContent).toMatch(/request\.auth\.uid\s*==\s*memberId/);

    // Write: Owner or claiming self
    expect(rulesContent).toMatch(/allow\s+write\s*:\s*if\s+isOwnerOfRestaurant\(restaurantId\)/);
  });

  it('enforces append-only immutable audit logs', () => {
    expect(rulesContent).toMatch(/match\s+\/auditLogs\/\{auditId\}/);
    expect(rulesContent).toMatch(/allow\s+update,\s*delete\s*:\s*if\s+false;/);
    expect(rulesContent).toMatch(/allow\s+create\s*:\s*if\s+canAccessRestaurant\(restaurantId\)/);
    expect(rulesContent).toMatch(/request\.resource\.data\.actorUid\s*==\s*request\.auth\.uid/);
  });

  it('enforces collection-group membership discovery security', () => {
    expect(rulesContent).toMatch(/match\s+\/\{path=\*\*\}\/members\/\{memberId\}/);
    expect(rulesContent).toMatch(/resource\.data\.userId\s*==\s*request\.auth\.uid/);
    expect(rulesContent).toMatch(/resource\.data\.isActive\s*==\s*true/);
  });
});
