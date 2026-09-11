import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrinterManager } from '../PrinterManager';
import { BrowserPrinterAdapter } from '../adapters/BrowserPrinterAdapter';
import { NetworkPrinterAdapter } from '../adapters/NetworkPrinterAdapter';
import { BluetoothPrinterAdapter } from '../adapters/BluetoothPrinterAdapter';
import { UsbPrinterAdapter } from '../adapters/UsbPrinterAdapter';
import { AndroidNativePrinterAdapter } from '../adapters/AndroidNativePrinterAdapter';
import { formatBillReceipt } from '../../../utils/receiptFormatter';
import { formatKOTPrintDocument } from '../../../utils/kotFormatter';
import { PrinterProfile, PrintJob } from '../../../types/printer';

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

describe('M8-8A Printer & Hardware Integration Suite', () => {
  let manager: PrinterManager;

  beforeEach(() => {
    manager = PrinterManager.getInstance();
  });

  describe('PrinterManager & Adapters', () => {
    it('should register all transport adapters', () => {
      expect(manager.getAdapter('browser')).toBeInstanceOf(BrowserPrinterAdapter);
      expect(manager.getAdapter('lan')).toBeInstanceOf(NetworkPrinterAdapter);
      expect(manager.getAdapter('wifi')).toBeInstanceOf(NetworkPrinterAdapter);
      expect(manager.getAdapter('bluetooth')).toBeInstanceOf(BluetoothPrinterAdapter);
      expect(manager.getAdapter('usb')).toBeInstanceOf(UsbPrinterAdapter);
      expect(manager.getAdapter('android_native')).toBeInstanceOf(AndroidNativePrinterAdapter);
    });

    it('should fall back to BrowserPrinterAdapter if specified adapter fails', async () => {
      const printer: PrinterProfile = {
        id: 'test-usb-printer',
        restaurantId: 'rest-123',
        name: 'USB Printer 1',
        roles: ['BILL'],
        transport: 'usb',
        paperWidth: '80mm',
        characterWidth: 48,
        connectionConfig: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const job: PrintJob = {
        id: 'job-1',
        restaurantId: 'rest-123',
        printerId: printer.id,
        jobType: 'BILL',
        documentId: 'order-1',
        payload: {
          title: 'Tax Invoice',
          paperWidth: '80mm',
          characterWidth: 48,
          textLines: ['Tax Invoice', 'Order #101', 'Total: 500.00'],
          htmlContent: '<div>Tax Invoice</div>'
        },
        status: 'queued',
        attemptCount: 1,
        idempotencyKey: 'idemp-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock USB adapter failure
      const usbAdapter = manager.getAdapter('usb');
      vi.spyOn(usbAdapter, 'print').mockResolvedValueOnce({
        success: false,
        status: 'failed',
        error: 'WebUSB not connected'
      });

      // Spy on browser adapter fallback
      const browserAdapter = manager.getAdapter('browser');
      vi.spyOn(browserAdapter, 'print').mockResolvedValueOnce({
        success: true,
        status: 'printed'
      });

      const result = await manager.executePrint(job, printer);
      expect(result.success).toBe(true);
      expect(result.status).toBe('printed');
    });
  });

  describe('Receipt & KOT Layout Formatters', () => {
    it('should format Bill Receipt document correctly for 80mm paper width (48 chars)', () => {
      const mockOrder: any = {
        id: 'ord-101',
        orderNumber: 'ORD-101',
        orderType: 'dineIn',
        tableId: 'T1',
        items: [
          { nameSnapshot: 'Paneer Butter Masala', quantity: 2, unitPriceMinor: 25000, lineTotalMinor: 50000 },
          { nameSnapshot: 'Butter Naan', quantity: 4, unitPriceMinor: 4000, lineTotalMinor: 16000 }
        ],
        subtotalMinor: 66000,
        discountMinor: 0,
        taxableAmountMinor: 66000,
        cgstMinor: 1650,
        sgstMinor: 1650,
        igstMinor: 0,
        grandTotalMinor: 69300,
        paidAmountMinor: 69300,
        dueAmountMinor: 0,
        createdAt: new Date()
      };

      const mockRestaurant: any = {
        name: 'Royal Spice',
        address: '123 MG Road',
        city: 'Bengaluru',
        state: 'KA',
        postalCode: '560001',
        gstNumber: '29ABCDE1234F1ZH',
        phone: '+91 9876543210'
      };

      const doc = formatBillReceipt(mockOrder, mockRestaurant, { paperWidth: '80mm' });
      expect(doc.paperWidth).toBe('80mm');
      expect(doc.characterWidth).toBe(48);
      expect(doc.textLines.some((l) => l.includes('ORD-101'))).toBe(true);
      expect(doc.textLines.some((l) => l.includes('Paneer Butter Masala'))).toBe(true);
      expect(doc.htmlContent?.toUpperCase()).toContain('ROYAL SPICE');
      expect(doc.htmlContent).toContain('ORD-101');
    });

    it('should format KOT Print document correctly for 58mm paper width (32 chars)', () => {
      const mockKot: any = {
        id: 'kot-201',
        kotNumber: 'KOT-201',
        status: 'received',
        items: [
          { nameSnapshot: 'Chicken Biryani', quantity: 1, notes: 'Extra spicy' }
        ],
        createdAt: new Date()
      };

      const doc = formatKOTPrintDocument(mockKot, {
        paperWidth: '58mm',
        restaurantName: 'Royal Spice',
        tableName: 'Table 5'
      });

      expect(doc.paperWidth).toBe('58mm');
      expect(doc.characterWidth).toBe(32);
      expect(doc.textLines.some((l) => l.includes('KOT-201'))).toBe(true);
      expect(doc.textLines.some((l) => l.includes('Chicken Biryani'))).toBe(true);
      expect(doc.textLines.some((l) => l.includes('Extra spicy'))).toBe(true);
    });
  });
});
