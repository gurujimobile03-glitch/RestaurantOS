import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
  Transaction
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { IdempotencyOperation, IdempotencyRecord, IdempotencyStatus } from '../types/idempotency';
import { idempotencyDocPath } from '../utils/paths';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';

function canonicalStringify(payload: any): string {
  if (payload === null || payload === undefined) {
    return 'null';
  }
  if (typeof payload !== 'object') {
    return String(payload);
  }
  if (Array.isArray(payload)) {
    return '[' + payload.map(canonicalStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(payload).sort();
  const pairs = sortedKeys.map(k => {
    if (k === 'createdAt' || k === 'updatedAt' || k === 'clientRequestId') {
      return '';
    }
    return `"${k}":${canonicalStringify(payload[k])}`;
  }).filter(Boolean);

  return '{' + pairs.join(',') + '}';
}

function sha256Hex(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i: number, j: number;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 300; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  hash = hash.slice(0, 8);

  for (i = 0; i < ascii.length; i++) {
    const j2 = ascii.charCodeAt(i);
    words[i >> 2] |= j2 << ((3 - (i % 4)) * 8);
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (let jChunk = 0; jChunk < words.length; jChunk += 16) {
    const w: number[] = [];
    for (i = 0; i < 16; i++) {
      w[i] = words[jChunk + i] | 0;
    }
    for (i = 16; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
    let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

    for (i = 0; i < 64; i++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[i] + w[i]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  return result;
}

/**
 * Creates a deterministic SHA-256 string representation of a payload for fingerprinting/signing.
 * Sorts object keys to avoid arbitrary serialization divergence.
 */
export function createRequestSignature(payload: any): string {
  const canonical = canonicalStringify(payload);
  return sha256Hex(canonical);
}

/**
 * Result of idempotency evaluation.
 */
export type IdempotencyCheckResult<TResult = any> =
  | { action: 'execute'; recordRef: any }
  | { action: 'return_cached'; cachedResult: TResult; record: IdempotencyRecord }
  | { action: 'in_flight' };

export class IdempotencyService {
  /**
   * Evaluates or acquires an idempotency lock for an operation within a restaurant.
   * 
   * BEHAVIORS:
   * 1. If no record exists for this key:
   *    - Marks as 'pending' lock or prepares for execution.
   * 2. If record exists and status === 'completed':
   *    - Validates matching restaurantId, operation, and requestSignature.
   *    - If signatures match: returns cached response payload (No duplicate execution).
   *    - If signatures or operations differ: Throws error (Key reuse with modified payload rejected).
   * 3. If record exists and status === 'pending':
   *    - Request is currently in flight or concurrent duplicate arrived.
   */
  async checkOrAcquire<TResult = any>(
    restaurantId: string,
    idempotencyKey: string,
    operation: IdempotencyOperation,
    payload: any,
    transaction?: Transaction
  ): Promise<IdempotencyCheckResult<TResult>> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanKey = idempotencyKey?.trim();

    if (!cleanRestaurantId) {
      throw new Error('restaurantId is required for idempotency evaluation.');
    }
    if (!cleanKey) {
      throw new Error('idempotencyKey is required for idempotency evaluation.');
    }

    const docPath = idempotencyDocPath(cleanRestaurantId, cleanKey);
    const docRef = doc(db, docPath);
    const signature = createRequestSignature(payload);

    if (transaction) {
      const snap = await transaction.get(docRef);
      if (snap.exists()) {
        const record = snap.data() as IdempotencyRecord;

        // Verify restaurant binding
        if (record.restaurantId !== cleanRestaurantId) {
          throw new Error(
            `Cross-tenant idempotency violation: Key belongs to restaurant "${record.restaurantId}", attempted by "${cleanRestaurantId}".`
          );
        }

        // Verify operation binding
        if (record.operation !== operation) {
          throw new Error(
            `Idempotency operation mismatch: Key "${cleanKey}" was originally registered for "${record.operation}", cannot be reused for "${operation}".`
          );
        }

        // Verify signature / payload match
        if (record.requestSignature !== signature) {
          throw new Error(
            `Idempotency payload divergence: Key "${cleanKey}" was already used with a different request payload.`
          );
        }

        if (record.status === 'completed') {
          return {
            action: 'return_cached',
            cachedResult: record.responseSnapshot as TResult,
            record
          };
        }

        if (record.status === 'pending') {
          return { action: 'in_flight' };
        }

        if (record.status === 'failed') {
          throw new Error(`Previous request with idempotency key "${cleanKey}" failed: ${record.errorMessage}`);
        }
      }

      // No record exists: return execute decision without staging premature writes in transaction.
      // Firestore transactions require all reads to be executed before any writes.
      // Persisting the idempotency record is performed during the transaction's write phase
      // via recordSuccess or recordFailure.
      return { action: 'execute', recordRef: docRef };
    } else {
      // Non-transactional standalone read
      let snap;
      try {
        snap = await getDoc(docRef);
      } catch (err) {
        throw handleFirestoreError(err, OperationType.GET, docPath);
      }

      if (snap.exists()) {
        const record = snap.data() as IdempotencyRecord;

        if (record.restaurantId && record.restaurantId !== cleanRestaurantId) {
          throw new Error(`Cross-tenant idempotency violation.`);
        }
        if (record.operation && record.operation !== operation) {
          throw new Error(`Idempotency operation mismatch.`);
        }
        if (record.requestSignature && record.requestSignature !== signature) {
          throw new Error(`Idempotency payload divergence: payload tampering or signature mismatch detected.`);
        }

        if (record.status === 'completed') {
          return {
            action: 'return_cached',
            cachedResult: ((record.responseSnapshot ?? (record as any).result)) as TResult,
            record
          };
        }
        if (record.status === 'pending' || (record.status as any) === 'in_progress' || (record as any).in_flight) {
          throw new Error('Request with this clientRequestId is currently in progress.');
        }
        if (record.status === 'failed') {
          throw new Error(`Previous request with key "${cleanKey}" failed: ${record.errorMessage}`);
        }
      }

      return { action: 'execute', recordRef: docRef };
    }
  }

  /**
   * Finalizes an idempotency record upon successful operation execution.
   */
  async recordSuccess(
    restaurantId: string,
    idempotencyKey: string,
    operation: IdempotencyOperation,
    payload: any,
    targetEntityId: string,
    responseSnapshot: any,
    transaction?: Transaction
  ): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanKey = idempotencyKey?.trim();
    if (!cleanRestaurantId || !cleanKey) return;

    const docPath = idempotencyDocPath(cleanRestaurantId, cleanKey);
    const docRef = doc(db, docPath);
    const signature = createRequestSignature(payload);
    const userId = auth.currentUser?.uid || 'system';

    const updatePayload: Record<string, any> = {
      id: cleanKey,
      restaurantId: cleanRestaurantId,
      operation,
      requestSignature: signature,
      status: 'completed',
      targetEntityId: targetEntityId || null,
      responseSnapshot: responseSnapshot ? JSON.parse(JSON.stringify(responseSnapshot)) : null,
      errorMessage: null,
      createdBy: userId,
      updatedAt: serverTimestamp()
    };

    if (transaction && typeof transaction.set === 'function') {
      transaction.set(docRef, { ...updatePayload, createdAt: serverTimestamp() }, { merge: true });
    } else {
      try {
        await setDoc(docRef, { ...updatePayload, createdAt: serverTimestamp() }, { merge: true });
      } catch (err) {
        console.warn('Failed to persist idempotency completion record:', err);
      }
    }
  }

  /**
   * Finalizes an idempotency record upon permanent failure.
   */
  async recordFailure(
    restaurantId: string,
    idempotencyKey: string,
    operationOrError: string,
    errorMessageOrTx?: string | Transaction,
    maybeTransaction?: Transaction
  ): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanKey = idempotencyKey?.trim();
    if (!cleanRestaurantId || !cleanKey) return;

    let errorMessage = 'Unknown failure';
    let transaction: Transaction | undefined;

    if (typeof errorMessageOrTx === 'string') {
      errorMessage = errorMessageOrTx;
      transaction = maybeTransaction;
    } else if (typeof errorMessageOrTx === 'object' && errorMessageOrTx !== null) {
      errorMessage = operationOrError;
      transaction = errorMessageOrTx as Transaction;
    } else {
      errorMessage = operationOrError;
    }

    const docPath = idempotencyDocPath(cleanRestaurantId, cleanKey);
    const docRef = doc(db, docPath);

    const updatePayload: Record<string, any> = {
      status: 'failed',
      errorMessage: errorMessage?.substring(0, 500) || 'Unknown failure',
      updatedAt: serverTimestamp()
    };

    if (transaction && typeof transaction.set === 'function') {
      transaction.set(docRef, updatePayload, { merge: true });
    } else {
      try {
        await setDoc(docRef, updatePayload, { merge: true });
      } catch (err) {
        console.warn('Failed to persist idempotency failure record:', err);
      }
    }
  }
}

export const idempotencyService = new IdempotencyService();
