import React, { useState, useEffect } from 'react';
import {
  Utensils,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Image as ImageIcon,
  Check,
  Power,
  FolderTree,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { useRestaurant } from '../context/RestaurantContext';
import {
  subscribeToCategories,
  subscribeToMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleItemAvailability
} from '../services/menuService';
import { Category, MenuItem, MenuItemFormData, FoodType } from '../types/menu';
import { validateMenuItem } from '../utils/validation';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { EmptyState } from '../components/common/EmptyState';
import { FoodTypeBadge } from '../components/common/FoodTypeBadge';
import { ImageUploader } from '../components/common/ImageUploader';

export const ItemsPage: React.FC = () => {
  const { restaurant, formatPrice } = useRestaurant();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFoodType, setSelectedFoodType] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<MenuItemFormData>({
    categoryId: '',
    name: '',
    shortName: '',
    description: '',
    imageUrl: null,
    price: 0,
    taxRate: 5.0,
    taxInclusive: false,
    foodType: 'veg',
    isAvailable: true,
    sku: '',
    sortOrder: 0
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete state
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!restaurant) return;

    let isMounted = true;
    console.log('[RestaurantOS Debug] ItemsPage subscribing to categories at:', `restaurants/${restaurant.restaurantId}/categories`);
    const unsubCategories = subscribeToCategories(restaurant.restaurantId, (cats) => {
      if (!isMounted) return;
      console.log('[RestaurantOS Debug] ItemsPage categories loaded count:', cats.length);
      setCategories(cats);
    });

    console.log('[RestaurantOS Debug] ItemsPage subscribing to items at:', `restaurants/${restaurant.restaurantId}/items`);
    const unsubItems = subscribeToMenuItems(restaurant.restaurantId, (menuItems) => {
      if (!isMounted) return;
      console.log('[RestaurantOS Debug] ItemsPage menu items loaded from Firestore count:', menuItems.length, 'for restaurantId:', restaurant.restaurantId);
      setItems(menuItems);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      unsubCategories();
      unsubItems();
    };
  }, [restaurant?.restaurantId]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData({
      categoryId: categories[0]?.categoryId || '',
      name: '',
      shortName: '',
      description: '',
      imageUrl: null,
      price: 150,
      taxRate: restaurant?.defaultTaxRate !== undefined ? restaurant.defaultTaxRate : 5.0,
      taxInclusive: restaurant?.taxMode === 'inclusive',
      foodType: 'veg',
      isAvailable: true,
      sku: `ITM-${items.length + 1}`,
      sortOrder: items.length + 1
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      categoryId: item.categoryId || (categories[0]?.categoryId || ''),
      name: item.name,
      shortName: item.shortName || item.name.slice(0, 16),
      description: item.description || '',
      imageUrl: item.imageUrl || null,
      price: item.price,
      taxRate: item.taxRate,
      taxInclusive: item.taxInclusive,
      foodType: item.foodType,
      isAvailable: item.isAvailable,
      sku: item.sku || '',
      sortOrder: item.sortOrder || 0
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;
    setFormError(null);

    const validation = validateMenuItem({
      name: formData.name,
      categoryId: formData.categoryId,
      price: formData.price,
      shortName: formData.shortName,
      taxRate: formData.taxRate
    });

    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      setFormError(firstError);
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        await updateMenuItem(restaurant.restaurantId, editingItem.itemId, formData);
      } else {
        await createMenuItem(restaurant.restaurantId, formData);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving menu item:', err);
      setFormError(err.message || 'Failed to save menu item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurant || !itemToDelete) return;
    setIsDeleting(true);
    try {
      await deleteMenuItem(restaurant.restaurantId, itemToDelete.itemId);
      setItemToDelete(null);
    } catch (err) {
      console.error('Error deleting item:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    if (!restaurant) return;
    try {
      await toggleItemAvailability(restaurant.restaurantId, item.itemId, !item.isAvailable);
    } catch (err) {
      console.error('Toggle availability error:', err);
    }
  };

  // Filter logic
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.shortName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const matchesFoodType = selectedFoodType === 'all' || item.foodType === selectedFoodType;
    const matchesAvailability =
      availabilityFilter === 'all'
        ? true
        : availabilityFilter === 'available'
        ? item.isAvailable
        : !item.isAvailable;

    return matchesSearch && matchesCategory && matchesFoodType && matchesAvailability;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Menu Items</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage food catalog, prices, GST rates, dietary tags, and 86/out-of-stock toggles.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreate}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Add Menu Item
        </Button>
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="w-full md:flex-1">
            <Input
              placeholder="Search by dish name, short code, or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Food Type Filter */}
            <select
              value={selectedFoodType}
              onChange={(e) => setSelectedFoodType(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
            >
              <option value="all">All Dietary Types</option>
              <option value="veg">Vegetarian Only</option>
              <option value="nonVeg">Non-Vegetarian Only</option>
              <option value="egg">Egg Only</option>
            </select>

            {/* Availability Filter */}
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
            >
              <option value="all">All Stock Status</option>
              <option value="available">In Stock Only</option>
              <option value="unavailable">Out of Stock Only</option>
            </select>

            {(searchQuery || selectedCategory !== 'all' || selectedFoodType !== 'all' || availabilityFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedFoodType('all');
                  setAvailabilityFilter('all');
                }}
                leftIcon={<X className="w-3.5 h-3.5" />}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span>
            Displaying <strong className="text-slate-800">{filteredItems.length}</strong> of{' '}
            <strong className="text-slate-800">{items.length}</strong> dishes
          </span>
          <span className="font-semibold text-indigo-600">
            {items.filter((i) => i.isAvailable).length} Available for Billing
          </span>
        </div>
      </div>

      {/* Items Grid / Cards */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">Loading food catalog...</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Utensils className="w-6 h-6 text-slate-500" />}
          title="Your Menu is Empty"
          description="Start building your digital menu by adding food items with prices, photos, and GST rates."
          actionLabel="Add First Food Item"
          onAction={handleOpenCreate}
        />
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Utensils className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-700">No dishes match your selected filter criteria</p>
          <p className="text-xs text-slate-500 mt-1">Try resetting the category, dietary tag or search query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredItems.map((item) => {
            const category = categories.find((c) => c.categoryId === item.categoryId);

            return (
              <div
                key={item.itemId}
                className={`bg-white rounded-2xl border transition-all duration-150 shadow-xs flex flex-col overflow-hidden ${
                  item.isAvailable
                    ? 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                    : 'border-slate-200/60 bg-slate-50/50 opacity-80'
                }`}
              >
                {/* Photo & Badge Bar */}
                <div className="relative h-44 bg-slate-100 overflow-hidden flex items-center justify-center">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <ImageIcon className="w-8 h-8 mb-1 opacity-50" />
                      <span className="text-[11px] font-semibold">No Image Uploaded</span>
                    </div>
                  )}

                  {/* Dietary chip top left */}
                  <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-lg shadow-sm border border-slate-100 flex items-center gap-1.5">
                    <FoodTypeBadge type={item.foodType} />
                  </div>

                  {/* Availability toggle top right */}
                  <div className="absolute top-3 right-3">
                    <button
                      onClick={() => handleToggleAvailability(item)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 ${
                        item.isAvailable
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-rose-600 text-white hover:bg-rose-700'
                      }`}
                      title="Click to toggle In-Stock / Out-of-Stock (86)"
                    >
                      <Power className="w-3 h-3" />
                      {item.isAvailable ? 'In Stock' : '86 / Out'}
                    </button>
                  </div>
                </div>

                {/* Content Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                      <span className="font-semibold text-indigo-600 truncate">
                        {category?.name || 'Unassigned'}
                      </span>
                      {item.sku && <span className="font-mono text-[11px] text-slate-400">SKU: {item.sku}</span>}
                    </div>

                    <h3 className="text-base font-bold text-slate-900 leading-tight">
                      {item.name}
                    </h3>
                    {item.shortName && item.shortName !== item.name && (
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        POS Slip: {item.shortName}
                      </p>
                    )}

                    {item.description && (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Price & Tax Footer */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-lg font-extrabold text-slate-900">
                        {formatPrice(item.price)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        +{item.taxRate}% GST ({item.taxInclusive ? 'Included' : 'Extra'})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-2 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Edit Item"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setItemToDelete(item)}
                        className="p-2 rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Food Item Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Edit Menu Item' : 'Add New Food Item'}
        subtitle="Configure dish identity, thermal KOT slip name, price, and GST details"
        maxWidth="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Item Display Name"
              placeholder="e.g. Butter Chicken Special"
              value={formData.name}
              onChange={(e) => {
                const name = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  name,
                  shortName: prev.shortName ? prev.shortName : name.slice(0, 16)
                }));
              }}
              required
              autoFocus
            />

            <Input
              label="Short Name (for POS & KOT Slips)"
              placeholder="e.g. But Chicken Sp"
              value={formData.shortName}
              onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
              helperText="Fits on 3-inch thermal printer slips"
              maxLength={20}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Category
              </label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                required
              >
                <option value="" disabled>
                  Select a category
                </option>
                {categories.map((cat) => (
                  <option key={cat.categoryId} value={cat.categoryId}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {categories.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Tip: Create a category first in the Categories tab!
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Dietary / Food Type
              </label>
              <select
                value={formData.foodType}
                onChange={(e) => setFormData({ ...formData, foodType: e.target.value as FoodType })}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
              >
                <option value="veg">🟢 Vegetarian</option>
                <option value="nonVeg">🔴 Non-Vegetarian</option>
                <option value="egg">🟡 Contains Egg</option>
                <option value="other">⚪ Other / Neutral</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Description
            </label>
            <textarea
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
              placeholder="Flavor notes, ingredients, allergen info..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          {/* Pricing & Tax */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label={`Price (${restaurant?.currencySymbol || '₹'})`}
                type="number"
                step="0.5"
                min="0"
                placeholder="250"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                required
              />

              <Input
                label="Item GST Rate (%)"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={formData.taxRate}
                onChange={(e) => setFormData({ ...formData, taxRate: Number(e.target.value) })}
                helperText="Defaults to outlet GST"
              />

              <Input
                label="Item SKU / Code"
                placeholder="e.g. CUR-01"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                id="taxInclusive"
                type="checkbox"
                checked={formData.taxInclusive}
                onChange={(e) => setFormData({ ...formData, taxInclusive: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <label htmlFor="taxInclusive" className="text-xs font-semibold text-slate-700 cursor-pointer">
                Price is tax-inclusive (GST already factored into the entered price)
              </label>
            </div>
          </div>

          {/* Photo Uploader */}
          <ImageUploader
            label="Dish Photograph"
            value={formData.imageUrl}
            onChange={(url) => setFormData({ ...formData, imageUrl: url })}
            folderPath={restaurant ? `restaurants/${restaurant.restaurantId}/items` : 'restaurants/default/items'}
          />

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <input
                id="itemAvailable"
                type="checkbox"
                checked={formData.isAvailable}
                onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <label htmlFor="itemAvailable" className="text-xs font-bold text-slate-800 cursor-pointer">
                Available for ordering (Active)
              </label>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSubmitting}
              >
                {editingItem ? 'Save Changes' : 'Create Item'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Item Confirmation */}
      <ConfirmDialog
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Food Item"
        message={`Are you sure you want to delete "${itemToDelete?.name}"? This action removes the item from the catalog.`}
        confirmLabel="Delete Item"
        isLoading={isDeleting}
      />
    </div>
  );
};
