import React from 'react';
import { InventoryManagement } from '../components/inventory/InventoryManagement';

export const InventoryPage: React.FC = () => {
  return (
    <div id="inventory-page-container" className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <InventoryManagement />
    </div>
  );
};
