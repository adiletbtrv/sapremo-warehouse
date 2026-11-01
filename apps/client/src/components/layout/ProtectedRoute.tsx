import { Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);

  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    if (token && token !== 'dev-access-token') {
      void (async () => {
        try {
          const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            setIsInvalid(true);
            await logout(true);
          }
        } catch (error) {
          setIsInvalid(true);
          await logout(true);
        }
      })();
    }
  }, [token, logout]);

  if (!isAuthenticated || !token || isInvalid) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
