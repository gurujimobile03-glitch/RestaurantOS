import { IdempotencyOperation } from './idempotency';

export type OfflineOperationStatus =
  | 'queued'       // Waiting to be dispatched
  | 'syncing'      // Currently in flight to Firestore
  | 'completed'    // Successfully synced and confirmed
  | 'failed'       // Transient failure, scheduled for retry
  | 'dead_letter'  // Permanent failure (e.g. fatal validation or unresolvable business rejection)
  | 'conflict'     // Server-side state has advanced or collided (server-authoritative wins)
  | 'stale';       // Local view is outdated relative to authoritative server snapshot

export type FailureCategory =
  | 'transient_failure'
  | 'fatal_validation'
  | 'max_retries_exceeded'
  | 'conflict_stale'
  | 'concurrency_collision';

export interface OfflineQueueItem<TPayload = any, TResult = any> {
  id: string; // Unique local operation ID (e.g. `op_local_${timestamp}_${rand}`)
  restaurantId: string;
  operation: IdempotencyOperation;
  idempotencyKey: string; // Stable idempotency key across all retries of this local operation
  payload: TPayload;
  status: OfflineOperationStatus;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  failureCategory?: FailureCategory;
  conflictReason?: string | null;
  deviceId?: string;
  targetEntityId?: string;
  expectedVersion?: number;
  expectedUpdatedAt?: number;
  nextRetryAt?: number;
  createdAt: number; // Unix timestamp ms
  updatedAt: number;
  resultSnapshot?: TResult | null;
}

export interface SyncStats {
  total: number;
  queued: number;
  syncing: number;
  completed: number;
  failed: number;
  deadLetter: number;
  conflict: number;
  stale: number;
}

