import React, { useState, useEffect } from 'react';
import { Store, Building2, MapPin, Receipt, Globe, Save, CheckCircle2, AlertCircle, Plus, LayoutGrid, Check, Search } from 'lucide-react';
import { useRestaurant } from '../context/RestaurantContext';
import { useAuth } from '../context/AuthContext';
import { RestaurantFormData, TaxMode } from '../types/restaurant';
import { validateRestaurantSettings } from '../utils/validation';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { ImageUploader } from '../components/common/ImageUploader';
import { createRestaurantBranch } from '../services/restaurantService';
import { TableManagementSection } from '../components/restaurant/TableManagementSection';
import { PrinterSettingsSection } from '../components/restaurant/PrinterSettingsSection';
import { auditUserRestaurants, DuplicateAuditReport } from '../services/duplicateRestaurantAuditService';

const CURRENCY_OPTIONS = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (₹ INR)' },
  { code: 'USD', symbol: '$', label: 'US Dollar ($ USD)' },
  { code: 'EUR', symbol: '€', label: 'Euro (€ EUR)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (£ GBP)' },
  { code: 'AED', symbol: 'AED', label: 'UAE Dirham (AED)' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar (S$)' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar (CA$)' },
  { code: 'AUD', symbol: 'AU$', label: 'Australian Dollar (AU$)' }
];

