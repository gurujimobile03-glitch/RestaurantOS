import { PrinterAdapter } from './PrinterAdapter';
import { PrinterProfile, PrintJob, PrintResult, PrinterStatusState, PrinterTransport } from '../../../types/printer';

export class AndroidNativePrinterAdapter implements PrinterAdapter {
  readonly transport: PrinterTransport = 'android_native';

  async connect(_profile: PrinterProfile): Promise<void> {
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    return Promise.resolve();
  }

  async getStatus(_profile: PrinterProfile): Promise<PrinterStatusState> {
    if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
      return 'online';
    }
    return 'unknown';
  }

  async isAvailable(): Promise<boolean> {
    return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  }

  async print(job: PrintJob, profile: PrinterProfile): Promise<PrintResult> {
    const config = profile.connectionConfig;

    try {
      if (config.bridgeUrl && typeof fetch === 'function') {
        const response = await fetch(`${config.bridgeUrl}/android-print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intentAction: config.androidIntentAction || 'com.restaurantos.PRINT',
            textLines: job.payload?.textLines || [],
            idempotencyKey: job.idempotencyKey
          })
        });
        if (response.ok) {
          return { success: true, status: 'printed', printedAt: new Date() };
        }
      }

      // Check for Android webview window interface bridge
      if (typeof window !== 'undefined' && (window as any).AndroidPrinter) {
        (window as any).AndroidPrinter.printText(
          JSON.stringify(job.payload?.textLines || []),
          profile.paperWidth
        );
        return { success: true, status: 'printed', printedAt: new Date() };
      }

      return {
        success: true,
        status: 'submitted',
        printedAt: new Date()
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'failed',
        error: `Android native print error: ${err.message || 'Intent execution failed'}`
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
        title: 'Android Native Diagnostic Test Print',
        textLines: [
          '================================',
          '    ANDROID NATIVE DIAGNOSTIC   ',
          '================================',
          `Printer: ${profile.name}`,
          `Intent: ${profile.connectionConfig.androidIntentAction || 'com.restaurantos.PRINT'}`,
          `Transport: ANDROID_NATIVE`,
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
