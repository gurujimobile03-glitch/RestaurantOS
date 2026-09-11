import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import {
  PrinterProfile,
  PrinterRole,
  PrintJob,
  PrintResult,
  PaperWidth
} from '../../types/printer';
import { Order } from '../../types/order';
import { KOT } from '../../types/kot';
import { Restaurant } from '../../types/restaurant';
import { printersPath, printerDocPath, printJobsPath, printJobDocPath } from '../../utils/paths';
import { enforcePermission } from '../../utils/permissions';
import { auditService } from '../auditService';
import { formatBillReceipt } from '../../utils/receiptFormatter';
import { formatKOTPrintDocument } from '../../utils/kotFormatter';
import { PrinterManager } from './PrinterManager';

const DEFAULT_BROWSER_PRINTER: PrinterProfile = {
  id: 'browser-default',
  restaurantId: '',
  name: 'Browser Standard Print',
  roles: ['BILL', 'KOT', 'KITCHEN'],
  transport: 'browser',
  connectionConfig: {},
  paperWidth: '80mm',
  characterWidth: 48,
  isActive: true,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

export class PrinterService {
  private static instance: PrinterService;
  private manager: PrinterManager = PrinterManager.getInstance();

  public static getInstance(): PrinterService {
    if (!PrinterService.instance) {
      PrinterService.instance = new PrinterService();
    }
    return PrinterService.instance;
  }

  // -------------------------------------------------------------
  // CRUD Operations
  // -------------------------------------------------------------

  public async getPrinters(restaurantId: string): Promise<PrinterProfile[]> {
    const cleanId = restaurantId?.trim();
    if (!cleanId) return [DEFAULT_BROWSER_PRINTER];

    await enforcePermission(cleanId, 'access_printers');

    try {
      const colRef = collection(db, printersPath(cleanId));
      const snapshot = await getDocs(colRef);

      if (snapshot.empty) {
        return [{ ...DEFAULT_BROWSER_PRINTER, restaurantId: cleanId }];
      }

      const profiles: PrinterProfile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        profiles.push({
          id: docSnap.id,
          restaurantId: cleanId,
          name: data.name || 'Printer',
          roles: data.roles || (data.role ? [data.role] : ['BILL']),
          transport: data.transport || 'browser',
          connectionConfig: data.connectionConfig || {},
          paperWidth: data.paperWidth || '80mm',
          characterWidth: data.characterWidth || (data.paperWidth === '58mm' ? 32 : 48),
          isActive: data.isActive !== false,
          isDefault: Boolean(data.isDefault),
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
          updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date()
        });
      });

      return profiles;
    } catch (err) {
      console.warn('PrinterService.getPrinters error, returning default browser profile:', err);
      return [{ ...DEFAULT_BROWSER_PRINTER, restaurantId: cleanId }];
    }
  }

  public async getPrinterById(restaurantId: string, printerId: string): Promise<PrinterProfile | null> {
    const cleanRestId = restaurantId?.trim();
    const cleanPrinterId = printerId?.trim();
    if (!cleanRestId || !cleanPrinterId) return null;

    if (cleanPrinterId === 'browser-default') {
      return { ...DEFAULT_BROWSER_PRINTER, restaurantId: cleanRestId };
    }

    await enforcePermission(cleanRestId, 'access_printers');

    const ref = doc(db, printerDocPath(cleanRestId, cleanPrinterId));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data();
    return {
      id: snap.id,
      restaurantId: cleanRestId,
      name: data.name || 'Printer',
      roles: data.roles || (data.role ? [data.role] : ['BILL']),
      transport: data.transport || 'browser',
      connectionConfig: data.connectionConfig || {},
      paperWidth: data.paperWidth || '80mm',
      characterWidth: data.characterWidth || (data.paperWidth === '58mm' ? 32 : 48),
      isActive: data.isActive !== false,
      isDefault: Boolean(data.isDefault),
      createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date()
    };
  }

  public async createPrinter(
    restaurantId: string,
    profileData: Omit<PrinterProfile, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>
  ): Promise<PrinterProfile> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) throw new Error('restaurantId is required');

    await enforcePermission(cleanRestId, 'manage_printers');

    if (!profileData.name || profileData.name.trim() === '') {
      throw new Error('Printer name is required.');
    }

    const colRef = collection(db, printersPath(cleanRestId));
    const newDocRef = doc(colRef);

    const paperWidth: PaperWidth = profileData.paperWidth || '80mm';
    const characterWidth = profileData.characterWidth || (paperWidth === '58mm' ? 32 : 48);

    const newProfile: PrinterProfile = {
      id: newDocRef.id,
      restaurantId: cleanRestId,
      name: profileData.name.trim(),
      roles: profileData.roles && profileData.roles.length > 0 ? profileData.roles : ['BILL'],
      transport: profileData.transport || 'browser',
      connectionConfig: profileData.connectionConfig || {},
      paperWidth,
      characterWidth,
      isActive: profileData.isActive !== false,
      isDefault: Boolean(profileData.isDefault),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await setDoc(newDocRef, {
      ...newProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await auditService.logEvent(cleanRestId, {
      actorUid: auth.currentUser?.uid || 'system',
      action: 'PRINTER_CREATED' as any,
      entityType: 'printer',
      entityId: newProfile.id,
      metadata: { name: newProfile.name, transport: newProfile.transport }
    });

    return newProfile;
  }

  public async updatePrinter(
    restaurantId: string,
    printerId: string,
    updates: Partial<PrinterProfile>
  ): Promise<PrinterProfile> {
    const cleanRestId = restaurantId?.trim();
    const cleanPrinterId = printerId?.trim();
    if (!cleanRestId || !cleanPrinterId) throw new Error('restaurantId and printerId are required');

    await enforcePermission(cleanRestId, 'manage_printers');

    const ref = doc(db, printerDocPath(cleanRestId, cleanPrinterId));
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error(`Printer profile "${cleanPrinterId}" not found.`);
    }

    const currentData = snap.data();
    const paperWidth = updates.paperWidth || currentData.paperWidth || '80mm';
    const characterWidth = updates.characterWidth || (paperWidth === '58mm' ? 32 : 48);

    const payload = {
      ...updates,
      paperWidth,
      characterWidth,
      updatedAt: serverTimestamp()
    };

    // Do not mutate restaurantId or id
    delete (payload as any).restaurantId;
    delete (payload as any).id;

    await updateDoc(ref, payload);

    const updatedProfile = await this.getPrinterById(cleanRestId, cleanPrinterId);

    await auditService.logEvent(cleanRestId, {
      actorUid: auth.currentUser?.uid || 'system',
      action: 'PRINTER_UPDATED' as any,
      entityType: 'printer',
      entityId: cleanPrinterId,
      metadata: { printerId: cleanPrinterId, updates }
    });

    return updatedProfile!;
  }

  public async deletePrinter(restaurantId: string, printerId: string): Promise<void> {
    const cleanRestId = restaurantId?.trim();
    const cleanPrinterId = printerId?.trim();
    if (!cleanRestId || !cleanPrinterId) throw new Error('restaurantId and printerId are required');

    await enforcePermission(cleanRestId, 'manage_printers');

    const ref = doc(db, printerDocPath(cleanRestId, cleanPrinterId));
    await deleteDoc(ref);

    await auditService.logEvent(cleanRestId, {
      actorUid: auth.currentUser?.uid || 'system',
      action: 'PRINTER_DELETED' as any,
      entityType: 'printer',
      entityId: cleanPrinterId,
      metadata: { printerId: cleanPrinterId }
    });
  }

  public async getActivePrintersForRole(restaurantId: string, role: PrinterRole): Promise<PrinterProfile[]> {
    const all = await this.getPrinters(restaurantId);
    const filtered = all.filter((p) => p.isActive && p.roles && p.roles.includes(role));
    if (filtered.length === 0) {
      return [{ ...DEFAULT_BROWSER_PRINTER, restaurantId }];
    }
    return filtered;
  }

  // -------------------------------------------------------------
  // High-Level Printing Operations
  // -------------------------------------------------------------

  public async printBill(
    restaurantId: string,
    order: Order,
    restaurant: Partial<Restaurant> | null,
    options: { isReprint?: boolean; printerId?: string } = {}
  ): Promise<PrintResult> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) throw new Error('restaurantId is required');

    await enforcePermission(cleanRestId, 'print_bill');

    // Resolve target printer
    let targetPrinter: PrinterProfile | null = null;
    if (options.printerId) {
      targetPrinter = await this.getPrinterById(cleanRestId, options.printerId);
    }

    if (!targetPrinter) {
      const activeBillPrinters = await this.getActivePrintersForRole(cleanRestId, 'BILL');
      targetPrinter = activeBillPrinters[0] || { ...DEFAULT_BROWSER_PRINTER, restaurantId: cleanRestId };
    }

    // Format bill document according to paper width
    const formattedDoc = formatBillReceipt(order, restaurant, {
      paperWidth: targetPrinter.paperWidth,
      isReprint: options.isReprint
    });

    const idempotencyKey = `bill_print_${order.id}_${options.isReprint ? 'reprint_' : ''}${Date.now()}`;

    // Construct PrintJob
    const job: PrintJob = {
      id: `JOB-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      restaurantId: cleanRestId,
      printerId: targetPrinter.id,
      jobType: 'BILL',
      documentId: order.id,
      payload: {
        title: formattedDoc.title,
        paperWidth: formattedDoc.paperWidth,
        characterWidth: formattedDoc.characterWidth,
        textLines: formattedDoc.textLines,
        htmlContent: formattedDoc.htmlContent,
        orderId: order.id,
        orderNumber: order.orderNumber,
        isReprint: Boolean(options.isReprint)
      },
      status: 'queued',
      attemptCount: 1,
      idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Record job in Firestore if online
    try {
      const jobRef = doc(db, printJobDocPath(cleanRestId, job.id));
      await setDoc(jobRef, {
        ...job,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch {
      // Offline mode or Firestore bypass - continue execution without failing print
    }

    // Execute Print via PrinterManager
    const result = await this.manager.executePrint(job, targetPrinter);

    // Log Audit Event
    await auditService.logEvent(cleanRestId, {
      actorUid: auth.currentUser?.uid || 'system',
      action: 'BILL_PRINTED' as any,
      entityType: 'order',
      entityId: order.id,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        printerId: targetPrinter.id,
        transport: targetPrinter.transport,
        success: result.success,
        isReprint: Boolean(options.isReprint)
      }
    });

    return result;
  }

  public async printKOT(
    restaurantId: string,
    kot: KOT,
    options: {
      printerId?: string;
      restaurantName?: string;
      orderNumber?: string;
      tableName?: string;
      orderType?: string;
    } = {}
  ): Promise<PrintResult> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) throw new Error('restaurantId is required');

    await enforcePermission(cleanRestId, 'print_kot');

    let targetPrinter: PrinterProfile | null = null;
    if (options.printerId) {
      targetPrinter = await this.getPrinterById(cleanRestId, options.printerId);
    }

    if (!targetPrinter) {
      const activeKotPrinters = await this.getActivePrintersForRole(cleanRestId, 'KOT');
      targetPrinter = activeKotPrinters[0] || { ...DEFAULT_BROWSER_PRINTER, restaurantId: cleanRestId };
    }

    const formattedDoc = formatKOTPrintDocument(kot, {
      paperWidth: targetPrinter.paperWidth,
      restaurantName: options.restaurantName,
      orderNumber: options.orderNumber,
      tableName: options.tableName,
      orderType: options.orderType
    });

    const idempotencyKey = `kot_print_${kot.id}_${Date.now()}`;

    const job: PrintJob = {
      id: `JOB-KOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      restaurantId: cleanRestId,
      printerId: targetPrinter.id,
      jobType: 'KOT',
      documentId: kot.id,
      payload: {
        title: formattedDoc.title,
        paperWidth: formattedDoc.paperWidth,
        characterWidth: formattedDoc.characterWidth,
        textLines: formattedDoc.textLines,
        htmlContent: formattedDoc.htmlContent,
        kotId: kot.id,
        kotNumber: kot.kotNumber
      },
      status: 'queued',
      attemptCount: 1,
      idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    try {
      const jobRef = doc(db, printJobDocPath(cleanRestId, job.id));
      await setDoc(jobRef, {
        ...job,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch {
      // Continue print on offline mode
    }

    const result = await this.manager.executePrint(job, targetPrinter);

    await auditService.logEvent(cleanRestId, {
      actorUid: auth.currentUser?.uid || 'system',
      action: 'KOT_PRINTED' as any,
      entityType: 'kot',
      entityId: kot.id,
      metadata: {
        kotId: kot.id,
        kotNumber: kot.kotNumber,
        printerId: targetPrinter.id,
        transport: targetPrinter.transport,
        success: result.success
      }
    });

    return result;
  }

  // -------------------------------------------------------------
  // Retry & Kitchen Routing Operations
  // -------------------------------------------------------------

  public async retryPrintJob(
    restaurantId: string,
    job: PrintJob,
    printer: PrinterProfile
  ): Promise<PrintResult> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) throw new Error('restaurantId is required');

    await enforcePermission(cleanRestId, 'access_printers');

    if ((job.attemptCount || 1) >= 3) {
      return {
        success: false,
        status: 'failed',
        error: `Maximum print retry attempts (3) reached for job ${job.id}`
      };
    }

    const updatedJob: PrintJob = {
      ...job,
      attemptCount: (job.attemptCount || 1) + 1,
      status: 'queued',
      updatedAt: new Date()
    };

    // Update Firestore if available
    try {
      const jobRef = doc(db, printJobDocPath(cleanRestId, updatedJob.id));
      await updateDoc(jobRef, {
        attemptCount: updatedJob.attemptCount,
        status: 'queued',
        updatedAt: serverTimestamp()
      });
    } catch {
      // Offline mode fallback
    }

    return this.manager.executePrint(updatedJob, printer);
  }

  public async printKitchenKOT(
    restaurantId: string,
    kot: KOT,
    options: {
      printerId?: string;
      restaurantName?: string;
      orderNumber?: string;
      tableName?: string;
      orderType?: string;
    } = {}
  ): Promise<PrintResult> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) throw new Error('restaurantId is required');

    let targetPrinter: PrinterProfile | null = null;
    if (options.printerId) {
      targetPrinter = await this.getPrinterById(cleanRestId, options.printerId);
    }

    if (!targetPrinter) {
      const kitchenPrinters = await this.getActivePrintersForRole(cleanRestId, 'KITCHEN');
      if (kitchenPrinters.length > 0 && kitchenPrinters[0].id !== 'browser-default') {
        targetPrinter = kitchenPrinters[0];
      } else {
        const kotPrinters = await this.getActivePrintersForRole(cleanRestId, 'KOT');
        targetPrinter = kotPrinters[0] || { ...DEFAULT_BROWSER_PRINTER, restaurantId: cleanRestId };
      }
    }

    return this.printKOT(cleanRestId, kot, { ...options, printerId: targetPrinter.id });
  }

  public async testPrint(restaurantId: string, printerId: string): Promise<PrintResult> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) throw new Error('restaurantId is required');

    await enforcePermission(cleanRestId, 'access_printers');

    const printer = await this.getPrinterById(cleanRestId, printerId);
    if (!printer) {
      throw new Error(`Printer "${printerId}" not found.`);
    }

    return this.manager.testPrint(printer);
  }
}

export const printerService = PrinterService.getInstance();
