'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Package, Heart, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import Avatar from '@/components/Avatar';

const MENU_ITEMS = [
  { href: '/profile',  icon: User,    label: 'Profile Settings', description: 'Manage your account' },
  { href: '/orders',   icon: Package, label: 'Order History',    description: 'View past orders'    },
  { href: '/wishlist', icon: Heart,   label: 'Wishlist',         description: 'Saved items'         },
];

export default function UserMenu() {
  const [isOpen,       setIsOpen]       = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { user, loading, logout, isAuthenticated } = useAuth();
  const toast  = useToast();
  const router = useRouter();

  const dropdownRef = useRef(null);
  const triggerRef  = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { setIsOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    setIsOpen(false);
    try {
      await logout();
      toast.success('Signed out successfully.');
      router.push('/');
    } catch (err) {
      console.error('[UserMenu] logout error:', err);
      toast.error('Failed to sign out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  }, [logout, toast, router]);

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" aria-hidden="true" />;
  }

  // ✅ isAuthenticated is a boolean — no () needed
  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/auth/signin"
          className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/auth/signup"
          className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
        >
          Sign Up
        </Link>
      </div>
    );
  }

  const displayName  = user?.name ?? user?.firstName ?? 'User';
  const displayEmail = user?.email ?? '';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`User menu for ${displayName}`}
        className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Avatar src={user?.avatar} name={displayName} alt={displayName} size="sm" showStatus statusColor="green" className="ring-2 ring-white dark:ring-gray-900" />
        <span className="hidden sm:block text-left">
          <span className="block text-sm font-medium text-gray-900 dark:text-white leading-tight">{displayName}</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{displayEmail}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="User menu"
          className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 py-1.5 z-50 overflow-hidden"
        >
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" aria-hidden="true" />

          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 mt-0.5">
            <Avatar src={user?.avatar} name={displayName} alt={displayName} size="md" showStatus statusColor="green" className="ring-2 ring-blue-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{displayName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{displayEmail}</p>
            </div>
          </div>

          <div className="py-1">
            {MENU_ITEMS.map(({ href, icon: Icon, label, description }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 dark:group-hover:bg-blue-950 transition-colors">
                  <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium leading-tight">{label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

          <div className="py-1">
            <button
              role="menuitem"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950 flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 dark:group-hover:bg-red-900 transition-colors">
                <LogOut className="w-4 h-4 text-red-500" aria-hidden="true" />
              </div>
              <div>
                <p className="font-medium leading-tight">{isLoggingOut ? 'Signing out…' : 'Sign Out'}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Log out of your account</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}