'use client';

import { useAuth } from '@/components/AuthProvider';
import { useCart } from '@/contexts/CartContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  User, Settings, Activity, ShoppingBag, Package,
  ArrowRight, Loader2, LogIn, ShoppingCart,
} from 'lucide-react';

// ─── Quick-link cards config ──────────────────────────────────────────────────
const CARDS = [
  {
    icon:        User,
    title:       'Profile',
    description: 'View and edit your personal information.',
    href:        '/profile',
    color:       'text-blue-600 dark:text-blue-400',
    bg:          'bg-blue-50 dark:bg-blue-950',
  },
  {
    icon:        Package,
    title:       'My Orders',
    description: 'Track your current and past orders.',
    href:        '/orders',
    color:       'text-purple-600 dark:text-purple-400',
    bg:          'bg-purple-50 dark:bg-purple-950',
  },
  {
    icon:        ShoppingBag,
    title:       'Shop',
    description: 'Browse and discover our latest products.',
    href:        '/products',
    color:       'text-green-600 dark:text-green-400',
    bg:          'bg-green-50 dark:bg-green-950',
  },
  {
    icon:        ShoppingCart,
    title:       'Cart',
    description: 'Review the items in your shopping cart.',
    href:        '/cart',
    color:       'text-amber-600 dark:text-amber-400',
    bg:          'bg-amber-50 dark:bg-amber-950',
  },
  {
    icon:        Activity,
    title:       'Activity',
    description: 'See a log of your recent account activity.',
    href:        '/activity',
    color:       'text-rose-600 dark:text-rose-400',
    bg:          'bg-rose-50 dark:bg-rose-950',
  },
  {
    icon:        Settings,
    title:       'Settings',
    description: 'Manage your account and preferences.',
    href:        '/settings',
    color:       'text-gray-600 dark:text-gray-400',
    bg:          'bg-gray-100 dark:bg-gray-800',
  },
];

// ─── Loading screen ───────────────────────────────────────────────────────────
const LoadingScreen = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
    <div className="text-center">
      <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" aria-hidden="true" />
      <p className="text-sm text-gray-500 dark:text-gray-400">Loading your dashboard…</p>
    </div>
  </div>
);

// ─── Access denied screen ─────────────────────────────────────────────────────
const AccessDenied = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
    <div className="text-center max-w-sm">
      <div className="w-16 h-16 bg-red-100 dark:bg-red-950 rounded-2xl flex items-center justify-center mx-auto mb-5">
        <LogIn className="w-8 h-8 text-red-500" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Access Denied
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        Please sign in to access your dashboard.
      </p>
      <Link
        href="/auth/signin"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
      >
        <LogIn className="w-4 h-4" aria-hidden="true" />
        Sign In
      </Link>
    </div>
  </div>
);

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, loading } = useAuth();
  const { cartSummary }   = useCart();
  const router            = useRouter();

  // Redirect unauthenticated users instead of showing an inline denial screen
  // (keeps the URL clean and matches the pattern used in CheckoutPage)
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin?returnUrl=' + encodeURIComponent('/dashboard'));
    }
  }, [loading, user, router]);

  if (loading) return <LoadingScreen />;
  if (!user)   return <AccessDenied />; // shown briefly while redirect fires

  const displayName = user.name || user.firstName || user.email;
  const initials    = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* ── Welcome header ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-10">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
            {user.avatar
              ? <img src={user.avatar} alt={displayName} className="w-14 h-14 rounded-2xl object-cover" />
              : initials}
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Welcome back, {displayName}!
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {user.email}
            </p>
          </div>
        </div>

        {/* ── Stats strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Cart Items',   value: cartSummary?.totalItems  ?? 0 },
            { label: 'Cart Value',   value: `$${(cartSummary?.totalAmount ?? 0).toFixed(2)}` },
            { label: 'Orders',       value: '—' }, // replace with real data when available
            { label: 'Member Since', value: user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                : '—' },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Quick-link cards ────────────────────────────────────────────── */}
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
          Quick Links
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map(({ icon: Icon, title, description, href, color, bg }) => (
            <Link
              key={href}
              href={href}
              className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${color}`} aria-hidden="true" />
                </div>
                <ArrowRight
                  className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all mt-0.5 flex-shrink-0"
                  aria-hidden="true"
                />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white text-sm">
                {title}
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {description}
              </p>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}