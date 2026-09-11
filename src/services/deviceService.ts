import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { DeviceMetadata, DeviceType, DeviceOperationalStatus } from '../types/deviceSession';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { sanitizeFirestoreData } from '../utils/sanitize';

const DEVICE_ID_STORAGE_KEY = 'restaurantos_device_id';
const DEVICE_NAME_STORAGE_KEY = 'restaurantos_device_name';
const DEVICE_TYPE_STORAGE_KEY = 'restaurantos_device_type';

/**
 * DeviceService
 * 
 * Centralized Device Registration, Heartbeat, and Multi-Device Awareness Service.
 * 
 * CRITICAL ARCHITECTURAL & SECURITY INVARIANTS:
 * 1. Operational Awareness Only: Device and session metadata is strictly for operational visibility,
 *    telemetry, active station discovery, and audit trail correlation.
 * 2. Non-Authoritative Identity: A device ID or session ID NEVER grants authorization or privilege escalation.
 *    Server-side Firebase Authentication (auth.uid) and Firestore security rules remain strictly authoritative.
 * 3. Multi-Tenant Scoping: Device records are strictly isolated under `restaurants/{restaurantId}/devices/{deviceId}`.
 * 4. Deterministic Hardware/Browser Binding: Local device ID is generated once and stored in localStorage.
 */
export class DeviceService {
  /**
   * Retrieves or creates a stable device identifier for the current browser/hardware client.
   */
  public getOrCreateDeviceId(): string {
    if (typeof localStorage === 'undefined') {
      return `dev_ssr_${Date.now()}`;
    }

    let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId || deviceId.trim() === '') {
      deviceId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      try {
        localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
      } catch (err) {
        console.warn('[DeviceService] Failed to persist deviceId to localStorage:', err);
      }
    }
    return deviceId;
  }

  /**
   * Retrieves or determines device name from storage or defaults.
   */
  public getStoredDeviceName(): string {
    if (typeof localStorage === 'undefined') return 'Primary Terminal';
    return localStorage.getItem(DEVICE_NAME_STORAGE_KEY) || 'Primary Terminal';
  }

  /**
   * Retrieves stored device type preference (e.g. 'pos', 'captain', 'kitchen').
   */
  public getStoredDeviceType(): DeviceType {
    if (typeof localStorage === 'undefined') return 'pos';
    const stored = localStorage.getItem(DEVICE_TYPE_STORAGE_KEY) as DeviceType;
    return stored || 'pos';
  }

  /**
   * Constructs the local device metadata snapshot.
   */
  public getDeviceMetadata(restaurantId: string = '', overrideType?: DeviceType): DeviceMetadata {
    const deviceId = this.getOrCreateDeviceId();
    const deviceName = this.getStoredDeviceName();
    const deviceType = overrideType || this.getStoredDeviceType();
    const platform = typeof navigator !== 'undefined' ? navigator.platform || 'web' : 'web';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
    const now = Date.now();

    return {
      deviceId,
      deviceName,
      deviceType,
      restaurantId: restaurantId.trim(),
      platform,
      appVersion: '1.0.0',
      registeredAt: now,
      lastActiveAt: now,
      userAgent,
      isActive: true,
      status: 'online',
      currentUserId: auth.currentUser?.uid || null
    };
  }

  /**
   * Sets and persists the device name locally and optionally updates Firestore.
   */
  public async updateDeviceName(restaurantId: string, newName: string): Promise<void> {
    const cleanName = newName?.trim() || 'Terminal';
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(DEVICE_NAME_STORAGE_KEY, cleanName);
      } catch {}
    }

    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return;

    const deviceId = this.getOrCreateDeviceId();
    try {
      const docRef = doc(db, 'restaurants', cleanRestId, 'devices', deviceId);
      await updateDoc(docRef, {
        deviceName: cleanName,
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('[DeviceService] Failed to update device name in Firestore:', err);
    }
  }

  /**
   * Sets and persists the device type preference locally.
   */
  public setDeviceType(newType: DeviceType): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(DEVICE_TYPE_STORAGE_KEY, newType);
      } catch {}
    }
  }

  /**
   * Registers or updates this device in the restaurant's operational device registry.
   */
  public async registerDevice(
    restaurantId: string,
    metadataOverrides?: Partial<DeviceMetadata>
  ): Promise<DeviceMetadata> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      throw new Error('Valid restaurantId is required to register a device.');
    }

    const localMeta = this.getDeviceMetadata(cleanRestId, metadataOverrides?.deviceType);
    const merged: DeviceMetadata = {
      ...localMeta,
      ...metadataOverrides,
      restaurantId: cleanRestId,
      currentUserId: auth.currentUser?.uid || null,
      lastActiveAt: Date.now()
    };

    try {
      const docRef = doc(db, 'restaurants', cleanRestId, 'devices', merged.deviceId);
      const docPayload = sanitizeFirestoreData({
        ...merged,
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await setDoc(docRef, docPayload, { merge: true });
      return merged;
    } catch (err) {
      console.warn('[DeviceService] Failed to register device in Firestore (non-fatal):', err);
      return merged;
    }
  }

  /**
   * Sends an operational heartbeat to indicate the station is online and responsive.
   */
  public async sendHeartbeat(restaurantId: string, status: DeviceOperationalStatus = 'online'): Promise<void> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return;

    const deviceId = this.getOrCreateDeviceId();
    try {
      const docRef = doc(db, 'restaurants', cleanRestId, 'devices', deviceId);
      await updateDoc(docRef, {
        status,
        isActive: status !== 'inactive',
        lastActiveAt: serverTimestamp(),
        currentUserId: auth.currentUser?.uid || null,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      // Non-fatal background ping
    }
  }

  /**
   * Subscribes to all active operational devices for a restaurant (for station awareness dashboards).
   */
  public subscribeToActiveDevices(
    restaurantId: string,
    onUpdate: (devices: DeviceMetadata[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      onUpdate([]);
      return () => {};
    }

    try {
      const colRef = collection(db, 'restaurants', cleanRestId, 'devices');
      const q = query(colRef, where('isActive', '==', true));

      return onSnapshot(
        q,
        (snapshot) => {
          const devices: DeviceMetadata[] = [];
          snapshot.forEach((d) => {
            devices.push({ deviceId: d.id, ...d.data() } as DeviceMetadata);
          });
          onUpdate(devices);
        },
        (err) => {
          if (!auth.currentUser) return;
          const errCode = (err as any)?.code;
          if (errCode === 'permission-denied' || errCode === 'unavailable') {
            console.warn('[DeviceService] Devices subscription notice:', (err as any)?.message);
            onUpdate([]);
          } else {
            console.error('[DeviceService] Devices subscription error:', err);
          }
          if (onError) onError(err as Error);
        }
      );
    } catch (err: any) {
      console.warn('[DeviceService] Devices subscription setup notice:', err?.message);
      onUpdate([]);
      return () => {};
    }
  }

}

export const deviceService = new DeviceService();
