'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User, Mail, Lock, Save, ArrowLeft,
  Loader2, CheckCircle2, AlertCircle, Eye, EyeOff,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { getToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL;

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error ?? `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ─── Section card wrapper ─────────────────────────────────────────────────────
const Card = ({ title, children }) => (
  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
    <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">{title}</h2>
    {children}
  </div>
);

// ─── Field wrapper ────────────────────────────────────────────────────────────
const Field = ({ label, error, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
      {label}
    </label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const inputClass = (hasError) =>
  `w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white ${
    hasError
      ? 'border-red-400 dark:border-red-600'
      : 'border-gray-200 dark:border-gray-700'
  }`;

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const router  = useRouter();
  const toast   = useToast();

  // ── Profile form state ───────────────────────────────────────────────────
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [profileLoading, setProfileLoading] = useState(false);

  // ── Password form state ──────────────────────────────────────────────────
  const [passwords, setPasswords] = useState({
    currentPassword: '', newPassword: '', confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrent,  setShowCurrent]  = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);

  // ── Redirect if not logged in ────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/signin?returnUrl=' + encodeURIComponent('/profile'));
    }
  }, [authLoading, user, router]);

  // ── Pre-fill profile form from context ──────────────────────────────────
  useEffect(() => {
    if (user) {
      setProfile({
        name:  user.name  ?? '',
        email: user.email ?? '',
      });
    }
  }, [user]);

  // ── Profile validation ───────────────────────────────────────────────────
  const validateProfile = () => {
    const errors = {};
    if (!profile.name.trim())       errors.name  = 'Name is required';
    if (profile.name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Password validation ──────────────────────────────────────────────────
  const validatePassword = () => {
    const errors = {};
    if (!passwords.currentPassword)   errors.currentPassword = 'Current password is required';
    if (!passwords.newPassword)        errors.newPassword     = 'New password is required';
    if (passwords.newPassword.length < 8)
      errors.newPassword = 'Password must be at least 8 characters';
    if (passwords.newPassword !== passwords.confirmPassword)
      errors.confirmPassword = 'Passwords do not match';
    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save profile ─────────────────────────────────────────────────────────
  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!validateProfile()) return;

    setProfileLoading(true);
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: profile.name.trim() }),
      });
      toast.success('Profile updated successfully!');
    } catch (err) {
      toast.error(err.message ?? 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  // ── Change password ──────────────────────────────────────────────────────
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!validatePassword()) return;

    setPasswordLoading(true);
    try {
      await apiFetch('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword:     passwords.newPassword,
        }),
      });
      toast.success('Password changed successfully!');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      if (err.status === 400) {
        setPasswordErrors({ currentPassword: 'Current password is incorrect' });
      } else {
        toast.error(err.message ?? 'Failed to change password');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (!user) return null; // redirect firing

  const displayName  = user.name ?? user.email ?? 'User';
  const memberSince  = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">

        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
            {user.avatar
              ? <img src={user.avatar} alt={displayName} className="w-14 h-14 rounded-2xl object-cover" />
              : displayName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{displayName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Member since {memberSince}</p>
          </div>
        </div>

        <div className="space-y-6">

          {/* ── Profile Info ──────────────────────────────────────────────── */}
          <Card title="Profile Information">
            <form onSubmit={handleProfileSave} className="space-y-4" noValidate>

              <Field label="Full Name" error={profileErrors.name}>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => {
                      setProfile((p) => ({ ...p, name: e.target.value }));
                      if (profileErrors.name) setProfileErrors((p) => ({ ...p, name: '' }));
                    }}
                    className={`${inputClass(!!profileErrors.name)} pl-9`}
                    placeholder="Your full name"
                  />
                </div>
              </Field>

              <Field label="Email Address">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    className="w-full px-3 py-2 pl-9 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">Email cannot be changed</p>
              </Field>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={profileLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {profileLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Saving…</>
                    : <><Save className="w-4 h-4" aria-hidden="true" /> Save Changes</>}
                </button>
              </div>
            </form>
          </Card>

          {/* ── Account Info ──────────────────────────────────────────────── */}
          <Card title="Account Details">
            <div className="space-y-3 text-sm">
              {[
                { label: 'Account ID',     value: `#${user.id}` },
                { label: 'Email Verified', value: user.emailVerified ? '✓ Verified' : '✗ Not Verified' },
                { label: 'Member Since',   value: memberSince },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <span className="text-gray-500 dark:text-gray-400">{label}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* ── Change Password ───────────────────────────────────────────── */}
          <Card title="Change Password">
            <form onSubmit={handlePasswordChange} className="space-y-4" noValidate>

              {/* Current password */}
              <Field label="Current Password" error={passwordErrors.currentPassword}>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={passwords.currentPassword}
                    onChange={(e) => {
                      setPasswords((p) => ({ ...p, currentPassword: e.target.value }));
                      if (passwordErrors.currentPassword) setPasswordErrors((p) => ({ ...p, currentPassword: '' }));
                    }}
                    className={`${inputClass(!!passwordErrors.currentPassword)} pl-9 pr-10`}
                    placeholder="Enter current password"
                  />
                  <button type="button" onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>

              {/* New password */}
              <Field label="New Password" error={passwordErrors.newPassword}>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={passwords.newPassword}
                    onChange={(e) => {
                      setPasswords((p) => ({ ...p, newPassword: e.target.value }));
                      if (passwordErrors.newPassword) setPasswordErrors((p) => ({ ...p, newPassword: '' }));
                    }}
                    className={`${inputClass(!!passwordErrors.newPassword)} pl-9 pr-10`}
                    placeholder="Enter new password"
                  />
                  <button type="button" onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">Minimum 8 characters</p>
              </Field>

              {/* Confirm password */}
              <Field label="Confirm New Password" error={passwordErrors.confirmPassword}>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={passwords.confirmPassword}
                    onChange={(e) => {
                      setPasswords((p) => ({ ...p, confirmPassword: e.target.value }));
                      if (passwordErrors.confirmPassword) setPasswordErrors((p) => ({ ...p, confirmPassword: '' }));
                    }}
                    className={`${inputClass(!!passwordErrors.confirmPassword)} pl-9 pr-10`}
                    placeholder="Repeat new password"
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {passwordLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Updating…</>
                    : <><Lock className="w-4 h-4" aria-hidden="true" /> Update Password</>}
                </button>
              </div>
            </form>
          </Card>

          {/* ── Danger Zone ───────────────────────────────────────────────── */}
          <Card title="Account Actions">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Sign Out</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Sign out of your account on this device</p>
              </div>
              <button
                onClick={async () => { await logout(); router.push('/'); }}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}