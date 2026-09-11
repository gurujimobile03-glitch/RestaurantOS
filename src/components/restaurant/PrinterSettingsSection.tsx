import React, { useState, useEffect } from 'react';
import {
  Printer,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Wifi,
  Bluetooth,
  Usb,
  Smartphone,
  Globe,
  FileText,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { useRestaurant } from '../../context/RestaurantContext';
import { printerService } from '../../services/printer/PrinterService';
import { PrinterProfile, PrinterRole, PrinterTransport, PaperWidth } from '../../types/printer';

export const PrinterSettingsSection: React.FC = () => {
  const { restaurant } = useRestaurant();
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formRoles, setFormRoles] = useState<PrinterRole[]>(['BILL']);
  const [formTransport, setFormTransport] = useState<PrinterTransport>('browser');
  const [formPaperWidth, setFormPaperWidth] = useState<PaperWidth>('80mm');
  const [formIpAddress, setFormIpAddress] = useState('');
  const [formPort, setFormPort] = useState(9100);
  const [formBluetoothDeviceId, setFormBluetoothDeviceId] = useState('');
  const [formUsbVendorId, setFormUsbVendorId] = useState('');
  const [formUsbProductId, setFormUsbProductId] = useState('');
  const [formBridgeUrl, setFormBridgeUrl] = useState('');
  const [formAndroidIntentAction, setFormAndroidIntentAction] = useState('com.restaurantos.PRINT');
  const [formIsActive, setFormIsActive] = useState(true);

  // Test Print State
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ printerId: string; success: boolean; msg: string } | null>(null);

  const loadPrinters = async () => {
    if (!restaurant?.restaurantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await printerService.getPrinters(restaurant.restaurantId);
      setPrinters(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load printers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrinters();
  }, [restaurant?.restaurantId]);

  const resetForm = () => {
    setFormName('');
    setFormRoles(['BILL']);
    setFormTransport('browser');
    setFormPaperWidth('80mm');
    setFormIpAddress('');
    setFormPort(9100);
    setFormBluetoothDeviceId('');
    setFormUsbVendorId('');
    setFormUsbProductId('');
    setFormBridgeUrl('');
    setFormAndroidIntentAction('com.restaurantos.PRINT');
    setFormIsActive(true);
    setEditingPrinter(null);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: PrinterProfile) => {
    setEditingPrinter(p);
    setFormName(p.name);
    setFormRoles(p.roles || ['BILL']);
    setFormTransport(p.transport);
    setFormPaperWidth(p.paperWidth);
    setFormIpAddress(p.connectionConfig.ipAddress || '');
    setFormPort(p.connectionConfig.port || 9100);
    setFormBluetoothDeviceId(p.connectionConfig.bluetoothDeviceId || '');
    setFormUsbVendorId(p.connectionConfig.usbVendorId ? String(p.connectionConfig.usbVendorId) : '');
    setFormUsbProductId(p.connectionConfig.usbProductId ? String(p.connectionConfig.usbProductId) : '');
    setFormBridgeUrl(p.connectionConfig.bridgeUrl || '');
    setFormAndroidIntentAction(p.connectionConfig.androidIntentAction || 'com.restaurantos.PRINT');
    setFormIsActive(p.isActive);
    setIsModalOpen(true);
  };

  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant?.restaurantId) return;
    if (!formName.trim()) {
      setError('Printer name is required.');
      return;
    }
    if (formRoles.length === 0) {
      setError('Please select at least one role (BILL, KOT, or KITCHEN).');
      return;
    }

    setIsSaving(true);
    setError(null);

    const connectionConfig = {
      ...(formIpAddress ? { ipAddress: formIpAddress.trim() } : {}),
      port: Number(formPort) || 9100,
      ...(formBluetoothDeviceId ? { bluetoothDeviceId: formBluetoothDeviceId.trim() } : {}),
      ...(formUsbVendorId ? { usbVendorId: Number(formUsbVendorId) } : {}),
      ...(formUsbProductId ? { usbProductId: Number(formUsbProductId) } : {}),
      ...(formBridgeUrl ? { bridgeUrl: formBridgeUrl.trim() } : {}),
      ...(formAndroidIntentAction ? { androidIntentAction: formAndroidIntentAction.trim() } : {})
    };

    try {
      if (editingPrinter && editingPrinter.id !== 'browser-default') {
        await printerService.updatePrinter(restaurant.restaurantId, editingPrinter.id, {
          name: formName.trim(),
          roles: formRoles,
          transport: formTransport,
          paperWidth: formPaperWidth,
          characterWidth: formPaperWidth === '58mm' ? 32 : 48,
          connectionConfig,
          isActive: formIsActive
        });
        setSuccessMsg(`Printer "${formName}" updated successfully.`);
      } else {
        await printerService.createPrinter(restaurant.restaurantId, {
          name: formName.trim(),
          roles: formRoles,
          transport: formTransport,
          paperWidth: formPaperWidth,
          characterWidth: formPaperWidth === '58mm' ? 32 : 48,
          connectionConfig,
          isActive: formIsActive
        });
        setSuccessMsg(`Printer "${formName}" created successfully.`);
      }

      setIsModalOpen(false);
      resetForm();
      await loadPrinters();
    } catch (err: any) {
      setError(err.message || 'Failed to save printer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePrinter = async (p: PrinterProfile) => {
    if (!restaurant?.restaurantId) return;
    if (p.id === 'browser-default') {
      alert('The default Browser Print profile cannot be deleted.');
      return;
    }
    if (!confirm(`Are you sure you want to delete printer "${p.name}"?`)) return;

    try {
      await printerService.deletePrinter(restaurant.restaurantId, p.id);
      setSuccessMsg(`Printer "${p.name}" removed.`);
      await loadPrinters();
    } catch (err: any) {
      setError(err.message || 'Failed to delete printer');
    }
  };

  const handleTestPrint = async (p: PrinterProfile) => {
    if (!restaurant?.restaurantId) return;
    setTestingPrinterId(p.id);
    setTestResult(null);

    try {
      const res = await printerService.testPrint(restaurant.restaurantId, p.id);
      if (res.success) {
        setTestResult({
          printerId: p.id,
          success: true,
          msg: `Test print successful (${res.status})`
        });
      } else {
        setTestResult({
          printerId: p.id,
          success: false,
          msg: res.error || 'Test print failed'
        });
      }
    } catch (err: any) {
      setTestResult({
        printerId: p.id,
        success: false,
        msg: err.message || 'Test print execution failed'
      });
    } finally {
      setTestingPrinterId(null);
    }
  };

  const getTransportIcon = (transport: PrinterTransport) => {
    switch (transport) {
      case 'lan':
      case 'wifi':
        return <Wifi className="w-4 h-4 text-emerald-500" />;
      case 'bluetooth':
        return <Bluetooth className="w-4 h-4 text-blue-500" />;
      case 'usb':
        return <Usb className="w-4 h-4 text-purple-500" />;
      case 'android_native':
        return <Smartphone className="w-4 h-4 text-amber-500" />;
      case 'browser':
      default:
        return <Globe className="w-4 h-4 text-indigo-500" />;
    }
  };

  const toggleRoleInForm = (role: PrinterRole) => {
    if (formRoles.includes(role)) {
      if (formRoles.length > 1) {
        setFormRoles(formRoles.filter((r) => r !== role));
      }
    } else {
      setFormRoles([...formRoles, role]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Printer & Hardware Configuration</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage thermal receipt printers, kitchen KOT printers, and hardware transports (Browser, LAN, Bluetooth, USB).
            </p>
          </div>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Hardware Printer
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="p-1 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Printers List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>Active Printer Profiles</span>
            <span className="text-xs font-normal text-slate-400">({printers.length})</span>
          </h3>
          <button
            onClick={loadPrinters}
            disabled={isLoading}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Refresh printer list"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
            Loading printer hardware profiles...
          </div>
        ) : printers.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            No custom hardware printers configured. Using Browser Print fallback.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {printers.map((p) => {
              const isDefaultBrowser = p.id === 'browser-default';
              const isTestingThis = testingPrinterId === p.id;
              const hasTestResult = testResult?.printerId === p.id;

              return (
                <div
                  key={p.id}
                  className={`p-5 rounded-xl border transition-all ${
                    p.isActive
                      ? 'bg-slate-800/60 border-slate-700/80'
                      : 'bg-slate-900/40 border-slate-800/60 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getTransportIcon(p.transport)}
                        <span className="font-bold text-white text-base">{p.name}</span>
                        {isDefaultBrowser && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            SYSTEM DEFAULT
                          </span>
                        )}
                      </div>

                      {/* Connection metadata summary */}
                      <p className="text-xs text-slate-400 font-mono">
                        {p.transport === 'browser' && 'System Print Dialog (Native Window)'}
                        {p.transport === 'lan' && `IP: ${p.connectionConfig.ipAddress || 'Not set'}:${p.connectionConfig.port || 9100}`}
                        {p.transport === 'bluetooth' && `BT Device: ${p.connectionConfig.bluetoothDeviceId || 'Pairing'}`}
                        {p.transport === 'usb' && `USB VID: ${p.connectionConfig.usbVendorId || 'Auto'}, PID: ${p.connectionConfig.usbProductId || 'Auto'}`}
                        {p.transport === 'android_native' && `Intent: ${p.connectionConfig.androidIntentAction || 'com.restaurantos.PRINT'}`}
                      </p>
                    </div>

                    {!isDefaultBrowser && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleOpenEditModal(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                          title="Edit printer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePrinter(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition-colors"
                          title="Delete printer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-700/50">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Roles:
                    </span>
                    {p.roles.map((r) => (
                      <span
                        key={r}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          r === 'BILL'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : r === 'KOT'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}
                      >
                        {r}
                      </span>
                    ))}

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600">
                      {p.paperWidth} ({p.characterWidth} chars)
                    </span>
                  </div>

                  {/* Test Result Message */}
                  {hasTestResult && (
                    <div
                      className={`mt-3 p-2.5 rounded-lg text-xs font-medium flex items-center justify-between ${
                        testResult.success
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>{testResult.msg}</span>
                      </div>
                      <button onClick={() => setTestResult(null)} className="p-0.5 hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                    <span className={`text-[11px] font-semibold inline-flex items-center gap-1.5 ${p.isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${p.isActive ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      {p.isActive ? 'Active Hardware' : 'Disabled'}
                    </span>

                    <button
                      onClick={() => handleTestPrint(p)}
                      disabled={isTestingThis}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {isTestingThis ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                      {isTestingThis ? 'Printing Test...' : 'Test Print'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Printer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 text-white space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-400" />
                <span>{editingPrinter ? 'Edit Printer Profile' : 'Configure New Printer'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePrinter} className="space-y-4">
              {/* Printer Name */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Printer Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Main Cashier Thermal 80mm"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {/* Roles Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Printer Roles
                </label>
                <div className="flex items-center gap-3">
                  {(['BILL', 'KOT', 'KITCHEN'] as PrinterRole[]).map((role) => {
                    const isSelected = formRoles.includes(role);
                    return (
                      <button
                        type="button"
                        key={role}
                        onClick={() => toggleRoleInForm(role)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transport Type */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Transport Hardware
                </label>
                <select
                  value={formTransport}
                  onChange={(e) => setFormTransport(e.target.value as PrinterTransport)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="browser">Browser Native Print (System Fallback)</option>
                  <option value="lan">LAN / Wi-Fi Network (TCP / HTTP)</option>
                  <option value="bluetooth">Bluetooth Thermal Printer (GATT / Serial)</option>
                  <option value="usb">USB Thermal Printer (WebUSB)</option>
                  <option value="android_native">Android Native Print Intent</option>
                </select>
              </div>

              {/* Paper Width */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Paper Roll Width
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormPaperWidth('80mm')}
                    className={`p-3 rounded-xl border text-center font-bold text-xs transition-colors ${
                      formPaperWidth === '80mm'
                        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    <div>80mm (Standard)</div>
                    <div className="text-[10px] font-normal text-slate-400 mt-0.5">48 characters / line</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormPaperWidth('58mm')}
                    className={`p-3 rounded-xl border text-center font-bold text-xs transition-colors ${
                      formPaperWidth === '58mm'
                        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    <div>58mm (Compact)</div>
                    <div className="text-[10px] font-normal text-slate-400 mt-0.5">32 characters / line</div>
                  </button>
                </div>
              </div>

              {/* Dynamic Connection Parameters */}
              {(formTransport === 'lan' || formTransport === 'wifi') && (
                <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/80">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Printer IP Address
                    </label>
                    <input
                      type="text"
                      value={formIpAddress}
                      onChange={(e) => setFormIpAddress(e.target.value)}
                      placeholder="192.168.1.200"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      value={formPort}
                      onChange={(e) => setFormPort(Number(e.target.value))}
                      placeholder="9100"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white"
                    />
                  </div>
                </div>
              )}

              {formTransport === 'bluetooth' && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">
                    Bluetooth Device ID / MAC Address
                  </label>
                  <input
                    type="text"
                    value={formBluetoothDeviceId}
                    onChange={(e) => setFormBluetoothDeviceId(e.target.value)}
                    placeholder="e.g., 00:11:22:33:44:55 or BT-PRINTER-01"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white"
                  />
                </div>
              )}

              {formTransport === 'usb' && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/80">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      USB Vendor ID (Hex / Dec)
                    </label>
                    <input
                      type="text"
                      value={formUsbVendorId}
                      onChange={(e) => setFormUsbVendorId(e.target.value)}
                      placeholder="e.g. 0x04b8"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      USB Product ID
                    </label>
                    <input
                      type="text"
                      value={formUsbProductId}
                      onChange={(e) => setFormUsbProductId(e.target.value)}
                      placeholder="e.g. 0x0e15"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white"
                    />
                  </div>
                </div>
              )}

              {formTransport === 'android_native' && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">
                    Android Intent Action
                  </label>
                  <input
                    type="text"
                    value={formAndroidIntentAction}
                    onChange={(e) => setFormAndroidIntentAction(e.target.value)}
                    placeholder="com.restaurantos.PRINT"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white"
                  />
                </div>
              )}

              {/* Optional Local Print Bridge URL */}
              {formTransport !== 'browser' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Local Print Bridge Agent URL (Optional)
                  </label>
                  <input
                    type="text"
                    value={formBridgeUrl}
                    onChange={(e) => setFormBridgeUrl(e.target.value)}
                    placeholder="http://localhost:9100 or http://192.168.1.50:8080"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono text-white"
                  />
                </div>
              )}

              {/* Active Toggle */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Enable Hardware Printer
                </span>
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingPrinter ? 'Update Printer' : 'Save Printer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
