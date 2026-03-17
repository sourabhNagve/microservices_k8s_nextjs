'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';

// Map raw API errors to safe, user-friendly messages
const getFriendlyError = (message = '') => {
  const msg = message.toLowerCase();
  if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('password'))
    return 'Incorrect email or password. Please try again.';
  if (msg.includes('not found') || msg.includes('no user'))
    return 'No account found with that email address.';
  if (msg.includes('too many') || msg.includes('rate limit'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Network error. Please check your connection.';
  return 'Something went wrong. Please try again.';
};

const validateForm = (email, password) => {
  if (!email.trim()) return 'Email address is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  if (!password) return 'Password is required.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  return null;
};

export default function SignIn() {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe,  setRememberMe]  = useState(false);
  const [error,       setError]       = useState('');

  const [isEmailLoading,  setIsEmailLoading]  = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const router = useRouter();

  // ✅ use login/loginWithGoogle from context — setUser is no longer exposed
  const { login, loginWithGoogle } = useAuth();
  const toast = useToast();

  // Stable refs to avoid stale closures in the Google callback
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
      toastRef.current.success('Successfully signed in with Google!');
      routerRef.current.push('/');
    } catch (err) {
      // Only real failures land here — GSI noise is swallowed by the try/catch
      const friendly = getFriendlyError(err.message);
      setError(friendly);
      toastRef.current.error(friendly);
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initializeGoogleSignIn = () => {
      try {
        const google = window.google;
        if (!google?.accounts) return;

        google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
          auto_select: false,
          cancel_on_tap_outside: false,
        });

        const container = document.getElementById('google-signin-button');
        if (container) {
          google.accounts.id.renderButton(container, {
            theme:          'outline',
            size:           'large',
            text:           'signin_with',
            shape:          'rectangular',
            logo_alignment: 'left',
            width:          400,  // ✅ fixed px value — GSI rejects percentage strings
          });
        }
      } catch (err) {
        console.warn('Google Sign-In initialization failed:', err);
      }
    };

    if (window.google) {
      initializeGoogleSignIn();
      return;
    }

    const checkGoogle = setInterval(() => {
      if (window.google) {
        clearInterval(checkGoogle);
        initializeGoogleSignIn();
      }
    }, 100);

    return () => clearInterval(checkGoogle);
  }, [handleGoogleCredential]);

  const handleEmailSignIn = async (e) => {
    e.preventDefault();

    const validationError = validateForm(email, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsEmailLoading(true);
    setError('');

    try {
      // ✅ login from context — handles setUser internally, takes (email, password)
      await login(email, password);
      toast.success('Successfully signed in!');
      router.push('/');
    } catch (err) {
      const friendly = getFriendlyError(err.message);
      setError(friendly);
      toast.error(friendly);
    } finally {
      setIsEmailLoading(false);
    }
  };

  const isAnyLoading = isEmailLoading || isGoogleLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400 rounded-full filter blur-3xl opacity-10 animate-pulse" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-400 rounded-full filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-indigo-400 rounded-full filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative max-w-md w-full space-y-8 animate-fade-in">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <img className="dark:invert h-12 w-auto" src="/next.svg" alt="MicroStore" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Welcome Back</h1>
          <p className="text-gray-600 dark:text-gray-300">Sign in to your account to continue</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">

          {/* Error Banner */}
          {error && (
            <div role="alert" className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
                <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
              </div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleEmailSignIn} noValidate>
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  id="email" name="email" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  disabled={isAnyLoading}
                  className="input w-full pl-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  id="password" name="password" type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  disabled={isAnyLoading}
                  className="input w-full pl-10 pr-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isAnyLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:pointer-events-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me" name="remember-me" type="checkbox"
                  checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isAnyLoading}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Remember me
                </label>
              </div>
              <Link href="/auth/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                Forgot your password?
              </Link>
            </div>

            {/* Submit */}
            <button type="submit" disabled={isAnyLoading} className="w-full btn-primary focus-ring disabled:opacity-50 disabled:cursor-not-allowed">
              {isEmailLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Signing in…
                </span>
              ) : 'Sign In'}
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

          {/* Google Sign-In */}
          <div className="mt-6">
            {isGoogleLoading ? (
              <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 py-2">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span className="text-sm">Signing in with Google…</span>
              </div>
            ) : (
              <div id="google-signin-button" className="w-full" />
            )}
          </div>

          {/* Sign Up Link */}
          <div className="text-center pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Don't have an account?{' '}
              <Link href="/auth/signup" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                Sign up for free
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/privacy" className="hover:text-gray-700 dark:hover:text-gray-300">Privacy Policy</Link>
          <Link href="/terms"   className="hover:text-gray-700 dark:hover:text-gray-300">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}