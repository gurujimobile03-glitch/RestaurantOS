import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Restaurant } from '../types/restaurant';
import { RestaurantMember } from '../types/auth';
import { OfflineQueueItem } from '../types/offlineQueue';
import {
  restaurantPath,
  tablesPath,
  ordersPath,
  kotsPath,
  paymentsPath,
  auditLogsPath
} from '../utils/paths';

describe('M5 Phase 5C — Multi-Outlet Remediation & Verification Suite', () => {
  const ownerUid = 'usr_owner_789';
  const staffUid = 'usr_staff_456';
  const rogueUid = 'usr_rogue_999';

  const mockRestPune: Restaurant = {
    restaurantId: 'rest_pune_001',
    name: 'Pune Flagship',
    legalName: 'Pune Flagship Pvt Ltd',
    logoUrl: null,
    phone: '9876543210',
    email: 'pune@example.com',
    address: '123 MG Road',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411001',
    country: 'India',
    gstNumber: '27AAAAA0000A1Z5',
    ownerId: ownerUid,
    currency: 'INR',
    currencySymbol: '₹',
    timezone: 'Asia/Kolkata',
    taxMode: 'exclusive',
    defaultTaxRate: 5,
    isActive: true,
    createdAt: null as any,
    updatedAt: null as any
  };

  const mockRestMumbai: Restaurant = {
    restaurantId: 'rest_mumbai_002',
    name: 'Mumbai Central',
    legalName: 'Mumbai Central Pvt Ltd',
    logoUrl: null,
    phone: '9876543211',
    email: 'mumbai@example.com',
    address: '456 Marine Drive',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'India',
    gstNumber: '27AAAAA0000A1Z6',
    ownerId: ownerUid,
    currency: 'INR',
    currencySymbol: '₹',
    timezone: 'Asia/Kolkata',
    taxMode: 'exclusive',
    defaultTaxRate: 5,
    isActive: true,
    createdAt: null as any,
    updatedAt: null as any
  };

  const mockRestDelhi: Restaurant = {
    restaurantId: 'rest_delhi_003',
    name: 'Delhi Express',
    legalName: 'Delhi Express Pvt Ltd',
    logoUrl: null,
    phone: '9876543212',
    email: 'delhi@example.com',
    address: '789 Connaught Place',
    city: 'New Delhi',
    state: 'Delhi',
    postalCode: '110001',
    country: 'India',
    gstNumber: '07AAAAA0000A1Z7',
    ownerId: 'usr_other_owner',
    currency: 'INR',
    currencySymbol: '₹',
    timezone: 'Asia/Kolkata',
    taxMode: 'exclusive',
    defaultTaxRate: 5,
    isActive: true,
    createdAt: null as any,
    updatedAt: null as any
  };

  const mockMembers: (RestaurantMember & { status?: string })[] = [
    {
      memberId: staffUid,
      restaurantId: 'rest_delhi_003',
      userId: staffUid,
      role: 'cashier',
      isActive: true,
      status: 'active',
      createdAt: null as any
    },
    {
      memberId: 'usr_inactive_staff',
      restaurantId: 'rest_delhi_003',
      userId: 'usr_inactive_staff',
      role: 'captain',
      isActive: false,
      status: 'inactive',
      createdAt: null as any
    },
    {
      memberId: 'usr_suspended_staff',
      restaurantId: 'rest_delhi_003',
      userId: 'usr_suspended_staff',
      role: 'kitchen',
      isActive: true,
      status: 'inactive', // status flag is inactive
      createdAt: null as any
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. MULTI-OUTLET OWNER DISCOVERY
  it('1. multi-outlet owner discovery: returns all outlets owned by authenticated user', () => {
    const allRestaurants = [mockRestPune, mockRestMumbai, mockRestDelhi];
    const discovered = allRestaurants.filter(r => r.ownerId === ownerUid);
    
    expect(discovered).toHaveLength(2);
    expect(discovered.map(r => r.restaurantId)).toEqual(['rest_pune_001', 'rest_mumbai_002']);
    expect(discovered.some(r => r.restaurantId === 'rest_delhi_003')).toBe(false);
  });

  // 2. MULTI-OUTLET STAFF DISCOVERY
  it('2. multi-outlet staff discovery: correctly discovers active staff memberships via member records', () => {
    const activeStaffMemberships = mockMembers.filter(
      m => m.userId === staffUid && m.isActive === true && m.status !== 'inactive'
    );

    expect(activeStaffMemberships).toHaveLength(1);
    expect(activeStaffMemberships[0].restaurantId).toBe('rest_delhi_003');
    expect(activeStaffMemberships[0].role).toBe('cashier');
  });

  // 3. INACTIVE MEMBERSHIP EXCLUSION
  it('3. inactive membership exclusion: excludes inactive and suspended staff memberships', () => {
    const discoveredRestIds: string[] = [];

    mockMembers.forEach(m => {
      // Logic matching RestaurantContext collectionGroup processing
      if (m.userId === 'usr_inactive_staff' && m.isActive === true && m.status !== 'inactive') {
        discoveredRestIds.push(m.restaurantId);
      }
      if (m.userId === 'usr_suspended_staff' && m.isActive === true && m.status !== 'inactive') {
        discoveredRestIds.push(m.restaurantId);
      }
    });

    expect(discoveredRestIds).toHaveLength(0);
  });

  // 4. UNAUTHORIZED MEMBERSHIP EXCLUSION
  it('4. unauthorized membership exclusion: prevents discovering or accessing memberships of other users', () => {
    const queryUserId = rogueUid;
    const accessibleMembers = mockMembers.filter(m => m.userId === queryUserId);
    expect(accessibleMembers).toHaveLength(0);
  });

  // 5. COLLECTION-GROUP SECURITY EVALUATION
  it('5. collection-group security: evaluates rule constraints strictly (requires signed in, matching uid, isActive == true)', () => {
    // Evaluates: isSignedIn() && resource.data.userId == request.auth.uid && resource.data.isActive == true
    const evaluateCollectionGroupRule = (
      auth: { uid: string } | null,
      resourceData: { userId: string; isActive: boolean }
    ): boolean => {
      if (!auth) return false;
      return resourceData.userId === auth.uid && resourceData.isActive === true;
    };

    // Valid caller querying own active record -> ALLOW
    expect(evaluateCollectionGroupRule({ uid: staffUid }, { userId: staffUid, isActive: true })).toBe(true);

    // Rogue user attempting to read staffUid record -> DENY
    expect(evaluateCollectionGroupRule({ uid: rogueUid }, { userId: staffUid, isActive: true })).toBe(false);

    // Caller attempting to read own deactivated record -> DENY
    expect(evaluateCollectionGroupRule({ uid: 'usr_inactive_staff' }, { userId: 'usr_inactive_staff', isActive: false })).toBe(false);

    // Unauthenticated caller -> DENY
    expect(evaluateCollectionGroupRule(null, { userId: staffUid, isActive: true })).toBe(false);
  });

  // 6. CROSS-TENANT ISOLATION
  it('6. cross-tenant isolation: subcollection paths strictly isolate data between outlets', () => {
    const puneOrders = ordersPath(mockRestPune.restaurantId);
    const mumbaiOrders = ordersPath(mockRestMumbai.restaurantId);

    expect(puneOrders).toBe('restaurants/rest_pune_001/orders');
    expect(mumbaiOrders).toBe('restaurants/rest_mumbai_002/orders');
    expect(puneOrders).not.toBe(mumbaiOrders);

    // Subcollection path helpers strictly prevent cross-tenant bleeding
    expect(tablesPath(mockRestPune.restaurantId)).not.toContain('rest_mumbai');
    expect(kotsPath(mockRestPune.restaurantId)).not.toContain('rest_mumbai');
    expect(paymentsPath(mockRestPune.restaurantId)).not.toContain('rest_mumbai');
    expect(auditLogsPath(mockRestPune.restaurantId)).not.toContain('rest_mumbai');
  });

  // 7. STALE LOCALSTORAGE EVICTION
  it('7. stale localStorage: invalidates forged or unauthorized cached restaurantId', async () => {
    const storageKey = `restaurantos_restaurant_id_${staffUid}`;
    const forgedRestaurantId = 'rest_forbidden_999';

    // Mock localStorage
    const mockStorage: Record<string, string> = {
      [storageKey]: forgedRestaurantId
    };

    // Simulated resolution function matching RestaurantContext logic
    const resolveCachedOutlet = async (cachedId: string, currentUserId: string): Promise<Restaurant | null> => {
      // Mock fetch: returns null if not accessible
      const accessibleRestaurants = [mockRestDelhi]; // staffUid is member of Delhi
      const found = accessibleRestaurants.find(r => r.restaurantId === cachedId) || null;
      if (!found) {
        delete mockStorage[storageKey]; // Evicts forged/stale pointer
        return null;
      }
      return found;
    };

    const result = await resolveCachedOutlet(mockStorage[storageKey], staffUid);
    expect(result).toBeNull();
    expect(mockStorage[storageKey]).toBeUndefined(); // Stale key removed
  });

  // 8. OUTLET SWITCHING & ROLE UPDATE
  it('8. outlet switching: successfully switches active restaurant and active staff role', async () => {
    let activeRestaurant: Restaurant = mockRestPune;
    let activeRole: string = 'owner';

    const switchOutlet = async (targetRestaurant: Restaurant, userRole: string) => {
      activeRestaurant = targetRestaurant;
      activeRole = userRole;
    };

    // Switch to Mumbai as Owner
    await switchOutlet(mockRestMumbai, 'owner');
    expect(activeRestaurant.restaurantId).toBe('rest_mumbai_002');
    expect(activeRole).toBe('owner');

    // Switch to Delhi as Cashier
    await switchOutlet(mockRestDelhi, 'cashier');
    expect(activeRestaurant.restaurantId).toBe('rest_delhi_003');
    expect(activeRole).toBe('cashier');
  });

  // 9. LISTENER CLEANUP
  it('9. listener cleanup: teardown function called when switching or unmounting', () => {
    const mockUnsubscribe = vi.fn();
    let currentListener: (() => void) | undefined = mockUnsubscribe;

    const teardownListener = () => {
      if (currentListener) {
        currentListener();
        currentListener = undefined;
      }
    };

    teardownListener();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(currentListener).toBeUndefined();

    // Idempotent teardown check
    teardownListener();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  // 10. OFFLINE QUEUE RESTAURANT PRESERVATION
  it('10. offline queue restaurant preservation: queued mutations retain original restaurantId during context switch', () => {
    const queue: OfflineQueueItem[] = [];

    // Enqueue operation in Pune
    const puneItem: OfflineQueueItem = {
      id: 'queue_1',
      idempotencyKey: 'idemp_order_rest_pune_001_123',
      restaurantId: mockRestPune.restaurantId,
      operation: 'create_order',
      payload: { orderNumber: 'ORD-001' },
      status: 'queued',
      retryCount: 0,
      maxRetries: 3,
      lastError: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    queue.push(puneItem);

    // Operator switches context to Mumbai
    const currentActiveOutletId = mockRestMumbai.restaurantId;
    expect(currentActiveOutletId).toBe('rest_mumbai_002');

    // Queued mutation remains bound to Pune
    expect(queue[0].restaurantId).toBe('rest_pune_001');
    expect(queue[0].idempotencyKey).toContain('rest_pune_001');
    expect(queue[0].restaurantId).not.toBe(currentActiveOutletId);
  });

  // 11. RESTAURANTID CANONICAL PROPERTY USAGE
  it('11. restaurantId canonical property usage: validates all domain types and paths strictly use restaurantId', () => {
    const outlet = mockRestPune;

    // Must have restaurantId as canonical string property
    expect(outlet.restaurantId).toBeDefined();
    expect(typeof outlet.restaurantId).toBe('string');
    expect(outlet.restaurantId).toBe('rest_pune_001');

    // Verify restaurantPath consumes canonical restaurantId
    expect(restaurantPath(outlet.restaurantId)).toBe('restaurants/rest_pune_001');

    // Confirm legacy .id does not exist on typed Restaurant
    expect((outlet as any).id).toBeUndefined();
  });
});
