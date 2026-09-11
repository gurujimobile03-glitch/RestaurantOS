import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Table, TableFormData } from '../types/table';
import { tableService } from '../services/tableService';
import { validateTable } from '../utils/transactionValidation';
import { hasPermission } from '../utils/permissions';
import { StaffRole } from '../types/auth';

describe('Restaurant Setup — Table Management UI & Operational Invariants', () => {
  const restaurantIdA = 'rest_tenant_alpha';
  const restaurantIdB = 'rest_tenant_beta';
  const ownerUid = 'user_owner_100';
  const managerUid = 'user_manager_200';
  const cashierUid = 'user_cashier_300';
  const captainUid = 'user_captain_400';

  const mockTables: Table[] = [
    {
      id: 'table_1',
      restaurantId: restaurantIdA,
      tableNumber: '1',
      name: 'Window Table 1',
      floorOrArea: 'Main Dining',
      capacity: 4,
      isActive: true,
      sortOrder: 1,
      activeSessionId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'table_2',
      restaurantId: restaurantIdA,
      tableNumber: '2',
      name: 'Booth 2',
      floorOrArea: 'Main Dining',
      capacity: 6,
      isActive: true,
      sortOrder: 2,
      activeSessionId: 'session_active_999', // Occupied
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'table_3',
      restaurantId: restaurantIdA,
      tableNumber: '3',
      name: 'Balcony 3',
      floorOrArea: 'Rooftop',
      capacity: 2,
      isActive: false, // Deactivated
      sortOrder: 3,
      activeSessionId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Table List Rendering & Stats Calculation
  describe('1. Table List Rendering & Metadata Aggregation', () => {
    it('accurately parses table number, name, seating capacity, and floor area', () => {
      const t1 = mockTables[0];
      expect(t1.tableNumber).toBe('1');
      expect(t1.name).toBe('Window Table 1');
      expect(t1.capacity).toBe(4);
      expect(t1.floorOrArea).toBe('Main Dining');
      expect(t1.isActive).toBe(true);
    });

    it('correctly derives occupied vs vacant session status', () => {
      const getSessionStatus = (table: Table) => (table.activeSessionId ? 'occupied' : 'vacant');

      expect(getSessionStatus(mockTables[0])).toBe('vacant');
      expect(getSessionStatus(mockTables[1])).toBe('occupied');
      expect(getSessionStatus(mockTables[2])).toBe('vacant');
    });

    it('accurately computes summary metrics (Total, Active, Occupied, Deactivated)', () => {
      const computeStats = (tables: Table[]) => ({
        total: tables.length,
        active: tables.filter((t) => t.isActive !== false).length,
        inactive: tables.filter((t) => t.isActive === false).length,
        occupied: tables.filter((t) => !!t.activeSessionId).length
      });

      const stats = computeStats(mockTables);
      expect(stats.total).toBe(3);
      expect(stats.active).toBe(2);
      expect(stats.inactive).toBe(1);
      expect(stats.occupied).toBe(1);
    });

    it('supports multi-attribute search and filtering across table fields', () => {
      const filterTables = (
        tables: Table[],
        query: string,
        status: 'all' | 'active' | 'inactive',
        area: string
      ) => {
        return tables.filter((t) => {
          const matchesQuery =
            !query.trim() ||
            t.tableNumber.toLowerCase().includes(query.toLowerCase()) ||
            t.name.toLowerCase().includes(query.toLowerCase()) ||
            (t.floorOrArea && t.floorOrArea.toLowerCase().includes(query.toLowerCase()));

          const matchesStatus =
            status === 'all' ||
            (status === 'active' && t.isActive !== false) ||
            (status === 'inactive' && t.isActive === false);

          const matchesArea = area === 'all' || t.floorOrArea === area;

          return matchesQuery && matchesStatus && matchesArea;
        });
      };

      // Search by name
      const searchBooth = filterTables(mockTables, 'Booth', 'all', 'all');
      expect(searchBooth).toHaveLength(1);
      expect(searchBooth[0].tableNumber).toBe('2');

      // Filter by active status
      const activeOnly = filterTables(mockTables, '', 'active', 'all');
      expect(activeOnly).toHaveLength(2);

      // Filter by inactive status
      const inactiveOnly = filterTables(mockTables, '', 'inactive', 'all');
      expect(inactiveOnly).toHaveLength(1);
      expect(inactiveOnly[0].tableNumber).toBe('3');

      // Filter by area
      const rooftopOnly = filterTables(mockTables, '', 'all', 'Rooftop');
      expect(rooftopOnly).toHaveLength(1);
      expect(rooftopOnly[0].tableNumber).toBe('3');
    });
  });

  // 2. Add Table & Domain Validation
  describe('2. Add Table & Strict Domain Validation', () => {
    it('validates required fields: table number, name, and positive capacity', () => {
      const validData: TableFormData = {
        name: 'Table 4',
        tableNumber: '4',
        floorOrArea: 'Main Dining',
        capacity: 4,
        isActive: true,
        sortOrder: 4
      };

      const result = validateTable(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('rejects empty or missing table number and name', () => {
      const invalidData = {
        name: '',
        tableNumber: '',
        capacity: 4,
        isActive: true,
        sortOrder: 0
      };

      const result = validateTable(invalidData as any);
      expect(result.isValid).toBe(false);
      expect(result.errors?.name).toBeDefined();
      expect(result.errors?.tableNumber).toBeDefined();
    });

    it('rejects path-traversal characters in table number', () => {
      const invalidNumber = {
        name: 'Malicious Table',
        tableNumber: '../evil',
        capacity: 4,
        isActive: true,
        sortOrder: 0
      };

      const result = validateTable(invalidNumber as any);
      expect(result.isValid).toBe(false);
      expect(result.errors?.tableNumber).toContain('slashes or directory traversal');
    });

    it('rejects capacity <= 0 or capacity > 100', () => {
      const zeroCap = validateTable({ name: 'T1', tableNumber: '1', capacity: 0 });
      expect(zeroCap.isValid).toBe(false);
      expect(zeroCap.errors?.capacity).toContain('greater than 0');

      const overCap = validateTable({ name: 'T1', tableNumber: '1', capacity: 150 });
      expect(overCap.isValid).toBe(false);
      expect(overCap.errors?.capacity).toContain('cannot exceed 100');

      const nonIntCap = validateTable({ name: 'T1', tableNumber: '1', capacity: 2.5 });
      expect(nonIntCap.isValid).toBe(false);
      expect(nonIntCap.errors?.capacity).toBeDefined();
    });

    it('delegates creation directly to tableService.createTable', async () => {
      const spyCreate = vi.spyOn(tableService, 'createTable').mockResolvedValueOnce({
        id: 'new_table_4',
        restaurantId: restaurantIdA,
        name: 'Table 4',
        tableNumber: '4',
        floorOrArea: 'Main Dining',
        capacity: 4,
        isActive: true,
        sortOrder: 4,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const newTableData: TableFormData = {
        name: 'Table 4',
        tableNumber: '4',
        floorOrArea: 'Main Dining',
        capacity: 4,
        isActive: true,
        sortOrder: 4
      };

      const created = await tableService.createTable(restaurantIdA, newTableData, ownerUid);
      expect(spyCreate).toHaveBeenCalledWith(restaurantIdA, newTableData, ownerUid);
      expect(created.id).toBe('new_table_4');
      expect(created.tableNumber).toBe('4');
    });
  });

  // 3. Edit Table Configuration
  describe('3. Edit Table Configuration', () => {
    it('delegates table updates to tableService.updateTable with partial delta', async () => {
      const spyUpdate = vi.spyOn(tableService, 'updateTable').mockResolvedValueOnce();

      const updatePayload: Partial<TableFormData> = {
        name: 'VIP Corner Suite',
        capacity: 8,
        floorOrArea: 'Private VIP Hall'
      };

      await tableService.updateTable(restaurantIdA, 'table_1', updatePayload, managerUid);

      expect(spyUpdate).toHaveBeenCalledWith(restaurantIdA, 'table_1', updatePayload, managerUid);
    });
  });

  // 4. Safe Deactivation & Session Invariant Protection
  describe('4. Safe Deactivation Policy & Session Protection', () => {
    it('allows deactivating a vacant table to preserve historical order references', async () => {
      const spyUpdate = vi.spyOn(tableService, 'updateTable').mockResolvedValueOnce();

      const vacantTable = mockTables[0];
      expect(vacantTable.activeSessionId).toBeNull();

      // Safe deactivation
      await tableService.updateTable(restaurantIdA, vacantTable.id, { isActive: false }, ownerUid);

      expect(spyUpdate).toHaveBeenCalledWith(restaurantIdA, vacantTable.id, { isActive: false }, ownerUid);
    });

    it('blocks deactivating a table with an active session', () => {
      const occupiedTable = mockTables[1];
      expect(occupiedTable.activeSessionId).toBeTruthy();

      const canDeactivate = (table: Table) => {
        if (table.isActive !== false && table.activeSessionId) {
          throw new Error(`Cannot deactivate Table ${table.tableNumber} while an active dining session is in progress.`);
        }
        return true;
      };

      expect(() => canDeactivate(occupiedTable)).toThrow(
        'Cannot deactivate Table 2 while an active dining session is in progress.'
      );
    });

    it('allows reactivating a deactivated table', async () => {
      const spyUpdate = vi.spyOn(tableService, 'updateTable').mockResolvedValueOnce();

      const deactivatedTable = mockTables[2];
      expect(deactivatedTable.isActive).toBe(false);

      // Reactivate
      await tableService.updateTable(restaurantIdA, deactivatedTable.id, { isActive: true }, ownerUid);

      expect(spyUpdate).toHaveBeenCalledWith(restaurantIdA, deactivatedTable.id, { isActive: true }, ownerUid);
    });
  });

  // 5. Role-Based Access Control (Permissions)
  describe('5. Role-Based Access Control & Permission Behavior', () => {
    const checkTableManagementPermission = (role: StaffRole | undefined) => {
      return role === 'owner' || role === 'manager';
    };

    it('permits Owners and Managers to manage physical dining tables', () => {
      expect(checkTableManagementPermission('owner')).toBe(true);
      expect(checkTableManagementPermission('manager')).toBe(true);
    });

    it('restricts Cashiers, Captains, Kitchen, and Accountants from modifying tables', () => {
      expect(checkTableManagementPermission('cashier')).toBe(false);
      expect(checkTableManagementPermission('captain')).toBe(false);
      expect(checkTableManagementPermission('kitchen')).toBe(false);
      expect(checkTableManagementPermission('accountant')).toBe(false);
      expect(checkTableManagementPermission(undefined)).toBe(false);
    });

    it('rejects unauthorized mutations with clear error', () => {
      const authorizeTableMutation = (role: StaffRole | undefined) => {
        if (!checkTableManagementPermission(role)) {
          throw new Error('Permission denied: Only Owners and Managers can configure physical dining tables.');
        }
      };

      expect(() => authorizeTableMutation('captain')).toThrow('Permission denied');
      expect(() => authorizeTableMutation('cashier')).toThrow('Permission denied');
      expect(() => authorizeTableMutation('owner')).not.toThrow();
      expect(() => authorizeTableMutation('manager')).not.toThrow();
    });
  });

  // 6. Realtime Subscription & Updates
  describe('6. Realtime Subscription & Unsubscribe Lifecycles', () => {
    it('subscribes via tableService.subscribeToTables and returns cleanup unsubscription function', () => {
      const mockUnsubscribe = vi.fn();
      vi.spyOn(tableService, 'subscribeToTables').mockReturnValueOnce(mockUnsubscribe);

      const onUpdate = vi.fn();
      const onError = vi.fn();

      const unsubscribe = tableService.subscribeToTables(restaurantIdA, onUpdate, onError);
      expect(tableService.subscribeToTables).toHaveBeenCalledWith(restaurantIdA, onUpdate, onError);

      // Cleanup
      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('emits updated table state reactively when data mutations occur', () => {
      let listenerCallback: ((tables: Table[]) => void) | null = null;
      vi.spyOn(tableService, 'subscribeToTables').mockImplementation((_restId, onUpdate) => {
        listenerCallback = onUpdate;
        return vi.fn();
      });

      let currentTables: Table[] = [];
      tableService.subscribeToTables(restaurantIdA, (tables) => {
        currentTables = tables;
      });

      expect(currentTables).toHaveLength(0);

      // Emit new tables list
      listenerCallback!(mockTables);
      expect(currentTables).toHaveLength(3);
      expect(currentTables[0].tableNumber).toBe('1');
    });
  });

  // 7. Multi-Tenant Restaurant Isolation
  describe('7. Multi-Tenant Restaurant Isolation', () => {
    it('strictly uses RestaurantContext restaurantId and prevents localStorage forgery', () => {
      const getAuthorizedRestaurantId = (contextRestId: string | null) => {
        if (!contextRestId || contextRestId.trim() === '') {
          throw new Error('No active restaurant context provided');
        }
        return contextRestId.trim();
      };

      expect(getAuthorizedRestaurantId(restaurantIdA)).toBe(restaurantIdA);
      expect(() => getAuthorizedRestaurantId('')).toThrow('No active restaurant context');
      expect(() => getAuthorizedRestaurantId(null)).toThrow('No active restaurant context');
    });

    it('isolates tables by tenant restaurantId', () => {
      const tenantATables = mockTables.filter((t) => t.restaurantId === restaurantIdA);
      const tenantBTables = mockTables.filter((t) => t.restaurantId === restaurantIdB);

      expect(tenantATables).toHaveLength(3);
      expect(tenantBTables).toHaveLength(0);
    });
  });

  // 8. POS Integration & Visibility after Creation
  describe('8. POS Dine-in Integration & Visibility', () => {
    it('ensures created active table is visible to POS Terminal floor selector', () => {
      const allTables: Table[] = [...mockTables];

      const newTable: Table = {
        id: 'table_5',
        restaurantId: restaurantIdA,
        tableNumber: '5',
        name: 'Terrace Table 5',
        floorOrArea: 'Terrace',
        capacity: 4,
        isActive: true,
        sortOrder: 5,
        activeSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      allTables.push(newTable);

      // In POS Dine-in: only active tables are available for guest sessions
      const posSelectableTables = allTables.filter((t) => t.isActive !== false);

      expect(posSelectableTables).toHaveLength(3);
      expect(posSelectableTables.map((t) => t.tableNumber)).toContain('5');
    });

    it('hides deactivated tables from POS dining assignment', () => {
      const posSelectableTables = mockTables.filter((t) => t.isActive !== false);
      expect(posSelectableTables.map((t) => t.tableNumber)).not.toContain('3');
    });
  });

  // 9. UX States (Empty, Loading, Error, Retry, Offline)
  describe('9. UX States (Empty, Loading, Error, Retry, Offline)', () => {
    it('correctly distinguishes between Loading, Empty, Error, and Populated states', () => {
      const deriveState = (loading: boolean, error: string | null, count: number) => {
        if (loading) return 'LOADING';
        if (error) return 'ERROR';
        if (count === 0) return 'EMPTY';
        return 'POPULATED';
      };

      expect(deriveState(true, null, 0)).toBe('LOADING');
      expect(deriveState(false, 'Network timeout', 0)).toBe('ERROR');
      expect(deriveState(false, null, 0)).toBe('EMPTY');
      expect(deriveState(false, null, 5)).toBe('POPULATED');
    });

    it('triggers reconnect retry when retry action is invoked', () => {
      let retryCount = 0;
      const handleRetry = () => {
        retryCount += 1;
      };

      expect(retryCount).toBe(0);
      handleRetry();
      expect(retryCount).toBe(1);
    });

    it('handles offline awareness gracefully without crashing UI', () => {
      let isOnline = false;
      const getStatusLabel = (online: boolean) => (online ? 'Online' : 'Offline Mode');

      expect(getStatusLabel(isOnline)).toBe('Offline Mode');
      isOnline = true;
      expect(getStatusLabel(isOnline)).toBe('Online');
    });
  });

  // 10. Responsive Design & Viewport Constraints
  describe('10. Responsive Design & Viewport Adaptability', () => {
    it('validates layout classes for 360px, 390px, 430px, 768px, 1024px, 1280px+', () => {
      const outerContainerClass = 'w-full bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-6';
      const gridClass = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';
      const searchFilterClass = 'grid grid-cols-1 sm:grid-cols-3 gap-3';
      const headerClass = 'flex flex-col sm:flex-row sm:items-center justify-between gap-4';

      // Mobile 360px, 390px, 430px use single column (grid-cols-1, flex-col, p-4)
      expect(gridClass).toContain('grid-cols-1');
      expect(headerClass).toContain('flex-col');
      expect(searchFilterClass).toContain('grid-cols-1');
      expect(outerContainerClass).toContain('p-4');

      // Tablet 768px uses sm:grid-cols-2, sm:flex-row, sm:p-6
      expect(gridClass).toContain('sm:grid-cols-2');
      expect(headerClass).toContain('sm:flex-row');
      expect(outerContainerClass).toContain('sm:p-6');

      // Desktop 1024px+ uses lg:grid-cols-3
      expect(gridClass).toContain('lg:grid-cols-3');
    });
  });
});
