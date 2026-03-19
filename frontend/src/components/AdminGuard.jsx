'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Loader2 } from 'lucide-react';

export default function AdminGuard({ children }) {
  const { user, loading } = useAuth();
  const router            = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin?returnUrl=/admin');
      return;
    }
    if (!loading && user && !user.isAdmin) {
      router.push('/');  // redirect non-admins to home
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!user?.isAdmin) return null;

  return children;
}