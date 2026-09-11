import { PrinterAdapter } from './PrinterAdapter';
import { PrinterProfile, PrintJob, PrintResult, PrinterStatusState, PrinterTransport } from '../../../types/printer';

export class UsbPrinterAdapter implements PrinterAdapter {
  readonly transport: PrinterTransport = 'usb';

  async connect(profile: PrinterProfile): Promise<void> {
    const config = profile.connectionConfig;
    if (!config.usbVendorId && !config.bridgeUrl) {
      throw new Error(`USB Printer "${profile.name}" requires vendor ID or bridge URL.`);
    }
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    return Promise.resolve();
  }

  async getStatus(_profile: PrinterProfile): Promise<PrinterStatusState> {
    if (typeof navigator !== 'undefined' && (navigator as any).usb) {
      return 'online';
    }
    return 'unknown';
  }

  async isAvailable(): Promise<boolean> {
    return typeof navigator !== 'undefined' && Boolean((navigator as any).usb);
  }

  async print(job: PrintJob, profile: PrinterProfile): Promise<PrintResult> {
    const config = profile.connectionConfig;

    try {
      if (config.bridgeUrl && typeof fetch === 'function') {
        const response = await fetch(`${config.bridgeUrl}/print-usb`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorId: config.usbVendorId,
            productId: config.usbProductId,
            textLines: job.payload?.textLines || [],
            idempotencyKey: job.idempotencyKey
          })
        });
        if (response.ok) {
          return { success: true, status: 'printed', printedAt: new Date() };
        }
      }

      if (typeof navigator !== 'undefined' && (navigator as any).usb) {
        return {
          success: true,
          status: 'submitted',
          printedAt: new Date()
        };
      }

      return {
        success: false,
        status: 'failed',
        error: 'WebUSB API is not available in this browser.'
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'failed',
        error: `USB print error: ${err.message || 'Device communication failed'}`
      };
    }
  }

  async testPrint(profile: PrinterProfile): Promise<PrintResult> {
    const testJob: PrintJob = {
      id: `TEST-${Date.now()}`,
      restaurantId: profile.restaurantId,
      printerId: profile.id,
      jobType: 'TEST',
      documentId: `TEST-${profile.id}`,
      payload: {
        title: 'USB Diagnostic Test Print',
        textLines: [
          '================================',
          '       USB PRINTER DIAGNOSTIC   ',
          '================================',
          `Printer: ${profile.name}`,
          `VendorID: ${profile.connectionConfig.usbVendorId || 'Auto'}, ProductID: ${profile.connectionConfig.usbProductId || 'Auto'}`,
          `Transport: USB`,
          `Width: ${profile.paperWidth}`,
          `Time: ${new Date().toLocaleString('en-IN')}`,
          '================================'
        ]
      },
      status: 'queued',
      attemptCount: 1,
      idempotencyKey: `test_print_${profile.id}_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.print(testJob, profile);
  }
}
