'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function AuthGuard({ children, redirectTo = '/auth/signin' }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // ✅ isAuthenticated is a boolean — no () needed
    // ✅ removed isAuthenticated from deps — it's a primitive, safe to use directly
    if (!loading && !isAuthenticated) {
      const returnUrl = encodeURIComponent(window.location.pathname);
      router.push(`${redirectTo}?returnUrl=${returnUrl}`);
    }
  }, [loading, isAuthenticated, router, redirectTo]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          <p className="text-gray-600 dark:text-gray-300">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // ✅ boolean — no () needed
  return isAuthenticated ? children : null;
}