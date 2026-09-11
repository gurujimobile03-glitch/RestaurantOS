import { Timestamp } from 'firebase/firestore';

export interface Supplier {
  supplierId: string;
  restaurantId: string;
  name: string;
  normalizedName: string;
  phone: string;
  email?: string;
  address?: string;
  gstNumber?: string;
  contactPerson?: string;
  notes?: string;
  active: boolean;
  createdAt: Timestamp | any;
  updatedAt: Timestamp | any;
  createdBy: string;
  updatedBy: string;
}

export interface CreateSupplierDTO {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  gstNumber?: string;
  contactPerson?: string;
  notes?: string;
}

export interface UpdateSupplierDTO {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNumber?: string;
  contactPerson?: string;
  notes?: string;
  active?: boolean;
}

export interface SupplierQueryOptions {
  activeOnly?: boolean;
  search?: string;
}
