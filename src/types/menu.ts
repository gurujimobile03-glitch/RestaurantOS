export type FoodType = 'veg' | 'nonVeg' | 'egg' | 'other';

export interface Category {
  categoryId: string;
  restaurantId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export type CategoryFormData = {
  name: string;
  description: string;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};

export interface MenuItem {
  itemId: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  shortName: string;
  description: string;
  imageUrl: string | null;
  price: number;
  taxRate: number;
  taxInclusive: boolean;
  foodType: FoodType;
  isAvailable: boolean;
  sku: string;
  sortOrder: number;
  createdAt?: any;
  updatedAt?: any;
}

export type MenuItemFormData = {
  categoryId: string;
  name: string;
  shortName: string;
  description: string;
  imageUrl: string | null;
  price: number;
  taxRate: number;
  taxInclusive: boolean;
  foodType: FoodType;
  isAvailable: boolean;
  sku: string;
  sortOrder: number;
};
