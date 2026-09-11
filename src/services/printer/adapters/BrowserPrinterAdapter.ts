import { PrinterAdapter } from './PrinterAdapter';
import { PrinterProfile, PrintJob, PrintResult, PrinterStatusState, PrinterTransport } from '../../../types/printer';

export class BrowserPrinterAdapter implements PrinterAdapter {
  readonly transport: PrinterTransport = 'browser';

  async connect(_profile: PrinterProfile): Promise<void> {
    // Browser print requires no persistent network handshake
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    return Promise.resolve();
  }

  async getStatus(_profile: PrinterProfile): Promise<PrinterStatusState> {
    return typeof window !== 'undefined' ? 'online' : 'offline';
  }

  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined' && typeof window.print === 'function';
  }

  async print(job: PrintJob, _profile: PrinterProfile): Promise<PrintResult> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        status: 'failed',
        error: 'Browser print is unavailable in server/SSR context.'
      };
    }

    try {
      const html = job.payload?.htmlContent || `<pre>${(job.payload?.textLines || []).join('\n')}</pre>`;
      
      // Create a hidden printable iframe for isolated browser printing
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>${job.payload?.title || 'Print Job'}</title>
              <style>
                body {
                  font-family: monospace;
                  font-size: 12px;
                  margin: 0;
                  padding: 10px;
                  white-space: pre-wrap;
                  word-break: break-word;
                }
                @media print {
                  @page { margin: 0; size: auto; }
                  body { margin: 0; padding: 5mm; }
                }
              </style>
            </head>
            <body>
              ${html}
            </body>
          </html>
        `);
        doc.close();

        // Allow DOM layout before invoking print
        await new Promise((resolve) => setTimeout(resolve, 150));
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();

        // Clean up iframe after short delay
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1000);

        return {
          success: true,
          status: 'submitted',
          printedAt: new Date()
        };
      } else {
        // Fallback directly to window.print()
        window.print();
        return {
          success: true,
          status: 'submitted',
          printedAt: new Date()
        };
      }
    } catch (err: any) {
      return {
        success: false,
        status: 'failed',
        error: err.message || 'Browser print failed.'
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
        title: 'Diagnostic Test Print',
        textLines: [
          '================================',
          '     RESTAURANTOS TEST PRINT    ',
          '================================',
          `Printer: ${profile.name}`,
          `Transport: ${profile.transport}`,
          `Width: ${profile.paperWidth} (${profile.characterWidth} chars)`,
          `Status: ONLINE`,
          `Time: ${new Date().toLocaleString('en-IN')}`,
          '--------------------------------',
          'Hardware Abstraction Engine Active',
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
