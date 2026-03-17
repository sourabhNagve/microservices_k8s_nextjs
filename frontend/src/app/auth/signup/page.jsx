'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, User, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';  // ✅ no more direct auth.js imports
import { useToast } from '@/components/Toast';

const PASSWORD_RULES = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

const getFriendlyError = (message = '') => {
  const msg = message.toLowerCase();
  if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate'))
    return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('too many') || msg.includes('rate limit'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Network error. Please check your connection.';
  return 'Something went wrong. Please try again.';
};

const validateForm = ({ name, email, password, confirmPassword }) => {
  if (!name.trim()) return 'Full name is required.';
  if (name.trim().length < 2) return 'Name must be at least 2 characters.';
  if (!email.trim()) return 'Email address is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  if (!password) return 'Password is required.';
  if (!PASSWORD_RULES.test(password))
    return 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.';
  if (password !== confirmPassword) return 'Passwords do not match.';
  return null;
};

export default function SignUp() {
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', confirmPassword: '',
  });
  const [showPassword,        setShowPassword]        = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error,               setError]               = useState('');
  const [success,             setSuccess]             = useState(false);

  const [isEmailLoading,  setIsEmailLoading]  = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const router = useRouter();

  // ✅ register and loginWithGoogle from context — no setUser exposed
  const { register, loginWithGoogle } = useAuth();
  const toast = useToast();

  // Stable refs to avoid stale closures in Google callback
  const loginWithGoogleRef = useRef(loginWithGoogle);
  const routerRef          = useRef(router);
  const toastRef           = useRef(toast);
  useEffect(() => { loginWithGoogleRef.current = loginWithGoogle; }, [loginWithGoogle]);
  useEffect(() => { routerRef.current = router; },                  [router]);
  useEffect(() => { toastRef.current = toast; },                    [toast]);

  const handleGoogleCredential = useCallback(async (response) => {
    setIsGoogleLoading(true);
    setError('');
    try {
      // ✅ loginWithGoogle from context — handles setUser internally
      await loginWithGoogleRef.current(response.credential);
      toastRef.current.success('Successfully signed up with Google!');
      routerRef.current.push('/');
    } catch (err) {
      const friendly = getFriendlyError(err.message);
      setError(friendly);
      toastRef.current.error(friendly);
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initializeGoogleSignUp = () => {
      try {
        const google = window.google;
        if (!google?.accounts) return;

        google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
          auto_select: false,
          cancel_on_tap_outside: false,
        });

        const container = document.getElementById('google-signup-button');
        if (container) {
          google.accounts.id.renderButton(container, {
            theme:          'outline',
            size:           'large',
            text:           'signup_with',
            shape:          'rectangular',
            logo_alignment: 'left',
            width:          400,  // ✅ fixed px value — GSI rejects percentage strings
          });
        }
      } catch (err) {
        console.warn('Google Sign-Up initialization failed:', err);
      }
    };

    if (window.google) {
      initializeGoogleSignUp();
      return;
    }

    const checkGoogle = setInterval(() => {
      if (window.google) {
        clearInterval(checkGoogle);
        initializeGoogleSignUp();
      }
    }, 100);

    return () => clearInterval(checkGoogle);
  }, [handleGoogleCredential]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const handleEmailSignUp = async (e) => {
    e.preventDefault();

    const validationError = validateForm(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsEmailLoading(true);
    setError('');

    try {
      // ✅ register from context — matches signUp(name, email, password) signature
      await register(formData.name.trim(), formData.email.trim(), formData.password);
      setSuccess(true);
      toast.success('Account created! Redirecting to sign in…');
      setTimeout(() => {
        router.push('/auth/signin?message=Registration successful! Please sign in.');
      }, 2000);
    } catch (err) {
      const friendly = getFriendlyError(err.message);
      setError(friendly);
      toast.error(friendly);
    } finally {
      setIsEmailLoading(false);
    }
  };

  const isAnyLoading = isEmailLoading || isGoogleLoading;

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-900 flex items-center justify-center py-12 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700 max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account Created!</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Your account has been created successfully. Redirecting you to sign in…
          </p>
          <div className="flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400 rounded-full filter blur-3xl opacity-10 animate-pulse" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-400 rounded-full filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-indigo-400 rounded-full filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative max-w-md w-full space-y-8 animate-fade-in">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <img className="dark:invert h-12 w-auto" src="/next.svg" alt="MicroStore" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Create Account</h1>
          <p className="text-gray-600 dark:text-gray-300">Sign up to get started for free</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">

          {error && (
            <div role="alert" className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
                <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
              </div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleEmailSignUp} noValidate>

            {/* Full Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  id="name" name="name" type="text" autoComplete="name" required
                  value={formData.name} onChange={handleChange} disabled={isAnyLoading}
                  className="input w-full pl-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Your full name"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  id="email" name="email" type="email" autoComplete="email" required
                  value={formData.email} onChange={handleChange} disabled={isAnyLoading}
                  className="input w-full pl-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  id="password" name="password" type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password" required
                  value={formData.password} onChange={handleChange} disabled={isAnyLoading}
                  className="input w-full pl-10 pr-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Create a password"
                />
                <button
                  type="button" onClick={() => setShowPassword((v) => !v)} disabled={isAnyLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:pointer-events-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                Min. 8 characters with uppercase, lowercase, number, and special character.
              </p>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  id="confirmPassword" name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password" required
                  value={formData.confirmPassword} onChange={handleChange} disabled={isAnyLoading}
                  className="input w-full pl-10 pr-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Repeat your password"
                />
                <button
                  type="button" onClick={() => setShowConfirmPassword((v) => !v)} disabled={isAnyLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:pointer-events-none"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isAnyLoading} className="w-full btn-primary focus-ring disabled:opacity-50 disabled:cursor-not-allowed">
              {isEmailLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Creating account…
                </span>
              ) : 'Create Account'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6" aria-hidden="true">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Or continue with</span>
            </div>
          </div>

          {/* Google Sign-Up */}
          <div className="mt-6">
            {isGoogleLoading ? (
              <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 py-2">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span className="text-sm">Signing up with Google…</span>
              </div>
            ) : (
              <div id="google-signup-button" className="w-full" />
            )}
          </div>

          <div className="text-center pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Already have an account?{' '}
              <Link href="/auth/signin" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <div className="text-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/privacy" className="hover:text-gray-700 dark:hover:text-gray-300">Privacy Policy</Link>
          <Link href="/terms"   className="hover:text-gray-700 dark:hover:text-gray-300">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}