export const RestaurantSetupPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { restaurant, updateSettings, loading, availableRestaurants, switchRestaurant, retry } = useRestaurant();
  const [formData, setFormData] = useState<RestaurantFormData>({
    name: '',
    legalName: '',
    logoUrl: null,
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
    gstNumber: '',
    currency: 'INR',
    currencySymbol: '₹',
    timezone: 'Asia/Kolkata',
    taxMode: 'exclusive',
    defaultTaxRate: 5.0
  });

  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // States for branch provisioning
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCity, setNewBranchCity] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [branchSuccess, setBranchSuccess] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);

  // States for duplicate restaurant audit
  const [auditReport, setAuditReport] = useState<DuplicateAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  useEffect(() => {
    if (restaurant) {
      setFormData({
        name: restaurant.name || '',
        legalName: restaurant.legalName || '',
        logoUrl: restaurant.logoUrl || null,
        phone: restaurant.phone || '',
        email: restaurant.email || '',
        address: restaurant.address || '',
        city: restaurant.city || '',
        state: restaurant.state || '',
        postalCode: restaurant.postalCode || '',
        country: restaurant.country || 'India',
        gstNumber: restaurant.gstNumber || '',
        currency: restaurant.currency || 'INR',
        currencySymbol: restaurant.currencySymbol || '₹',
        timezone: restaurant.timezone || 'Asia/Kolkata',
        taxMode: restaurant.taxMode || 'exclusive',
        defaultTaxRate: restaurant.defaultTaxRate !== undefined ? restaurant.defaultTaxRate : 5.0
      });
    }
    // Deliberately keyed on restaurantId only (not the whole `restaurant` object):
    // subscribeToRestaurant() emits a fresh object on every live update, and
    // depending on the full object here would wipe out in-progress edits
    // (e.g. mid-typing) whenever any realtime update arrives.
  }, [restaurant?.restaurantId]);

  const handleCurrencyChange = (code: string) => {
    const selected = CURRENCY_OPTIONS.find((c) => c.code === code);
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        currency: selected.code,
        currencySymbol: selected.symbol
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);
    setFieldErrors({});

    const validation = validateRestaurantSettings({
      name: formData.name,
      phone: formData.phone,
      email: formData.email,
      gstNumber: formData.gstNumber,
      defaultTaxRate: formData.defaultTaxRate
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      const firstError = Object.values(validation.errors)[0];
      setErrorMessage(firstError);
      return;
    }

    setIsSaving(true);
    try {
      await updateSettings(formData);
      setSuccessMessage('Restaurant profile and tax settings saved successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to save restaurant profile:', err);
      setErrorMessage(err.message || 'Failed to update restaurant settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !restaurant) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-600">Loading restaurant settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Restaurant Setup</h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure your outlet branding, physical location, GST registrations, and tax rules.
          </p>
        </div>

        <Button
          onClick={handleSubmit}
          variant="primary"
          size="md"
          isLoading={isSaving}
          leftIcon={<Save className="w-4 h-4" />}
        >
          Save Changes
        </Button>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Branding & General Identity */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <Store className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Brand & Contact Identity</h3>
              <p className="text-xs text-slate-500">How your restaurant appears to customers, bills, and thermal receipts</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Input
                label="Brand / Display Name"
                placeholder="e.g. Royal Spice Bistro"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={fieldErrors.name}
                required
              />

              <Input
                label="Legal Business Name"
                placeholder="e.g. Royal Spice Hospitality Pvt Ltd"
                value={formData.legalName}
                onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                helperText="Printed on official tax invoices and GST filings"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Official Phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  error={fieldErrors.phone}
                />
                <Input
                  label="Support / Billing Email"
                  type="email"
                  placeholder="billing@royalspice.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  error={fieldErrors.email}
                />
              </div>
            </div>

            <div>
              <ImageUploader
                label="Restaurant Logo"
                value={formData.logoUrl}
                onChange={(url) => setFormData({ ...formData, logoUrl: url })}
                folderPath={restaurant ? `restaurants/${restaurant.restaurantId}/logo` : 'restaurants/default/logo'}
              />
            </div>
          </div>
        </div>

        {/* Location / Physical Address */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <MapPin className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Physical Address</h3>
              <p className="text-xs text-slate-500">Store location printed on POS bills and kitchen tickets</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              label="Street Address / Premises"
              placeholder="Shop 12, Ground Floor, Phoenix Marketcity"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <Input
                label="City"
                placeholder="Bengaluru"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
              <Input
                label="State / Province"
                placeholder="Karnataka"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
              <Input
                label="Postal / PIN Code"
                placeholder="560001"
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
              />
              <Input
                label="Country"
                placeholder="India"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* GST & Tax Settings */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <Receipt className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">GST & Tax Rules</h3>
              <p className="text-xs text-slate-500">Applicable tax calculation behavior for bill settlements and receipts</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Input
              label="GSTIN / Tax Registration No."
              placeholder="29AAAAA0000A1Z5"
              value={formData.gstNumber}
              onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
              error={fieldErrors.gstNumber}
              helperText="15-character Indian GSTIN or business tax code"
            />

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Tax Calculation Mode
              </label>
              <select
                value={formData.taxMode}
                onChange={(e) => setFormData({ ...formData, taxMode: e.target.value as TaxMode })}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
              >
                <option value="exclusive">Exclusive (Added on top of item price)</option>
                <option value="inclusive">Inclusive (Included in item display price)</option>
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Most fine dine/QSR in India charge 5% exclusive GST.
              </p>
            </div>

            <div>
              <Input
                label="Default GST / Tax Rate (%)"
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="5.0"
                value={formData.defaultTaxRate}
                onChange={(e) => setFormData({ ...formData, defaultTaxRate: Number(e.target.value) })}
                error={fieldErrors.defaultTaxRate}
                helperText="Standard restaurant rate: 5% (2.5% CGST + 2.5% SGST)"
              />
            </div>
          </div>
        </div>

        {/* Currency & Regional Localization */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <Globe className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Currency & Regional Settings</h3>
              <p className="text-xs text-slate-500">Formatting for monetary balances, decimal places, and time stamping</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Billing Currency
              </label>
              <select
                value={formData.currency}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Operating Timezone"
              placeholder="Asia/Kolkata"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              helperText="E.g. Asia/Kolkata, UTC, America/New_York"
            />
          </div>
        </div>

        {/* Action Button Footer */}
        <div className="flex items-center justify-end gap-4 pt-4">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSaving}
            leftIcon={<Save className="w-5 h-5" />}
          >
            Save Restaurant Configuration
          </Button>
        </div>
      </form>

      {/* Table Management Console */}
      <TableManagementSection />

      {/* Printer & Hardware Console */}
      <PrinterSettingsSection />

      {/* Organization & Outlet Console */}
      {profile?.role === 'owner' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Multi-Outlet Organization Console</h3>
              <p className="text-xs text-slate-500">View, switch, and provision new branches or outlets under your account</p>
            </div>
          </div>

          {/* Current Outlets Grid */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Your Outlets ({availableRestaurants.length})</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {availableRestaurants.map((res) => {
                const isActive = res.restaurantId === restaurant?.restaurantId;
                return (
                  <div 
                    key={res.restaurantId}
                    className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                      isActive 
                        ? 'border-indigo-500 bg-indigo-50/20 shadow-xs' 
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-bold text-slate-900 truncate">{res.name}</h4>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold">
                            <Check className="w-2.5 h-2.5" /> Active Context
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{res.city || 'Pune'}, {res.country || 'India'}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-2">ID: {res.restaurantId.substring(0, 12)}...</p>
                    </div>

                    {!isActive && (
                      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                        <button
                          type="button"
                          onClick={() => switchRestaurant(res.restaurantId)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          Switch to this Outlet →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Provision New Outlet Form */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 mt-6">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-600" />
              Provision New Outlet
            </h4>
            <p className="text-xs text-slate-500 mb-4">Instantly instantiate a new, isolated restaurant branch context with its own independent menu, KOT, tables, and staff members.</p>

            {branchSuccess && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{branchSuccess}</span>
              </div>
            )}

            {branchError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-semibold">{branchError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Branch/Outlet Name</label>
                <input
                  type="text"
                  placeholder="e.g. Royal Spice (Downtown)"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">City</label>
                <input
                  type="text"
                  placeholder="e.g. Mumbai"
                  value={newBranchCity}
                  onChange={(e) => setNewBranchCity(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  if (!user) return;
                  if (!newBranchName.trim() || !newBranchCity.trim()) {
                    setBranchError('Please fill in all fields.');
                    return;
                  }
                  setIsProvisioning(true);
                  setBranchSuccess(null);
                  setBranchError(null);
                  try {
                    console.log('[RestaurantOS Debug] Provisioning new branch:', newBranchName);
                    const newRest = await createRestaurantBranch(user.uid, user.email || '', newBranchName, newBranchCity);
                    setBranchSuccess(`Successfully provisioned "${newRest.name}" outlet!`);
                    setNewBranchName('');
                    setNewBranchCity('');
                    retry();
                  } catch (err: any) {
                    console.error('[RestaurantOS Debug] Failed to provision branch:', err);
                    setBranchError(err.message || 'Failed to provision branch.');
                  } finally {
                    setIsProvisioning(false);
                  }
                }}
                variant="primary"
                size="sm"
                isLoading={isProvisioning}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                {isProvisioning ? 'Provisioning...' : 'Provision Branch Outlet'}
              </Button>
            </div>
          </div>

          {/* Safe Duplicate Documents Audit Console */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 mt-6">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-indigo-600" />
                  Duplicate Document Safety Audit Console
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">Inspect all restaurant documents associated with your owner account and view an activity audit report. (Read-only; zero data deleted).</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={isAuditing}
                onClick={async () => {
                  if (!user) return;
                  setIsAuditing(true);
                  try {
                    const report = await auditUserRestaurants(user.uid);
                    setAuditReport(report);
                  } catch (err) {
                    console.error('Audit failed:', err);
                  } finally {
                    setIsAuditing(false);
                  }
                }}
              >
                {isAuditing ? 'Auditing...' : 'Run Audit'}
              </Button>
            </div>

            {auditReport && (
              <div className="mt-4 space-y-3 bg-white p-4 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 font-bold text-slate-700">
                  <span>Total Documents Found: {auditReport.totalRestaurantsFound}</span>
                  <span>Duplicates Identified: {auditReport.duplicateCandidateIds.length}</span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {auditReport.summaries.map((s) => (
                    <div
                      key={s.restaurantId}
                      className={`p-3 rounded-lg border ${
                        s.isPrimaryCandidate
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-rose-50/50 border-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-slate-900">{s.name} ({s.restaurantId})</span>
                        <span className={s.isPrimaryCandidate ? 'text-emerald-700' : 'text-rose-700'}>
                          {s.isPrimaryCandidate ? 'Primary Outlet' : 'Duplicate Candidate'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">{s.classificationReason}</p>
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        Orders: {s.counts.orders} | KOTs: {s.counts.kots} | Items: {s.counts.menuItems} | Tables: {s.counts.tables} | Members: {s.counts.members} | Score: {s.totalActivityScore}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
