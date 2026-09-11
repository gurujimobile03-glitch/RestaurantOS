import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequestSignature, IdempotencyService } from '../services/idempotencyService';

describe('Phase 2G: Idempotency Service & Signature Fingerprinting', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    service = new IdempotencyService();
    vi.clearAllMocks();
  });

  describe('Request Signature Creation', () => {
    it('creates deterministic signatures regardless of key insertion order', () => {
      const payloadA = {
        restaurantId: 'rest_123',
        amountMinor: 50000,
        method: 'cash',
        notes: 'Table 4'
      };

      const payloadB = {
        notes: 'Table 4',
        method: 'cash',
        amountMinor: 50000,
        restaurantId: 'rest_123'
      };

      expect(createRequestSignature(payloadA)).toBe(createRequestSignature(payloadB));
    });

    it('ignores volatile fields like createdAt and clientRequestId in signature calculation', () => {
      const payloadA = {
        amountMinor: 10000,
        createdAt: 1234567,
        clientRequestId: 'req_1'
      };

      const payloadB = {
        amountMinor: 10000,
        createdAt: 9999999,
        clientRequestId: 'req_2'
      };

      expect(createRequestSignature(payloadA)).toBe(createRequestSignature(payloadB));
    });

    it('produces different signatures for different financial values or order payload differences', () => {
      const payloadA = { amountMinor: 10000, method: 'cash' };
      const payloadB = { amountMinor: 10050, method: 'cash' };

      expect(createRequestSignature(payloadA)).not.toBe(createRequestSignature(payloadB));
    });
  });
});
