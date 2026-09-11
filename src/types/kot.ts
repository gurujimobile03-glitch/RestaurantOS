import { OrderItemModifier } from './order';

export type KOTStatus =
  | 'draft'
  | 'confirmed'
  | 'sentToKitchen'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled';

export interface KOTItem {
  itemId: string;
  nameSnapshot: string;
  shortNameSnapshot?: string;
  quantity: number;
  notes?: string;
  modifiers?: OrderItemModifier[];
}

export interface KOT {
  id: string;
  kotNumber: string;
  restaurantId: string;
  orderId: string;
  tableId?: string | null;
  tableSessionId?: string | null;
  items: KOTItem[];
  notes?: string;
  status: KOTStatus;
  cancellationReason?: string | null;
  cancelledAt?: any;
  cancelledBy?: string | null;
  sentToKitchenAt?: any;
  preparingAt?: any;
  readyAt?: any;
  servedAt?: any;
  createdBy: string;
  updatedBy?: string | null;
  createdAt: any;
  updatedAt: any;
}
