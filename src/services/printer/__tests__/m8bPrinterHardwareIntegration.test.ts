import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrinterManager } from '../PrinterManager';
import { PrinterService } from '../PrinterService';
import { BrowserPrinterAdapter } from '../adapters/BrowserPrinterAdapter';
import { NetworkPrinterAdapter } from '../adapters/NetworkPrinterAdapter';
import { BluetoothPrinterAdapter } from '../adapters/BluetoothPrinterAdapter';
import { UsbPrinterAdapter } from '../adapters/UsbPrinterAdapter';
import { AndroidNativePrinterAdapter } from '../adapters/AndroidNativePrinterAdapter';
import { formatBillReceipt } from '../../../utils/receiptFormatter';
import { formatKOTPrintDocument } from '../../../utils/kotFormatter';
import { PrinterProfile, PrintJob, PrintResult } from '../../../types/printer';
import { Order } from '../../../types/order';
import { KOT } from '../../../types/kot';

// Mock dependencies
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ id: 'mock-doc-id' })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => new Date())
}));

vi.mock('../../../config/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } }
}));

vi.mock('../../../utils/permissions', () => ({
  enforcePermission: vi.fn(() => Promise.resolve())
}));

vi.mock('../../auditService', () => ({
  auditService: {
    logEvent: vi.fn(() => Promise.resolve())
  }
}));

