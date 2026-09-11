import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TableManagementSection } from '../components/restaurant/TableManagementSection';
import { tableService } from '../services/tableService';
import { Table } from '../types/table';

// Mock contexts
const mockUseRestaurant = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../context/RestaurantContext', () => ({
  useRestaurant: () => mockUseRestaurant()
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));

describe('TableManagementSection Component Integration Tests', () => {
  const restaurantId = 'rest_alpha_123';
  const ownerUser = { uid: 'owner_uid_1', email: 'owner@example.com' };
  const ownerProfile = { role: 'owner', name: 'Owner User' };

  const testTables: Table[] = [
    {
      id: 'table_1',
      restaurantId,
      tableNumber: '101',
      name: 'Window Booth',
      floorOrArea: 'Main Dining',
      capacity: 4,
      isActive: true,
      sortOrder: 1,
      activeSessionId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'table_2',
      restaurantId,
      tableNumber: '102',
      name: 'Center Table',
      floorOrArea: 'Main Dining',
      capacity: 2,
      isActive: true,
      sortOrder: 2,
      activeSessionId: 'session_active_102',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'table_3',
      restaurantId,
      tableNumber: '103',
      name: 'Rooftop Bar 1',
      floorOrArea: 'Rooftop',
      capacity: 6,
      isActive: false, // Deactivated
      sortOrder: 3,
      activeSessionId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRestaurant.mockReturnValue({
      restaurant: { restaurantId, name: 'Royal Bistro' },
      loading: false
    });
    mockUseAuth.mockReturnValue({
      user: ownerUser,
      profile: ownerProfile
    });
  });

  it('renders loading state initially while subscription is connecting', () => {
    vi.spyOn(tableService, 'subscribeToTables').mockImplementation(() => {
      // Do not emit immediately to inspect loading state
      return vi.fn();
    });

    render(<TableManagementSection />);
    expect(screen.getByText(/Loading dining tables.../i)).toBeInTheDocument();
  });

  it('renders table cards and metrics when tables are loaded', async () => {
    vi.spyOn(tableService, 'subscribeToTables').mockImplementation((_restId, onUpdate) => {
      onUpdate(testTables);
      return vi.fn();
    });

    render(<TableManagementSection />);

    await waitFor(() => {
      expect(screen.getByText('Table 101')).toBeInTheDocument();
      expect(screen.getByText('Table 102')).toBeInTheDocument();
      expect(screen.getByText('Table 103')).toBeInTheDocument();
    });

    // Verify capacities and details
    expect(screen.getByText('Window Booth')).toBeInTheDocument();
    expect(screen.getByText('4 Guests')).toBeInTheDocument();
    expect(screen.getByText('Occupied')).toBeInTheDocument();
    expect(screen.getAllByText('Vacant').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Deactivated')).toBeInTheDocument();

    // Verify summary stats
    expect(screen.getByText('Total Tables:')).toBeInTheDocument();
  });

  it('renders empty state when restaurant has zero tables', async () => {
    vi.spyOn(tableService, 'subscribeToTables').mockImplementation((_restId, onUpdate) => {
      onUpdate([]);
      return vi.fn();
    });

    render(<TableManagementSection />);

    await waitFor(() => {
      expect(screen.getByText(/No Dining Tables Configured Yet/i)).toBeInTheDocument();
      expect(screen.getByText('Add First Table')).toBeInTheDocument();
    });
  });

  it('renders error state and handles retry', async () => {
    let subscribeCallCount = 0;
    vi.spyOn(tableService, 'subscribeToTables').mockImplementation((_restId, _onUpdate, onError) => {
      subscribeCallCount++;
      if (onError) {
        onError(new Error('Firestore connection failed'));
      }
      return vi.fn();
    });

    render(<TableManagementSection />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load tables/i)).toBeInTheDocument();
      expect(screen.getByText(/Firestore connection failed/i)).toBeInTheDocument();
    });

    const retryBtn = screen.getByText('Retry Connection');
    fireEvent.click(retryBtn);

    expect(subscribeCallCount).toBeGreaterThanOrEqual(2);
  });

  it('shows permission denied banner and hides mutation buttons for cashier role', async () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'cashier_uid', email: 'cashier@example.com' },
      profile: { role: 'cashier', name: 'Cashier User' }
    });

    vi.spyOn(tableService, 'subscribeToTables').mockImplementation((_restId, onUpdate) => {
      onUpdate(testTables);
      return vi.fn();
    });

    render(<TableManagementSection />);

    await waitFor(() => {
      expect(screen.getByText('Table 101')).toBeInTheDocument();
    });

    // Banner is present
    expect(screen.getByText(/Read-only access:/i)).toBeInTheDocument();
    expect(screen.getByText(/Only Restaurant Owners and Managers have permission/i)).toBeInTheDocument();

    // Add Table button should not be present
    expect(screen.queryByRole('button', { name: /Add Table/i })).toBeNull();
    // Edit & Deactivate buttons should not be present
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Deactivate')).toBeNull();
  });

  it('opens Add Table modal, validates inputs, and calls tableService.createTable', async () => {
    vi.spyOn(tableService, 'subscribeToTables').mockImplementation((_restId, onUpdate) => {
      onUpdate(testTables);
      return vi.fn();
    });

    const createSpy = vi.spyOn(tableService, 'createTable').mockResolvedValueOnce({
      id: 'table_104',
      restaurantId,
      tableNumber: '104',
      name: 'Garden Table 4',
      floorOrArea: 'Garden',
      capacity: 4,
      isActive: true,
      sortOrder: 4,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    render(<TableManagementSection />);

    await waitFor(() => {
      expect(screen.getByText('Table 101')).toBeInTheDocument();
    });

    // Click Add Table button
    const addBtn = screen.getByRole('button', { name: /Add Table/i });
    fireEvent.click(addBtn);

    // Modal opens
    expect(screen.getByText('Add New Dining Table')).toBeInTheDocument();

    // Modify fields
    const numberInput = screen.getByLabelText(/Table Number \/ Code/i);
    const nameInput = screen.getByLabelText(/Display Name \/ Label/i);

    fireEvent.change(numberInput, { target: { value: '104' } });
    fireEvent.change(nameInput, { target: { value: 'Garden Table 4' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Create Table/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        restaurantId,
        expect.objectContaining({
          tableNumber: '104',
          name: 'Garden Table 4'
        }),
        ownerUser.uid
      );
    });
  });

  it('prevents deactivating a table with an active dining session', async () => {
    vi.spyOn(tableService, 'subscribeToTables').mockImplementation((_restId, onUpdate) => {
      onUpdate(testTables);
      return vi.fn();
    });

    const updateSpy = vi.spyOn(tableService, 'updateTable').mockResolvedValueOnce();

    render(<TableManagementSection />);

    await waitFor(() => {
      expect(screen.getByText('Table 102')).toBeInTheDocument();
    });

    // Table 102 has activeSessionId: 'session_active_102'
    const toggleBtn102 = document.getElementById('toggle-table-btn-table_2');
    expect(toggleBtn102).not.toBeNull();
    fireEvent.click(toggleBtn102!);

    // Should display warning and not call updateTable
    expect(updateSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.getByText(/Cannot deactivate Table 102 while an active dining session is in progress/i)
      ).toBeInTheDocument();
    });
  });

  it('successfully deactivates a vacant table', async () => {
    vi.spyOn(tableService, 'subscribeToTables').mockImplementation((_restId, onUpdate) => {
      onUpdate(testTables);
      return vi.fn();
    });

    const updateSpy = vi.spyOn(tableService, 'updateTable').mockResolvedValueOnce();

    render(<TableManagementSection />);

    await waitFor(() => {
      expect(screen.getByText('Table 101')).toBeInTheDocument();
    });

    // Table 101 is vacant
    const toggleBtn101 = document.getElementById('toggle-table-btn-table_1');
    expect(toggleBtn101).not.toBeNull();
    fireEvent.click(toggleBtn101!);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        restaurantId,
        'table_1',
        { isActive: false },
        ownerUser.uid
      );
      expect(screen.getByText(/Table 101 safely deactivated/i)).toBeInTheDocument();
    });
  });

  it('filters tables by search query', async () => {
    vi.spyOn(tableService, 'subscribeToTables').mockImplementation((_restId, onUpdate) => {
      onUpdate(testTables);
      return vi.fn();
    });

    render(<TableManagementSection />);

    await waitFor(() => {
      expect(screen.getByText('Table 101')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search table number, name, floor.../i);
    fireEvent.change(searchInput, { target: { value: 'Rooftop' } });

    // Table 103 (Rooftop) is visible, Table 101 & 102 are filtered out
    expect(screen.getByText('Table 103')).toBeInTheDocument();
    expect(screen.queryByText('Table 101')).toBeNull();
    expect(screen.queryByText('Table 102')).toBeNull();
  });
});
