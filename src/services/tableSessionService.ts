import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { TableSession } from '../types/table';
import { ITableSessionService } from './transactionInterfaces';
import { validateTableSession, validateTableSessionStatusTransition } from '../utils/transactionValidation';
import { tableSessionsPath, tableSessionDocPath, tableDocPath } from '../utils/paths';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { idempotencyService } from './idempotencyService';
import { auditService } from './auditService';
import { enforcePermission } from '../utils/permissions';

/**
 * TableSessionService
 * 
 * Provides centralized TableSession lifecycle management.
 * 
 * CRITICAL ARCHITECTURAL & CONCURRENCY INVARIANTS:
 * 1. Physical Table vs. TableSession:
 *    - Table represents the physical furniture asset (1:N relationship with historical sessions).
 *    - TableSession represents ONE specific dining occurrence.
 * 2. Lifecycle State Machine:
 *    - Valid transition: 'open' -> 'closed'.
 *    - 'closed' is a terminal state. Reopening a closed session ('closed' -> 'open') is strictly forbidden.
 *    - To reuse a physical table, a NEW TableSession instance must be created.
 * 3. Single Open Session Invariant:
 *    - For a given (restaurantId, tableId), at most 1 session can have status === 'open' at any time.
 *    - Pre-conditions for opening a session:
 *      * Table must exist in the specified restaurant (`restaurants/{restaurantId}/tables/{tableId}`).
 *      * Table must be active (`table.isActive === true`).
 *      * guestCount must be a positive integer <= table.capacity.
 *      * No currently open session may exist for this table.
 * 4. Closing a Session:
 *    - Sets status to 'closed'.
 *    - Sets closedAt timestamp (closedAt >= openedAt).
 *    - Preserves openedAt and historical reference arrays (e.g. activeOrderIds).
 * 5. Concurrency Notice:
 *    - In multi-operator environments, client-side pre-checks are subject to race conditions
 *      if two cashiers open a session simultaneously.
 *    - In production Firestore, this should be wrapped in a Firestore Transaction / backend authority
 *      for complete atomic serialization.
 */