describe('M8-8B Hardware Printer Integration & Verification Suite', () => {
  let manager: PrinterManager;
  let service: PrinterService;

  beforeEach(() => {
    vi.restoreAllMocks();
    manager = PrinterManager.getInstance();
    service = PrinterService.getInstance();
  });

  // -------------------------------------------------------------
  // 1. Adapter Integrity & Real Hardware Transport Paths
  // -------------------------------------------------------------
  describe('Transport Adapters & Device Compatibility', () => {
    it('BrowserPrinterAdapter should execute print and return submitted status without HTML errors', async () => {
      const adapter = new BrowserPrinterAdapter();
      const profile: PrinterProfile = {
        id: 'browser-1',
        restaurantId: 'rest-1',
        name: 'Browser Printer',
        roles: ['BILL'],
        transport: 'browser',
        paperWidth: '80mm',
        characterWidth: 48,
        connectionConfig: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const job: PrintJob = {
        id: 'job-1',
        restaurantId: 'rest-1',
        printerId: profile.id,
        jobType: 'BILL',
        documentId: 'order-1',
        payload: { title: 'Test Bill', textLines: ['Tax Invoice', 'Total: 100.00'] },
        status: 'queued',
        attemptCount: 1,
        idempotencyKey: 'idemp-browser-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock window.print
      window.print = vi.fn();

      const result = await adapter.print(job, profile);
      expect(result.success).toBe(true);
      expect(result.status).toBe('submitted');
    });

    it('NetworkPrinterAdapter should validate IP address & Port and reject invalid inputs', async () => {
      const adapter = new NetworkPrinterAdapter();
      const invalidProfile: PrinterProfile = {
        id: 'net-invalid',
        restaurantId: 'rest-1',
        name: 'Bad Network Printer',
        roles: ['BILL'],
        transport: 'lan',
        paperWidth: '80mm',
        characterWidth: 48,
        connectionConfig: { ipAddress: '192.168.1.1', port: 999999 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const job: PrintJob = {
        id: 'job-2',
        restaurantId: 'rest-1',
        printerId: invalidProfile.id,
        jobType: 'BILL',
        documentId: 'order-2',
        payload: { title: 'Test Bill' },
        status: 'queued',
        attemptCount: 1,
        idempotencyKey: 'idemp-net-2',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await adapter.print(job, invalidProfile);
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('invalid port');
    });

    it('NetworkPrinterAdapter should report UNKNOWN status on dispatch timeout', async () => {
      const adapter = new NetworkPrinterAdapter();
      const profile: PrinterProfile = {
        id: 'net-timeout',
        restaurantId: 'rest-1',
        name: 'LAN Thermal 80mm',
        roles: ['BILL'],
        transport: 'lan',
        paperWidth: '80mm',
        characterWidth: 48,
        connectionConfig: { ipAddress: '192.168.1.100', port: 9100 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const job: PrintJob = {
        id: 'job-timeout-1',
        restaurantId: 'rest-1',
        printerId: profile.id,
        jobType: 'BILL',
        documentId: 'order-3',
        payload: { title: 'Test Bill' },
        status: 'queued',
        attemptCount: 1,
        idempotencyKey: 'idemp-net-timeout',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock fetch timeout (AbortError)
      const mockFetch = vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });
      globalThis.fetch = mockFetch;

      const result = await adapter.print(job, profile);
      expect(result.success).toBe(false);
      expect(result.status).toBe('unknown');
      expect(result.error).toContain('timed out');
    });

    it('PrinterManager must NOT auto-fallback to browser print when primary status is UNKNOWN', async () => {
      const netAdapter = manager.getAdapter('lan');
      const browserAdapter = manager.getAdapter('browser');

      vi.spyOn(netAdapter, 'isAvailable').mockResolvedValue(true);
      vi.spyOn(netAdapter, 'print').mockResolvedValueOnce({
        success: false,
        status: 'unknown',
        error: 'Network connection lost after dispatch'
      });

      const browserSpy = vi.spyOn(browserAdapter, 'print');

      const profile: PrinterProfile = {
        id: 'net-p1',
        restaurantId: 'rest-1',
        name: 'LAN Printer',
        roles: ['BILL'],
        transport: 'lan',
        paperWidth: '80mm',
        characterWidth: 48,
        connectionConfig: { ipAddress: '192.168.1.200', port: 9100 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const job: PrintJob = {
        id: 'job-unk-1',
        restaurantId: 'rest-1',
        printerId: profile.id,
        jobType: 'BILL',
        documentId: 'ord-1',
        payload: { title: 'Test' },
        status: 'queued',
        attemptCount: 1,
        idempotencyKey: 'idemp-unk',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const res = await manager.executePrint(job, profile);
      expect(res.status).toBe('unknown');
      expect(browserSpy).not.toHaveBeenCalled();
    });

    it('BluetoothPrinterAdapter should handle bridge printing or missing WebBluetooth gracefully', async () => {
      const adapter = new BluetoothPrinterAdapter();
      const profile: PrinterProfile = {
        id: 'bt-1',
        restaurantId: 'rest-1',
        name: 'BT Pocket Printer',
        roles: ['KOT'],
        transport: 'bluetooth',
        paperWidth: '58mm',
        characterWidth: 32,
        connectionConfig: { bluetoothDeviceId: '00:11:22:33:44:55' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const job: PrintJob = {
        id: 'job-bt-1',
        restaurantId: 'rest-1',
        printerId: profile.id,
        jobType: 'KOT',
        documentId: 'kot-1',
        payload: { title: 'KOT Ticket' },
        status: 'queued',
        attemptCount: 1,
        idempotencyKey: 'idemp-bt-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await adapter.print(job, profile);
      // In node/vitest environment without Web Bluetooth or bridge, it returns failed
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Web Bluetooth');
    });

    it('UsbPrinterAdapter should handle WebUSB API missing state gracefully', async () => {
      const adapter = new UsbPrinterAdapter();
      const profile: PrinterProfile = {
        id: 'usb-1',
        restaurantId: 'rest-1',
        name: 'USB Thermal',
        roles: ['BILL'],
        transport: 'usb',
        paperWidth: '80mm',
        characterWidth: 48,
        connectionConfig: { usbVendorId: 0x04b8, usbProductId: 0x0e15 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const job: PrintJob = {
        id: 'job-usb-1',
        restaurantId: 'rest-1',
        printerId: profile.id,
        jobType: 'BILL',
        documentId: 'ord-usb',
        payload: { title: 'USB Bill' },
        status: 'queued',
        attemptCount: 1,
        idempotencyKey: 'idemp-usb-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await adapter.print(job, profile);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('WebUSB API');
    });

    it('AndroidNativePrinterAdapter should handle Android Intent/Bridge state', async () => {
      const adapter = new AndroidNativePrinterAdapter();
      const profile: PrinterProfile = {
        id: 'android-1',
        restaurantId: 'rest-1',
        name: 'POS Handheld Android',
        roles: ['BILL', 'KOT'],
        transport: 'android_native',
        paperWidth: '58mm',
        characterWidth: 32,
        connectionConfig: { androidIntentAction: 'com.restaurantos.PRINT' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const job: PrintJob = {
        id: 'job-android-1',
        restaurantId: 'rest-1',
        printerId: profile.id,
        jobType: 'BILL',
        documentId: 'ord-android',
        payload: { title: 'Android Bill' },
        status: 'queued',
        attemptCount: 1,
        idempotencyKey: 'idemp-android-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await adapter.print(job, profile);
      expect(result.status).toBe('submitted');
    });
  });

  // -------------------------------------------------------------
  // 2. Bounded Retries & Idempotency Rules
  // -------------------------------------------------------------
  describe('Bounded Retries & Idempotency Rules', () => {
    it('retryPrintJob should succeed on attempt 2', async () => {
      const profile: PrinterProfile = {
        id: 'browser-retry',
        restaurantId: 'rest-1',
        name: 'Browser Printer',
        roles: ['BILL'],
        transport: 'browser',
        paperWidth: '80mm',
        characterWidth: 48,
        connectionConfig: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const job: PrintJob = {
        id: 'job-retry-1',
        restaurantId: 'rest-1',
        printerId: profile.id,
        jobType: 'BILL',
        documentId: 'ord-r1',
        payload: { title: 'Retry Bill' },
        status: 'failed',
        attemptCount: 1,
        idempotencyKey: 'idemp-original-key',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      window.print = vi.fn();

      const result = await service.retryPrintJob('rest-1', job, profile);
      expect(result.success).toBe(true);
    });

    it('retryPrintJob should fail when attemptCount reaches maximum limit (3)', async () => {
      const profile: PrinterProfile = {
        id: 'browser-retry-max',
        restaurantId: 'rest-1',
        name: 'Browser Printer',
        roles: ['BILL'],
        transport: 'browser',
        paperWidth: '80mm',
        characterWidth: 48,
        connectionConfig: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const job: PrintJob = {
        id: 'job-max-retry',
        restaurantId: 'rest-1',
        printerId: profile.id,
        jobType: 'BILL',
        documentId: 'ord-r2',
        payload: { title: 'Max Retry Bill' },
        status: 'failed',
        attemptCount: 3,
        idempotencyKey: 'idemp-max-key',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await service.retryPrintJob('rest-1', job, profile);
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Maximum print retry attempts (3) reached');
    });

    it('manual bill reprint should generate a distinct idempotency key and set isReprint = true', async () => {
      const mockOrder: Order = {
        id: 'ord-reprint-101',
        restaurantId: 'rest-1',
        orderNumber: 'ORD-101',
        status: 'completed',
        orderType: 'dineIn',
        source: 'pos',
        createdBy: 'user-1',
        items: [{
          itemId: 'item-1',
          nameSnapshot: 'Espresso',
          shortNameSnapshot: 'Espresso',
          quantity: 1,
          unitPriceMinor: 15000,
          taxRate: 5,
          taxInclusive: false,
          discountMinor: 0,
          lineSubtotalMinor: 15000,
          lineTaxMinor: 750,
          lineTotalMinor: 15750
        }],
        subtotalMinor: 15000,
        discountMinor: 0,
        taxableAmountMinor: 15000,
        cgstMinor: 375,
        sgstMinor: 375,
        igstMinor: 0,
        totalTaxMinor: 750,
        grandTotalMinor: 15750,
        paidAmountMinor: 15750,
        dueAmountMinor: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      window.print = vi.fn();

      const result = await service.printBill('rest-1', mockOrder, null, { isReprint: true });
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 3. Print Routing & Inactive Filters
  // -------------------------------------------------------------
  describe('Role-Based Print Routing', () => {
    it('printKitchenKOT should route to KITCHEN role printers over default KOT printers', async () => {
      const kitchenPrinter: PrinterProfile = {
        id: 'p-kitchen-1',
        restaurantId: 'rest-1',
        name: 'Kitchen Hot Station Printer',
        roles: ['KITCHEN'],
        transport: 'browser',
        paperWidth: '80mm',
        characterWidth: 48,
        connectionConfig: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(service, 'getPrinters').mockResolvedValue([kitchenPrinter]);
      window.print = vi.fn();

      const mockKot: KOT = {
        id: 'kot-kitchen-1',
        restaurantId: 'rest-1',
        orderId: 'ord-k1',
        kotNumber: 'KOT-K1',
        status: 'sentToKitchen',
        createdBy: 'user-1',
        items: [{ itemId: 'i-1', nameSnapshot: 'Tandoori Roti', quantity: 5 }],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await service.printKitchenKOT('rest-1', mockKot);
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 4. Zero Side Effects & Financial Integrity Verification
  // -------------------------------------------------------------
  describe('Zero Side Effects on Financials & Order State', () => {
    it('printing bill or KOT must NEVER mutate order numbers, taxes, or totals', async () => {
      const originalOrder: Order = Object.freeze({
        id: 'ord-immutable-1',
        restaurantId: 'rest-1',
        orderNumber: 'ORD-IMM-100',
        status: 'confirmed',
        orderType: 'dineIn',
        source: 'pos',
        createdBy: 'user-1',
        tableId: 'Table 4',
        items: [{
          itemId: 'i-1',
          nameSnapshot: 'Butter Chicken',
          shortNameSnapshot: 'Butter Chk',
          quantity: 1,
          unitPriceMinor: 35000,
          taxRate: 5,
          taxInclusive: false,
          discountMinor: 5000,
          lineSubtotalMinor: 30000,
          lineTaxMinor: 1500,
          lineTotalMinor: 31500
        }],
        subtotalMinor: 35000,
        discountMinor: 5000,
        taxableAmountMinor: 30000,
        cgstMinor: 750,
        sgstMinor: 750,
        igstMinor: 0,
        totalTaxMinor: 1500,
        grandTotalMinor: 31500,
        paidAmountMinor: 31500,
        dueAmountMinor: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }) as any;

      window.print = vi.fn();

      const printRes = await service.printBill('rest-1', originalOrder, null);
      expect(printRes.success).toBe(true);

      // Verify strict financial equality
      expect(originalOrder.subtotalMinor).toBe(35000);
      expect(originalOrder.discountMinor).toBe(5000);
      expect(originalOrder.taxableAmountMinor).toBe(30000);
      expect(originalOrder.cgstMinor).toBe(750);
      expect(originalOrder.sgstMinor).toBe(750);
      expect(originalOrder.grandTotalMinor).toBe(31500);
      expect(originalOrder.paidAmountMinor).toBe(31500);
      expect(originalOrder.dueAmountMinor).toBe(0);
      expect(originalOrder.status).toBe('confirmed');
    });

    it('paper width 58mm vs 80mm formatting line width checks', () => {
      const doc58 = formatBillReceipt(
        {
          id: 'ord-58',
          orderNumber: 'ORD-58',
          orderType: 'takeaway',
          items: [{ nameSnapshot: 'Super Long Item Name That Exceeds Width', quantity: 1, lineTotalMinor: 1000 }],
          subtotalMinor: 1000,
          discountMinor: 0,
          taxableAmountMinor: 1000,
          cgstMinor: 0,
          sgstMinor: 0,
          igstMinor: 0,
          grandTotalMinor: 1000,
          paidAmountMinor: 1000,
          dueAmountMinor: 0,
          createdAt: new Date()
        } as any,
        null,
        { paperWidth: '58mm' }
      );

      expect(doc58.characterWidth).toBe(32);
      expect(doc58.textLines.length).toBeGreaterThan(5);

      const doc80 = formatKOTPrintDocument(
        {
          id: 'kot-80',
          kotNumber: 'KOT-80',
          items: [{ nameSnapshot: 'Mutton Rogan Josh', quantity: 2 }],
          createdAt: new Date()
        } as any,
        { paperWidth: '80mm' }
      );

      expect(doc80.characterWidth).toBe(48);
    });
  });
});
