export type TaxMode = 'exclusive' | 'inclusive';

export type ProvisioningType = 'initial_owner' | 'explicit_outlet';

export interface Restaurant {
  restaurantId: string;
  name: string;
  legalName: string;
  logoUrl: string | null;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstNumber: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
  taxMode: TaxMode;
  defaultTaxRate: number;
  ownerId: string;
  provisioningType?: ProvisioningType;
  createdBy?: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export type RestaurantFormData = Omit<Restaurant, 'restaurantId' | 'ownerId' | 'createdAt' | 'updatedAt' | 'isActive'>;