export class TableSessionService implements ITableSessionService {
  /**
   * Finds the currently open/active TableSession for a table.
   * Returns null if no session is currently open.
   */
  async getActiveSession(restaurantId: string, tableId: string): Promise<TableSession | null> {
    const path = tableSessionsPath(restaurantId);
    try {
      const colRef = collection(db, 'restaurants', restaurantId.trim(), 'tableSessions');
      const q = query(
        colRef,
        where('tableId', '==', tableId.trim()),
        where('status', '==', 'open')
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return null;
      }
      const firstDoc = snapshot.docs[0];
      return { id: firstDoc.id, ...firstDoc.data() } as TableSession;
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.GET, path);
    }
  }

  /**
   * Opens a new TableSession for a physical table.
   * Atomically enforces table existence, active status, guest count within capacity, and no existing open session using Firestore runTransaction.
   */
  async openSession(
    restaurantId: string,
    tableId: string,
    guestCount: number,
    openedBy: string,
    clientRequestId?: string
  ): Promise<TableSession> {
    const sessionCollectionPath = tableSessionsPath(restaurantId);
    const cleanRestaurantId = restaurantId?.trim();
    const cleanTableId = tableId?.trim();
    const cleanKey = clientRequestId?.trim();

    if (!cleanRestaurantId) {
      throw new Error('Valid restaurantId is required to open a session.');
    }

    await enforcePermission(cleanRestaurantId, 'open_table_sessions');
    if (!cleanTableId) {
      throw new Error('Valid tableId is required to open a session.');
    }

    // 1. Pre-validate session structure
    const sessionValidation = validateTableSession({
      tableId: cleanTableId,
      guestCount,
      status: 'open'
    });
    if (!sessionValidation.isValid) {
      throw new Error(`TableSession validation failed: ${sessionValidation.error}`);
    }

    try {
      const tableRef = doc(db, 'restaurants', cleanRestaurantId, 'tables', cleanTableId);
      const colRef = collection(db, 'restaurants', cleanRestaurantId, 'tableSessions');
      const newDocRef = doc(colRef);
      const now = new Date();

      let createdSession: TableSession | null = null;
      let cachedSession: TableSession | null = null;

      await runTransaction(db, async (transaction) => {
        // Idempotency check inside transaction
        if (cleanKey) {
          const check = await idempotencyService.checkOrAcquire<TableSession>(
            cleanRestaurantId,
            cleanKey,
            'open_session',
            { tableId: cleanTableId, guestCount },
            transaction
          );

          if (check.action === 'return_cached' && check.cachedResult) {
            cachedSession = check.cachedResult;
            return;
          }
        }

        const tableSnap = await transaction.get(tableRef);
        if (!tableSnap.exists()) {
          throw new Error(`Cannot open session: Table "${tableId}" does not exist in restaurant "${restaurantId}".`);
        }

        const tableData = tableSnap.data();
        if (!tableData.isActive) {
          throw new Error(`Cannot open session: Table "${tableId}" is currently inactive.`);
        }

        if (guestCount > tableData.capacity) {
          throw new Error(
            `Cannot open session: guestCount (${guestCount}) exceeds table capacity (${tableData.capacity}).`
          );
        }

        // Atomic lock check on table
        if (tableData.activeSessionId) {
          throw new Error(
            `Cannot open session: Table "${tableId}" already has an active open session (ID: ${tableData.activeSessionId}).`
          );
        }

        const sessionData: Omit<TableSession, 'id'> = {
          restaurantId: cleanRestaurantId,
          tableId: cleanTableId,
          status: 'open',
          guestCount,
          openedAt: serverTimestamp() || now,
          closedAt: null,
          activeOrderIds: [],
          openedBy: openedBy || auth.currentUser?.uid || 'system',
          closedBy: null,
          createdAt: serverTimestamp() || now,
          updatedAt: serverTimestamp() || now
        };

        // 1. Write new session document
        transaction.set(newDocRef, sessionData);

        // 2. Lock physical table document with activeSessionId
        transaction.update(tableRef, {
          activeSessionId: newDocRef.id,
          updatedAt: serverTimestamp() || now
        });

        createdSession = {
          id: newDocRef.id,
          ...sessionData,
          openedAt: now,
          createdAt: now,
          updatedAt: now
        };

        if (cleanKey) {
          await idempotencyService.recordSuccess(
            cleanRestaurantId,
            cleanKey,
            'open_session',
            { tableId: cleanTableId, guestCount },
            createdSession.id,
            createdSession,
            transaction
          );
        }
      });

      if (cachedSession) {
        return cachedSession;
      }

      if (!createdSession) {
        throw new Error('Transaction succeeded but table session was not created.');
      }

      auditService.logEvent(cleanRestaurantId, {
        entityType: 'tableSession',
        entityId: (createdSession as TableSession).id,
        action: 'session_opened',
        actorUid: openedBy || auth.currentUser?.uid || 'system',
        metadata: { tableId: cleanTableId, guestCount }
      });

      return createdSession;
    } catch (err: unknown) {
      if (cleanKey) {
        await idempotencyService.recordFailure(
          cleanRestaurantId,
          cleanKey,
          (err as any)?.message || 'Failed to open session'
        );
      }
      if (
        (err as any)?.message &&
        ((err as any).message.includes('Cannot open session') ||
          (err as any).message.includes('Idempotency') ||
          (err as any).message.includes('TableSession validation'))
      ) {
        throw err;
      }
      throw handleFirestoreError(err, OperationType.CREATE, sessionCollectionPath);
    }
  }

  /**
   * Closes an active TableSession.
   * Enforces valid lifecycle transition ('open' -> 'closed') and preserves historical openedAt timestamp using atomic transaction.
   */
  async closeSession(restaurantId: string, sessionId: string, closedBy: string): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    if (!cleanRestaurantId) {
      throw new Error('restaurantId is required to close a session.');
    }
    await enforcePermission(cleanRestaurantId, 'close_sessions');
    const cleanSessionId = sessionId?.trim();
    const path = tableSessionDocPath(cleanRestaurantId, cleanSessionId);

    try {
      const docRef = doc(db, 'restaurants', cleanRestaurantId, 'tableSessions', cleanSessionId);
      const now = new Date();

      await runTransaction(db, async (transaction) => {
        const sessionSnap = await transaction.get(docRef);
        if (!sessionSnap.exists()) {
          throw new Error(`Cannot close session: TableSession "${sessionId}" not found.`);
        }

        const currentSession = sessionSnap.data() as TableSession;

        // Validate lifecycle transition
        const transitionCheck = validateTableSessionStatusTransition(currentSession.status, 'closed');
        if (!transitionCheck.isValid) {
          throw new Error(`Cannot close session: ${transitionCheck.error}`);
        }

        // All reads must execute BEFORE any writes in Firestore transactions
        let tableRef: any = null;
        let shouldClearActiveSession = false;
        if (currentSession.tableId) {
          tableRef = doc(db, 'restaurants', cleanRestaurantId, 'tables', currentSession.tableId.trim());
          const tableSnap = await transaction.get(tableRef);
          if (tableSnap.exists()) {
            const tableData = tableSnap.data() as any;
            if (tableData?.activeSessionId === cleanSessionId) {
              shouldClearActiveSession = true;
            }
          }
        }

        // Writes phase
        // 1. Update session
        transaction.update(docRef, {
          status: 'closed',
          closedAt: serverTimestamp() || now,
          closedBy: closedBy || auth.currentUser?.uid || 'system',
          updatedAt: serverTimestamp() || now
        });

        // 2. Clear activeSessionId on table doc if present
        if (shouldClearActiveSession && tableRef) {
          transaction.update(tableRef, {
            activeSessionId: null,
            updatedAt: serverTimestamp() || now
          });
        }
      });

      auditService.logEvent(cleanRestaurantId, {
        entityType: 'tableSession',
        entityId: cleanSessionId,
        action: 'session_closed',
        actorUid: closedBy || auth.currentUser?.uid || 'system'
      });
    } catch (err: unknown) {
      if ((err as any)?.message && (err as any).message.includes('Cannot close session')) {
        throw err;
      }
      throw handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  /**
   * Updates the guest count of an active open TableSession.
   * Atomically verifies the session is open and guestCount <= physical table capacity.
   */
  async updateGuestCount(
    restaurantId: string,
    sessionId: string,
    newGuestCount: number,
    updatedBy: string
  ): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanSessionId = sessionId?.trim();
    const path = tableSessionDocPath(cleanRestaurantId, cleanSessionId);

    if (!cleanRestaurantId) {
      throw new Error('Valid restaurantId is required to update session guest count.');
    }
    if (!cleanSessionId) {
      throw new Error('Valid sessionId is required to update session guest count.');
    }
    if (!Number.isInteger(newGuestCount) || newGuestCount <= 0) {
      throw new Error('guestCount must be a positive integer.');
    }

    await enforcePermission(cleanRestaurantId, 'modify_session_info');

    try {
      const docRef = doc(db, 'restaurants', cleanRestaurantId, 'tableSessions', cleanSessionId);
      const now = new Date();

      await runTransaction(db, async (transaction) => {
        const sessionSnap = await transaction.get(docRef);
        if (!sessionSnap.exists()) {
          throw new Error(`Cannot update guest count: TableSession "${sessionId}" not found.`);
        }

        const session = sessionSnap.data() as TableSession;

        if (session.guestCount === newGuestCount) {
          // Already updated (idempotent success)
          return;
        }

        if (session.status !== 'open') {
          throw new Error(`Cannot update guest count: TableSession is ${session.status}. Only open sessions can be updated.`);
        }

        // Verify against physical table capacity if table exists
        if (session.tableId) {
          const tableRef = doc(db, 'restaurants', cleanRestaurantId, 'tables', session.tableId.trim());
          const tableSnap = await transaction.get(tableRef);
          if (tableSnap.exists()) {
            const tableData = tableSnap.data();
            if (newGuestCount > tableData.capacity) {
              throw new Error(
                `Cannot update guest count: guestCount (${newGuestCount}) exceeds table capacity (${tableData.capacity}).`
              );
            }
          }
        }

        transaction.update(docRef, {
          guestCount: newGuestCount,
          updatedAt: serverTimestamp() || now
        });
      });

      auditService.logEvent(cleanRestaurantId, {
        entityType: 'tableSession',
        entityId: cleanSessionId,
        action: 'session_guest_count_updated',
        actorUid: updatedBy || auth.currentUser?.uid || 'system',
        metadata: { newGuestCount }
      });
    } catch (err: unknown) {
      if ((err as any)?.message && (err as any).message.includes('Cannot update guest count')) {
        throw err;
      }
      throw handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  /**
   * Subscribes to all active ('open') sessions in a restaurant in real-time.
   */
  subscribeToActiveSessions(
    restaurantId: string,
    onUpdate: (sessions: TableSession[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const colRef = collection(db, 'restaurants', restaurantId.trim(), 'tableSessions');
    const q = query(colRef, where('status', '==', 'open'));

    return onSnapshot(
      q,
      (snapshot) => {
        const sessions: TableSession[] = [];
        snapshot.forEach((d) => {
          sessions.push({ id: d.id, ...d.data() } as TableSession);
        });
        onUpdate(sessions);
      },
      (err) => {
        if (!auth.currentUser) return;
        const errCode = (err as any)?.code;
        if (errCode === 'permission-denied' || errCode === 'unavailable') {
          console.warn('[RestaurantOS Debug] Active table sessions subscription notice:', (err as any)?.message);
          onUpdate([]);
        } else {
          console.error('[RestaurantOS Debug] Error listening to active table sessions:', err);
        }
        if (onError) onError(err as Error);
      }
    );
  }

  /**
   * Retrieves historical (closed) TableSessions for a specific physical table.
   * Preserves session history without coupling to active table state.
   */
  async getHistoricalSessionsForTable(
    restaurantId: string,
    tableId: string,
    limitCount: number = 20
  ): Promise<TableSession[]> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanTableId = tableId?.trim();
    if (!cleanRestaurantId || !cleanTableId) {
      throw new Error('restaurantId and tableId are required to fetch historical sessions.');
    }

    const path = tableSessionsPath(cleanRestaurantId);
    try {
      const colRef = collection(db, 'restaurants', cleanRestaurantId, 'tableSessions');
      const q = query(
        colRef,
        where('tableId', '==', cleanTableId),
        where('status', '==', 'closed')
      );
      const snapshot = await getDocs(q);
      const sessions: TableSession[] = [];
      snapshot.forEach((d) => {
        sessions.push({ id: d.id, ...d.data() } as TableSession);
      });

      // Sort client-side by closedAt desc to avoid composite index requirement
      return sessions
        .sort((a, b) => {
          const timeA = (a.closedAt as any)?.toMillis?.() || (a.closedAt ? new Date(a.closedAt as any).getTime() : 0);
          const timeB = (b.closedAt as any)?.toMillis?.() || (b.closedAt ? new Date(b.closedAt as any).getTime() : 0);
          return timeB - timeA;
        })
        .slice(0, limitCount);
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.LIST, path);
    }
  }

  /**
   * Retrieves all historical (closed) TableSessions across the restaurant with a bounded limit.
   */
  async getHistoricalSessions(
    restaurantId: string,
    limitCount: number = 50
  ): Promise<TableSession[]> {
    const cleanRestaurantId = restaurantId?.trim();
    if (!cleanRestaurantId) {
      throw new Error('restaurantId is required to fetch historical sessions.');
    }

    const path = tableSessionsPath(cleanRestaurantId);
    try {
      const colRef = collection(db, 'restaurants', cleanRestaurantId, 'tableSessions');
      const q = query(
        colRef,
        where('status', '==', 'closed')
      );
      const snapshot = await getDocs(q);
      const sessions: TableSession[] = [];
      snapshot.forEach((d) => {
        sessions.push({ id: d.id, ...d.data() } as TableSession);
      });

      return sessions
        .sort((a, b) => {
          const timeA = (a.closedAt as any)?.toMillis?.() || (a.closedAt ? new Date(a.closedAt as any).getTime() : 0);
          const timeB = (b.closedAt as any)?.toMillis?.() || (b.closedAt ? new Date(b.closedAt as any).getTime() : 0);
          return timeB - timeA;
        })
        .slice(0, limitCount);
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.LIST, path);
    }
  }
}

export const tableSessionService = new TableSessionService();
