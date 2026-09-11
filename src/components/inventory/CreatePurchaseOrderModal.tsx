import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Plus,
  Trash2,
  AlertCircle,
  Building2,
  Calendar,
  IndianRupee
} from 'lucide-react';
import { Supplier } from '../../types/supplier';
import { InventoryItem, InventoryUnit } from '../../types/inventory';
import { CreatePurchaseOrderDTO, CreatePurchaseOrderItemDTO } from '../../types/purchaseOrder';
import { supplierService } from '../../services/supplierService';
import { inventoryService } from '../../services/inventoryService';
import { formatMoney, toMoneyMinor, multiplyMoney, addMoney, percentageOfMoney } from '../../utils/money';
import { roundQuantity, SUPPORTED_UNITS } from '../../utils/units';

interface CreatePurchaseOrderModalProps {
  restaurantId: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreatePurchaseOrderDTO) => Promise<void>;
}

interface DraftLineItem {
  id: string;
  inventoryItemId: string;
  unit: InventoryUnit;
  quantityOrdered: number;
  unitPriceRupees: number; // For user input, converted to minor on submit
}

export const CreatePurchaseOrderModal: React.FC<CreatePurchaseOrderModalProps> = ({
  restaurantId,
  isOpen,
  onClose,
  onSubmit
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [taxRatePercent, setTaxRatePercent] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const loadPrerequisites = async () => {
      try {
        setFetching(true);
        setError(null);
        const [sups, items] = await Promise.all([
          supplierService.getSuppliers(restaurantId, { activeOnly: true }),
          inventoryService.listInventoryItems(restaurantId, { activeOnly: true })
        ]);
        setSuppliers(sups);
        setInventoryItems(items);
        if (sups.length > 0) {
          setSelectedSupplierId(sups[0].supplierId);
        }
        // Initialize with 1 empty line item
        if (items.length > 0) {
          setLineItems([
            {
              id: `draft_${Date.now()}_1`,
              inventoryItemId: items[0].id,
              unit: items[0].unit,
              quantityOrdered: 1,
              unitPriceRupees: items[0].costPerUnitPaise ? items[0].costPerUnitPaise / 100 : 0
            }
          ]);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load suppliers or inventory items');
      } finally {
        setFetching(false);
      }
    };

    loadPrerequisites();
  }, [restaurantId, isOpen]);

  if (!isOpen) return null;

  const handleAddItemLine = () => {
    if (inventoryItems.length === 0) return;
    const defaultItem = inventoryItems[0];
    setLineItems(prev => [
      ...prev,
      {
        id: `draft_${Date.now()}_${prev.length + 1}`,
        inventoryItemId: defaultItem.id,
        unit: defaultItem.unit,
        quantityOrdered: 1,
        unitPriceRupees: defaultItem.costPerUnitPaise ? defaultItem.costPerUnitPaise / 100 : 0
      }
    ]);
  };

  const handleRemoveLine = (id: string) => {
    setLineItems(prev => prev.filter(l => l.id !== id));
  };

  const handleItemChange = (lineId: string, inventoryItemId: string) => {
    const item = inventoryItems.find(i => i.id === inventoryItemId);
    if (!item) return;
    setLineItems(prev =>
      prev.map(l => {
        if (l.id !== lineId) return l;
        return {
          ...l,
          inventoryItemId,
          unit: item.unit,
          unitPriceRupees: item.costPerUnitPaise ? item.costPerUnitPaise / 100 : l.unitPriceRupees
        };
      })
    );
  };

  const handleQuantityChange = (lineId: string, qty: number) => {
    setLineItems(prev =>
      prev.map(l => (l.id === lineId ? { ...l, quantityOrdered: qty } : l))
    );
  };

  const handlePriceChange = (lineId: string, price: number) => {
    setLineItems(prev =>
      prev.map(l => (l.id === lineId ? { ...l, unitPriceRupees: price } : l))
    );
  };

  const handleUnitChange = (lineId: string, unit: InventoryUnit) => {
    setLineItems(prev =>
      prev.map(l => (l.id === lineId ? { ...l, unit } : l))
    );
  };

  // Live Totals Calculation in integer paise
  const lineCalculations = lineItems.map(line => {
    const qty = roundQuantity(line.quantityOrdered || 0);
    let unitPriceMinor = 0;
    try {
      unitPriceMinor = toMoneyMinor(Math.max(0, line.unitPriceRupees || 0));
    } catch {
      unitPriceMinor = 0;
    }
    const lineTotalMinor = multiplyMoney(unitPriceMinor, qty);
    return {
      line,
      qty,
      unitPriceMinor,
      lineTotalMinor
    };
  });

  const subtotalMinor = lineCalculations.reduce(
    (sum, cur) => addMoney(sum, cur.lineTotalMinor),
    0
  );
  const taxMinor = taxRatePercent > 0 ? percentageOfMoney(subtotalMinor, taxRatePercent) : 0;
  const grandTotalMinor = addMoney(subtotalMinor, taxMinor);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      setError('Please select a supplier');
      return;
    }
    if (lineItems.length === 0) {
      setError('Please add at least one line item');
      return;
    }

    // Validate quantities & prices
    for (const line of lineItems) {
      if (line.quantityOrdered <= 0) {
        setError('Ordered quantity must be greater than 0 for all items');
        return;
      }
      if (line.unitPriceRupees < 0) {
        setError('Unit price cannot be negative');
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);

      const itemsDTO: CreatePurchaseOrderItemDTO[] = lineItems.map(l => ({
        inventoryItemId: l.inventoryItemId,
        quantityOrdered: roundQuantity(l.quantityOrdered),
        unit: l.unit,
        unitPriceMinor: toMoneyMinor(l.unitPriceRupees)
      }));

      await onSubmit({
        supplierId: selectedSupplierId,
        orderDate,
        expectedDate: expectedDate || undefined,
        notes: notes.trim() || undefined,
        taxRatePercent: taxRatePercent > 0 ? taxRatePercent : undefined,
        items: itemsDTO
      });

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create purchase order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Create Purchase Order
              </h2>
              <p className="text-xs text-slate-500">
                Draft a new purchase order for supplier procurement
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {fetching ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Loading suppliers and items...
            </div>
          ) : (
            <>
              {/* Order Metadata Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select Supplier *
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <select
                      value={selectedSupplierId}
                      onChange={e => setSelectedSupplierId(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {suppliers.map(s => (
                        <option key={s.supplierId} value={s.supplierId}>
                          {s.name} ({s.phone})
                        </option>
                      ))}
                    </select>
                  </div>
                  {suppliers.length === 0 && (
                    <p className="text-[11px] text-rose-500 mt-1">No active suppliers registered yet</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Order Date *
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="date"
                      value={orderDate}
                      onChange={e => setOrderDate(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Expected Delivery Date
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="date"
                      value={expectedDate}
                      onChange={e => setExpectedDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Line Items Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Order Line Items ({lineItems.length})
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddItemLine}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>

                {lineItems.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-slate-400 text-xs">
                    No items added yet. Click &quot;Add Item&quot; to specify goods.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lineItems.map((line, idx) => {
                      const calc = lineCalculations[idx];
                      return (
                        <div
                          key={line.id}
                          className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
                        >
                          <div className="sm:col-span-4">
                            <label className="block sm:hidden text-[10px] font-semibold text-slate-400 mb-1">
                              Inventory Item
                            </label>
                            <select
                              value={line.inventoryItemId}
                              onChange={e => handleItemChange(line.id, e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                            >
                              {inventoryItems.map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.name} ({item.currentQuantity} {item.unit} in stock)
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block sm:hidden text-[10px] font-semibold text-slate-400 mb-1">
                              Qty
                            </label>
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={line.quantityOrdered}
                              onChange={e =>
                                handleQuantityChange(line.id, parseFloat(e.target.value) || 0)
                              }
                              placeholder="Qty"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-right"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block sm:hidden text-[10px] font-semibold text-slate-400 mb-1">
                              Unit
                            </label>
                            <select
                              value={line.unit}
                              onChange={e =>
                                handleUnitChange(line.id, e.target.value as InventoryUnit)
                              }
                              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            >
                              {SUPPORTED_UNITS.map(u => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block sm:hidden text-[10px] font-semibold text-slate-400 mb-1">
                              Price (₹)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unitPriceRupees}
                              onChange={e =>
                                handlePriceChange(line.id, parseFloat(e.target.value) || 0)
                              }
                              placeholder="₹/unit"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-right"
                            />
                          </div>

                          <div className="sm:col-span-1 text-right font-mono font-bold text-xs text-slate-900 dark:text-white">
                            {formatMoney(calc.lineTotalMinor)}
                          </div>

                          <div className="sm:col-span-1 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(line.id)}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Order Notes & Tax Setup */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Special Delivery / Terms Notes
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Gate delivery timing, payment on delivery, vehicle requirements..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Subtotal:</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {formatMoney(subtotalMinor)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500">GST / Tax (%):</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={taxRatePercent}
                        onChange={e => setTaxRatePercent(parseFloat(e.target.value) || 0)}
                        className="w-16 px-1.5 py-0.5 text-xs text-right font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {formatMoney(taxMinor)}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm font-bold text-slate-900 dark:text-white">
                    <span>Grand Total:</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono text-base">
                      {formatMoney(grandTotalMinor)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || fetching || lineItems.length === 0}
              className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-md shadow-indigo-600/20 transition-colors"
            >
              {loading ? 'Creating...' : 'Create Draft Purchase Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
