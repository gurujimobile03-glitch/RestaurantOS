import { Timestamp } from 'firebase/firestore';

export type PrinterRole = 'BILL' | 'KOT' | 'KITCHEN';

export type PrinterTransport = 'browser' | 'lan' | 'wifi' | 'bluetooth' | 'usb' | 'android_native';

export type PaperWidth = '58mm' | '80mm';

export type PrinterStatusState = 'online' | 'offline' | 'busy' | 'paper_out' | 'error' | 'unknown';

export interface PrinterConnectionConfig {
  ipAddress?: string;
  port?: number;
  bluetoothDeviceId?: string;
  bluetoothDeviceName?: string;
  usbVendorId?: number;
  usbProductId?: number;
  bridgeUrl?: string;
  androidIntentAction?: string;
}

export interface PrinterProfile {
  id: string;
  restaurantId: string;
  name: string;
  roles: PrinterRole[];
  transport: PrinterTransport;
  connectionConfig: PrinterConnectionConfig;
  paperWidth: PaperWidth;
  characterWidth: number; // e.g. 32 for 58mm, 48 for 80mm
  isActive: boolean;
  isDefault?: boolean;
  createdAt: Date | Timestamp | string;
  updatedAt: Date | Timestamp | string;
}

export type PrintJobType = 'BILL' | 'KOT' | 'TEST';

export type PrintJobStatus = 'queued' | 'printing' | 'printed' | 'submitted' | 'failed' | 'unknown';

export interface PrintJob {
  id: string;
  restaurantId: string;
  deviceId?: string;
  printerId: string;
  jobType: PrintJobType;
  documentId: string; // e.g. orderId, kotId, or TEST-xxx
  payload: Record<string, any>;
  status: PrintJobStatus;
  attemptCount: number;
  idempotencyKey: string;
  errorMessage?: string;
  createdAt: Date | Timestamp | string;
  updatedAt: Date | Timestamp | string;
}

export interface PrintResult {
  success: boolean;
  status: PrintJobStatus;
  error?: string;
  printedAt?: Date;
}

export interface FormattedPrintDocument {
  title: string;
  paperWidth: PaperWidth;
  characterWidth: number;
  textLines: string[];
  rawCommands?: string; // Optional ESC/POS bytes hex/binary string
  htmlContent?: string;
}
