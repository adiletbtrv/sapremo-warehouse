import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePermissions } from '../hooks/usePermissions';
import { useAuthStore, type AuthState } from '../store/authStore';

// Mock the zustand store
vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

const createMockAuthState = (role: string, isSuperuser = false): AuthState => ({
  token: 'mock-token',
  refreshToken: 'mock-refresh',
  isAuthenticated: true,
  sessionGeneration: 1,
  user: {
    id: 'user-1',
    username: 'testuser',
    fullName: 'Test User',
    role,
    isSuperuser,
  },
  login: vi.fn(),
  updateTokens: vi.fn(),
  logout: vi.fn(),
});

describe('usePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin has all permissions', () => {
    vi.mocked(useAuthStore).mockImplementation((selector) => {
      return selector(createMockAuthState('admin', false));
    });

    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('canEditProducts')).toBe(true);
    expect(result.current.can('canDeleteProducts')).toBe(true);
    expect(result.current.can('canViewPayments')).toBe(true);
    expect(result.current.can('canCreateReceipts')).toBe(true);
    expect(result.current.can('canViewWarehouses')).toBe(true);
  });

  it('superuser overrides role restrictions', () => {
    vi.mocked(useAuthStore).mockImplementation((selector) => {
      return selector(createMockAuthState('accountant', true));
    });

    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('canDeleteProducts')).toBe(true);
    expect(result.current.can('canViewWarehouses')).toBe(true);
  });

  it('warehouse_manager can manage products, receipts, and view warehouses', () => {
    vi.mocked(useAuthStore).mockImplementation((selector) => {
      return selector(createMockAuthState('warehouse_manager', false));
    });

    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('canEditProducts')).toBe(true);
    expect(result.current.can('canDeleteProducts')).toBe(true);
    expect(result.current.can('canCreateReceipts')).toBe(true);
    expect(result.current.can('canViewWarehouses')).toBe(true);
    expect(result.current.can('canViewPayments')).toBe(true);
  });

  it('factory role can manage products but not receipts', () => {
    vi.mocked(useAuthStore).mockImplementation((selector) => {
      return selector(createMockAuthState('factory', false));
    });

    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('canEditProducts')).toBe(true);
    expect(result.current.can('canDeleteProducts')).toBe(true);
    expect(result.current.can('canCreateReceipts')).toBe(false);
  });
});
