import React from 'react';
import { AuditLogPanel } from '../components/audit/AuditLogPanel';

export const AuditPage: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AuditLogPanel />
    </div>
  );
};
