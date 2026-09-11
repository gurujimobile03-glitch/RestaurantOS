import { PrinterTransport, PrinterProfile, PrintJob, PrintResult, PrinterStatusState } from '../../../types/printer';

export interface PrinterAdapter {
  readonly transport: PrinterTransport;
  connect(profile: PrinterProfile): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(profile: PrinterProfile): Promise<PrinterStatusState>;
  print(job: PrintJob, profile: PrinterProfile): Promise<PrintResult>;
  testPrint(profile: PrinterProfile): Promise<PrintResult>;
  isAvailable(): Promise<boolean>;
}
