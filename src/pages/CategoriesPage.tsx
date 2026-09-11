import React, { useState, useEffect } from 'react';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  Search,
  Utensils,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { useRestaurant } from '../context/RestaurantContext';
import {
  subscribeToCategories,
  subscribeToMenuItems,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
  swapCategoryOrder
} from '../services/menuService';
import { Category, CategoryFormData, MenuItem } from '../types/menu';
import { validateCategory } from '../utils/validation';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { EmptyState } from '../components/common/EmptyState';
import { Badge } from '../components/common/Badge';

export const CategoriesPage: React.FC = () => {
  const { restaurant } = useRestaurant();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
    sortOrder: 0,
    isActive: true
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  // Delete dialog state
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!restaurant) return;

    let isMounted = true;
    console.log('[RestaurantOS Debug] CategoriesPage subscribing to path:', `restaurants/${restaurant.restaurantId}/categories`);
    const unsubCategories = subscribeToCategories(restaurant.restaurantId, (cats) => {
      if (!isMounted) return;
      console.log('[RestaurantOS Debug] Categories loaded from Firestore count:', cats.length, 'for restaurantId:', restaurant.restaurantId);
      setCategories(cats);
      setIsLoading(false);
    });

    console.log('[RestaurantOS Debug] CategoriesPage subscribing to items for category count at:', `restaurants/${restaurant.restaurantId}/items`);
    const unsubItems = subscribeToMenuItems(restaurant.restaurantId, (all) => {
      if (!isMounted) return;
      console.log('[RestaurantOS Debug] Total items loaded for category item-counts:', all.length);
      setItems(all);
    });

    return () => {
      isMounted = false;
      unsubCategories();
      unsubItems();
    };
  }, [restaurant?.restaurantId]);

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setFormData({
      name: '',
      description: '',
      sortOrder: categories.length + 1,
      isActive: true
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
      isActive: category.isActive
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;

    const validation = validateCategory({
      name: formData.name,
      sortOrder: formData.sortOrder
    });

    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);
    try {
      if (editingCategory) {
        await updateCategory(restaurant.restaurantId, editingCategory.categoryId, formData);
      } else {
        await createCategory(restaurant.restaurantId, formData);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving category:', err);
      setFormErrors({ form: err.message || 'Failed to save category.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurant || !categoryToDelete) return;
    setIsDeleting(true);
    try {
      await deleteCategory(restaurant.restaurantId, categoryToDelete.categoryId);
      setCategoryToDelete(null);
    } catch (err) {
      console.error('Error deleting category:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleStatus = async (cat: Category) => {
    if (!restaurant) return;
    try {
      await toggleCategoryStatus(restaurant.restaurantId, cat.categoryId, !cat.isActive);
    } catch (err) {
      console.error('Toggle status error:', err);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    if (!restaurant || isReordering) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const currentCat = categories[index];
    const targetCat = categories[targetIndex];

    setIsReordering(true);
    try {
      await swapCategoryOrder(
        restaurant.restaurantId,
        { categoryId: currentCat.categoryId, sortOrder: currentCat.sortOrder },
        { categoryId: targetCat.categoryId, sortOrder: targetCat.sortOrder }
      );
    } catch (err) {
      console.error('Error swapping category order:', err);
    } finally {
      setIsReordering(false);
    }
  };

  const filteredCategories = categories.filter(
    (cat) =>
      cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cat.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Menu Categories</h2>
          <p className="text-sm text-slate-500 mt-1">
            Organize dishes into sections for customer menus, POS billing, and kitchen routing.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreate}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Add Category
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="text-xs text-slate-500 font-semibold self-end sm:self-center">
          Showing {filteredCategories.length} of {categories.length} categories
        </div>
      </div>

      {/* Category List / Table */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">Loading categories...</p>
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="w-6 h-6 text-slate-500" />}
          title="No Categories Yet"
          description="Create your first menu category (e.g. Starters, Main Course, Beverages, Desserts) to start adding food items."
          actionLabel="Create Category"
          onAction={handleOpenCreate}
        />
      ) : filteredCategories.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <p className="text-sm text-slate-600">No categories matching "{searchQuery}"</p>
          <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="mt-2">
            Clear Search
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-semibold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Order & Position</th>
                  <th className="py-3.5 px-4 sm:px-6">Category</th>
                  <th className="py-3.5 px-4 sm:px-6 hidden md:table-cell">Description</th>
                  <th className="py-3.5 px-4 sm:px-6 text-center">Items</th>
                  <th className="py-3.5 px-4 sm:px-6">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.map((cat, idx) => {
                  const itemCount = items.filter((i) => i.categoryId === cat.categoryId).length;
                  const canMoveUp = idx > 0;
                  const canMoveDown = idx < filteredCategories.length - 1;

                  return (
                    <tr key={cat.categoryId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-500 w-6">
                            #{cat.sortOrder}
                          </span>
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveOrder(idx, 'up')}
                              disabled={!canMoveUp || isReordering}
                              aria-label={`Move ${cat.name} up`}
                              className="p-1 rounded bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveOrder(idx, 'down')}
                              disabled={!canMoveDown || isReordering}
                              aria-label={`Move ${cat.name} down`}
                              className="p-1 rounded bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                            <FolderTree className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{cat.name}</p>
                            <p className="text-xs text-slate-400 font-mono">ID: {cat.categoryId.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 sm:px-6 hidden md:table-cell text-slate-500 text-xs max-w-xs truncate">
                        {cat.description || '—'}
                      </td>

                      <td className="py-4 px-4 sm:px-6 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                          <Utensils className="w-3 h-3 text-slate-400" />
                          {itemCount}
                        </span>
                      </td>

                      <td className="py-4 px-4 sm:px-6">
                        <button
                          onClick={() => handleToggleStatus(cat)}
                          className="focus:outline-none"
                          title="Click to toggle category status"
                        >
                          {cat.isActive ? (
                            <Badge variant="success" dot>
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="neutral" dot>
                              Disabled
                            </Badge>
                          )}
                        </button>
                      </td>

                      <td className="py-4 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(cat)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit Category"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setCategoryToDelete(cat)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete Category"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Category Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCategory ? 'Edit Category' : 'Add New Category'}
        subtitle="Manage category hierarchy and display sorting"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {formErrors.form}
            </div>
          )}

          <Input
            label="Category Name"
            placeholder="e.g. Starters & Appetizers"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={formErrors.name}
            required
            autoFocus
          />

          <Input
            label="Description (Optional)"
            placeholder="e.g. Crispy tandoori kebabs, rolls and sizzling platters"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Sort Order"
              type="number"
              min="0"
              placeholder="1"
              value={formData.sortOrder}
              onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
              error={formErrors.sortOrder}
              helperText="Lower numbers appear first on menus"
            />

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Visibility Status
              </label>
              <select
                value={formData.isActive ? 'true' : 'false'}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
              >
                <option value="true">Active (Visible)</option>
                <option value="false">Disabled (Hidden)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting}
            >
              {editingCategory ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!categoryToDelete}
        onClose={() => setCategoryToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Category?"
        message={`Are you sure you want to delete "${categoryToDelete?.name}"? Items inside this category will remain, but will lose their category assignment.`}
        confirmLabel="Delete Category"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};
