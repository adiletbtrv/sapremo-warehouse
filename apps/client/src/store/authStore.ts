import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearUserScopedData } from '@/db/schema';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: string;
  warehouseId?: string | null;
  isSuperuser?: boolean;
}

export interface AuthState {
  sessionGeneration: number;
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, refreshToken: string, user: User) => void;
  updateTokens: (token: string, refreshToken: string) => void;
  logout: (clearLocalData?: boolean) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      sessionGeneration: 0,
      login: (token, refreshToken, user) => {
        set((state) => ({
          sessionGeneration: state.sessionGeneration + 1,
          token,
          refreshToken,
          user,
          isAuthenticated: true,
        }));
      },
      updateTokens: (token, refreshToken) => {
        set({ token, refreshToken });
      },
      logout: async (clearLocalData = true) => {
        set((state) => ({
          sessionGeneration: state.sessionGeneration + 1,
          token: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }));

        if (clearLocalData) {
          await clearUserScopedData();
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
