import { PrinterAdapter } from './adapters/PrinterAdapter';
import { BrowserPrinterAdapter } from './adapters/BrowserPrinterAdapter';
import { NetworkPrinterAdapter } from './adapters/NetworkPrinterAdapter';
import { BluetoothPrinterAdapter } from './adapters/BluetoothPrinterAdapter';
import { UsbPrinterAdapter } from './adapters/UsbPrinterAdapter';
import { AndroidNativePrinterAdapter } from './adapters/AndroidNativePrinterAdapter';
import { PrinterTransport, PrinterProfile, PrintJob, PrintResult, PrinterStatusState } from '../../types/printer';

export class PrinterManager {
  private static instance: PrinterManager;
  private adapters: Map<PrinterTransport, PrinterAdapter> = new Map();

  private constructor() {
    this.registerAdapter(new BrowserPrinterAdapter());
    this.registerAdapter(new NetworkPrinterAdapter());
    this.registerAdapter(new BluetoothPrinterAdapter());
    this.registerAdapter(new UsbPrinterAdapter());
    this.registerAdapter(new AndroidNativePrinterAdapter());
  }

  public static getInstance(): PrinterManager {
    if (!PrinterManager.instance) {
      PrinterManager.instance = new PrinterManager();
    }
    return PrinterManager.instance;
  }

  public registerAdapter(adapter: PrinterAdapter): void {
    this.adapters.set(adapter.transport, adapter);
  }

  public getAdapter(transport: PrinterTransport): PrinterAdapter {
    let adapter = this.adapters.get(transport);
    if (!adapter && (transport === 'wifi' || transport === 'lan')) {
      adapter = this.adapters.get('lan');
    }
    if (!adapter) {
      // Fall back to Browser printer adapter if unknown transport
      return this.adapters.get('browser')!;
    }
    return adapter;
  }

  public async getStatus(profile: PrinterProfile): Promise<PrinterStatusState> {
    const adapter = this.getAdapter(profile.transport);
    return adapter.getStatus(profile);
  }

  public async executePrint(job: PrintJob, profile: PrinterProfile): Promise<PrintResult> {
    const adapter = this.getAdapter(profile.transport);

    const isAvail = await adapter.isAvailable();
    if (!isAvail && profile.transport !== 'browser') {
      // Automatic fallback to browser print if hardware transport is unvailable
      const fallbackAdapter = this.getAdapter('browser');
      return fallbackAdapter.print(job, profile);
    }

    try {
      const res = await adapter.print(job, profile);
      // If execution failed with status 'failed' (not 'unknown') and transport is not browser, attempt fallback
      if (!res.success && res.status === 'failed' && profile.transport !== 'browser') {
        const fallbackAdapter = this.getAdapter('browser');
        const fallbackRes = await fallbackAdapter.print(job, profile);
        return {
          ...fallbackRes,
          error: `Primary (${profile.transport}) failed: ${res.error}. Used browser print fallback.`
        };
      }
      return res;
    } catch (err: any) {
      // Hardware failure must never throw uncaught exception to caller
      return {
        success: false,
        status: 'failed',
        error: err.message || `Printing failed on adapter ${profile.transport}`
      };
    }
  }

  public async testPrint(profile: PrinterProfile): Promise<PrintResult> {
    const adapter = this.getAdapter(profile.transport);
    return adapter.testPrint(profile);
  }
}
