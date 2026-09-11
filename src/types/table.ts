/**
 * Table and TableSession models for RestaurantOS.
 */

export interface Table {
  id: string;
  restaurantId: string;
  name: string;
  tableNumber: string;
  floorOrArea: string;
  capacity: number;
  isActive: boolean;
  sortOrder: number;
  activeSessionId?: string | null;
  createdAt: any;
  updatedAt: any;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export type TableFormData = {
  name: string;
  tableNumber: string;
  floorOrArea: string;
  capacity: number;
  isActive: boolean;
  sortOrder: number;
};

export type TableSessionStatus = 'open' | 'closed';

export interface TableSession {
  id: string;
  restaurantId: string;
  tableId: string;
  status: TableSessionStatus;
  guestCount: number;
  openedAt: any;
  closedAt?: any | null;
  activeOrderIds: string[];
  openedBy: string;
  closedBy?: string | null;
  createdAt: any;
  updatedAt: any;
}
