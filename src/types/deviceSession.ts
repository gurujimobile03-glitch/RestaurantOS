import { StaffRole } from './auth';

export type DeviceType = 'pos' | 'captain' | 'kitchen' | 'manager' | 'admin' | 'kiosk' | 'other';

export type DeviceOperationalStatus = 'online' | 'offline' | 'idle' | 'inactive';

export interface DeviceMetadata {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  restaurantId: string;
  platform: string;
  appVersion: string;
  registeredAt: number | string;
  lastActiveAt: number | string;
  userAgent?: string;
  ipHint?: string;
  isActive: boolean;
  status: DeviceOperationalStatus;
  currentUserId?: string | null;
  currentStaffRole?: StaffRole | null;
}

export interface DeviceSession {
  sessionId: string;
  deviceId: string;
  userId: string;
  restaurantId: string;
  role: StaffRole;
  startedAt: number;
  lastPingAt: number;
  isActive: boolean;
}

export type SyncConflictStatus =
  | 'SYNCED'
  | 'SYNCING'
  | 'OFFLINE'
  | 'RETRYING'
  | 'CONFLICT'
  | 'FAILED'
  | 'STALE';

export type ConflictResolutionStrategy =
  | 'server_wins'
  | 'discard'
  | 'retry_with_refresh';
