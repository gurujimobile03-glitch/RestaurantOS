import { PrinterAdapter } from './PrinterAdapter';
import { PrinterProfile, PrintJob, PrintResult, PrinterStatusState, PrinterTransport } from '../../../types/printer';

export class NetworkPrinterAdapter implements PrinterAdapter {
  readonly transport: PrinterTransport = 'lan';

  async connect(profile: PrinterProfile): Promise<void> {
    const config = profile.connectionConfig;
    if (!config.ipAddress) {
      throw new Error(`LAN Printer "${profile.name}" requires an IP address.`);
    }
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    return Promise.resolve();
  }

  async getStatus(profile: PrinterProfile): Promise<PrinterStatusState> {
    const config = profile.connectionConfig;
    if (!config.ipAddress) return 'offline';

    const bridgeUrl = config.bridgeUrl || `http://${config.ipAddress}:${config.port || 9100}/status`;
    try {
      if (typeof fetch === 'function') {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(bridgeUrl, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        return response.ok ? 'online' : 'error';
      }
      return 'unknown';
    } catch {
      return 'offline';
    }
  }

  async isAvailable(): Promise<boolean> {
    return typeof fetch !== 'undefined';
  }

  async print(job: PrintJob, profile: PrinterProfile): Promise<PrintResult> {
    const config = profile.connectionConfig;
    if (!config.ipAddress && !config.bridgeUrl) {
      return {
        success: false,
        status: 'failed',
        error: `Network Printer "${profile.name}" is missing IP address/bridge URL configuration.`
      };
    }

    if (config.ipAddress) {
      const ipRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[a-zA-Z0-9.-]+$/;
      if (!ipRegex.test(config.ipAddress.trim())) {
        return {
          success: false,
          status: 'failed',
          error: `Network Printer "${profile.name}" has an invalid IP address format: ${config.ipAddress}`
        };
      }
    }

    if (config.port !== undefined) {
      const portNum = Number(config.port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return {
          success: false,
          status: 'failed',
          error: `Network Printer "${profile.name}" has an invalid port: ${config.port}`
        };
      }
    }

    const bridgeUrl = config.bridgeUrl || `http://${config.ipAddress}:${config.port || 9100}/print`;

    try {
      if (typeof fetch === 'function') {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        let response: Response;
        try {
          response = await fetch(bridgeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              printerId: profile.id,
              paperWidth: profile.paperWidth,
              characterWidth: profile.characterWidth,
              jobType: job.jobType,
              textLines: job.payload?.textLines || [],
              idempotencyKey: job.idempotencyKey
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            return {
              success: false,
              status: 'unknown',
              error: `Network connection to ${config.ipAddress || bridgeUrl} timed out (5s). Print status UNKNOWN — check physical printer before retrying.`
            };
          }
          return {
            success: false,
            status: 'failed',
            error: `Network connection to ${config.ipAddress || bridgeUrl} failed: ${fetchErr.message || 'Host unreachable'}`
          };
        }

        if (response.ok) {
          return {
            success: true,
            status: 'printed',
            printedAt: new Date()
          };
        } else {
          return {
            success: false,
            status: 'failed',
            error: `Printer bridge responded with HTTP status ${response.status}`
          };
        }
      }

      return {
        success: true,
        status: 'submitted',
        printedAt: new Date()
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'unknown',
        error: `Transmission error to ${config.ipAddress || bridgeUrl}: ${err.message || 'Unknown error'}`
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
        title: 'Network Diagnostic Test Print',
        textLines: [
          '================================',
          '    NETWORK PRINTER DIAGNOSTIC   ',
          '================================',
          `Printer: ${profile.name}`,
          `IP: ${profile.connectionConfig.ipAddress || 'Bridge'}, Port: ${profile.connectionConfig.port || 9100}`,
          `Transport: ${profile.transport.toUpperCase()}`,
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
