import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  where,
  startAfter,
  DocumentSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AuditLog } from '../types/audit';
import { IAuditService } from './transactionInterfaces';
import { auditLogsPath } from '../utils/paths';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { enforcePermission } from '../utils/permissions';

/**
 * Automatically sanitizes sensitive credentials (tokens, passwords, secrets)
 * before persisting to audit records, providing defense-in-depth protection.
 */
export function sanitizeAuditMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
  if (!metadata || typeof metadata !== 'object') return metadata;
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('token') ||
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('credential') ||
      lowerKey.includes('apikey')
    ) {
      if (typeof value === 'string' && value.length > 0) {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
          hash = ((hash << 5) - hash) + value.charCodeAt(i);
          hash |= 0;
        }
        const hex = Math.abs(hash).toString(16).padStart(8, '0');
        const tail = value.length > 6 ? value.slice(-4) : '****';
        sanitized[`${key}Fingerprint`] = `tok_fp_${hex}_${tail}`;
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export class AuditService implements IAuditService {
  /**
   * Logs an operational audit event under `restaurants/{restaurantId}/auditLogs/{auditId}`.
   * Scoped strictly to the target restaurant. Preserves actorUid, action, entityId, and metadata.
   */
  async logEvent(
    restaurantId: string,
    event: Omit<AuditLog, 'id' | 'createdAt' | 'restaurantId'> & { restaurantId?: string }
  ): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    if (!cleanRestaurantId) {
      console.warn('Skipping audit log event: restaurantId is required.');
      return;
    }

    try {
      const logsCol = collection(db, auditLogsPath(cleanRestaurantId));
      const newDocRef = doc(logsCol);

      const auditRecord = {
        ...event,
        metadata: sanitizeAuditMetadata(event.metadata),
        id: newDocRef.id,
        restaurantId: cleanRestaurantId,
        createdAt: serverTimestamp()
      };

      await setDoc(newDocRef, auditRecord);
    } catch (err) {
      // Audit logging should never crash the primary operation, but errors are logged for diagnostic review
      console.warn('Failed to write audit log event:', err);
    }
  }

  /**
   * Retrieves recent audit logs for a restaurant, ordered chronologically descending.
   */
  async getRecentLogs(restaurantId: string, limitCount = 50): Promise<AuditLog[]> {
    const cleanRestaurantId = restaurantId?.trim();
    if (!cleanRestaurantId) {
      throw new Error('restaurantId is required to fetch audit logs.');
    }

    await enforcePermission(cleanRestaurantId, 'access_audit');

    try {
      const logsCol = collection(db, auditLogsPath(cleanRestaurantId));
      const q = query(logsCol, orderBy('createdAt', 'desc'), limit(limitCount));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
    } catch (err) {
      const errCode = (err as any)?.code;
      if (errCode === 'permission-denied' || errCode === 'unavailable') {
        console.warn('[RestaurantOS] Audit logs restricted on backend. Operating with empty audit list.');
        return [];
      }
      throw handleFirestoreError(err, OperationType.LIST, auditLogsPath(cleanRestaurantId));
    }
  }

  /**
   * Retrieves paginated audit logs for a restaurant with filtering, ordered descending.
   */
  async getPaginatedLogs(
    restaurantId: string,
    filters: {
      action?: string;
      entityType?: string;
      actorUid?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limitCount = 50,
    lastVisibleDoc?: DocumentSnapshot
  ): Promise<{ logs: AuditLog[]; lastVisible: DocumentSnapshot | null }> {
    const cleanRestaurantId = restaurantId?.trim();
    if (!cleanRestaurantId) {
      throw new Error('restaurantId is required to fetch audit logs.');
    }

    await enforcePermission(cleanRestaurantId, 'access_audit');

    try {
      const logsCol = collection(db, auditLogsPath(cleanRestaurantId));
      let q = query(logsCol);

      // Apply equality filters if present
      if (filters.action) {
        q = query(q, where('action', '==', filters.action));
      }
      if (filters.entityType) {
        q = query(q, where('entityType', '==', filters.entityType));
      }
      if (filters.actorUid) {
        q = query(q, where('actorUid', '==', filters.actorUid));
      }
      if (filters.startDate) {
        q = query(q, where('createdAt', '>=', filters.startDate));
      }
      if (filters.endDate) {
        q = query(q, where('createdAt', '<=', filters.endDate));
      }

      // Order chronologically descending
      q = query(q, orderBy('createdAt', 'desc'));

      if (lastVisibleDoc) {
        q = query(q, startAfter(lastVisibleDoc));
      }

      q = query(q, limit(limitCount));

      const snap = await getDocs(q);
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
      const lastVisible = snap.docs[snap.docs.length - 1] || null;

      return { logs, lastVisible };
    } catch (err) {
      const errCode = (err as any)?.code;
      if (errCode === 'permission-denied' || errCode === 'unavailable') {
        console.warn('[RestaurantOS] Paginated audit logs restricted on backend. Operating with empty page.');
        return { logs: [], lastVisible: null };
      }
      throw handleFirestoreError(err, OperationType.LIST, auditLogsPath(cleanRestaurantId));
    }
  }
}

export const auditService = new AuditService();
