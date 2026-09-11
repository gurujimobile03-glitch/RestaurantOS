import React, { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  Lock,
  Mail,
  User,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  Copy,
  Check,
  Globe,
  RefreshCw
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { firebaseConfig, auth } from '../config/firebase';

export const LoginPage: React.FC = () => {
  const { login, register, loginGoogle, redirectError, clearRedirectError } = useAuth();
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isOperationNotAllowed, setIsOperationNotAllowed] = useState(false);
  const [isDomainError, setIsDomainError] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleForgotPassword = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address above first to send a password reset link.');
      return;
    }
    setError(null);
    setResetMessage(null);
    setIsResetting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetMessage(`Password reset link dispatched to ${email}. Please check your inbox and spam folder.`);
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        setError(`No account found with email ${email}. Please register with this email first or sign in with Google.`);
      } else {
        setError(err?.message || 'Could not send password reset email. You can also sign in with Google.');
      }
    } finally {
      setIsResetting(false);
    }
  };

  // Runtime environment detection
  const runtimeHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  // Prefill email from URL if scanned from QR Code
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get('email');
      if (emailParam) {
        setEmail(emailParam.trim());
        setShowEmailAuth(true);
      }
    }
  }, []);

  // React to any captured redirect errors on initial load
  useEffect(() => {
    if (redirectError) {
      setErrorCode(redirectError.code || 'unknown');
      const isDomainRelated =
        redirectError.code === 'auth/unauthorized-domain' ||
        redirectError.code === 'auth/bad-request' ||
        redirectError.message.toLowerCase().includes('unauthorized domain') ||
        redirectError.message.toLowerCase().includes('invalid action');

      if (isDomainRelated) {
        setIsDomainError(true);
        setError('Google Sign-In was blocked because this runtime domain is not yet added to Authorized Domains in Firebase.');
      } else {
        setError(redirectError.message);
      }
    }
  }, [redirectError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorCode(null);
    setIsOperationNotAllowed(false);
    setIsDomainError(false);

    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    if (isRegistering && !displayName.trim()) {
      setError('Please provide your name or restaurant manager name.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      if (isRegistering) {
        await register(email, password, displayName);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setErrorCode(err?.code || 'unknown');
      if (err.code === 'auth/operation-not-allowed') {
        setIsOperationNotAllowed(true);
        setError('Email/Password provider is not enabled in Firebase Console. Please use "Continue with Google" above or enable Email/Password in your Firebase Console.');
      } else if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        setError('Invalid email or password. Please verify credentials or sign in with Google.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('This email address is already registered. Please sign in instead.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        console.warn('Firebase Auth notice:', err?.code || err?.message || err);
        setError(err.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setErrorCode(null);
    setIsOperationNotAllowed(false);
    setIsDomainError(false);
    clearRedirectError();
    setIsGoogleLoading(true);

    try {
      await loginGoogle(false);
    } catch (err: any) {
      const code = err?.code || 'unknown';
      const msg = err?.message || 'Google sign-in could not be completed.';
      setErrorCode(code);

      console.warn('[RestaurantOS Google Auth Debug] Sign-in error handler caught:', {
        code,
        message: msg,
        runtimeHostname,
        projectId: firebaseConfig.projectId
      });

      if (
        code === 'auth/unauthorized-domain' ||
        code === 'auth/bad-request' ||
        msg.toLowerCase().includes('unauthorized domain') ||
        msg.toLowerCase().includes('invalid action') ||
        msg.toLowerCase().includes('redirect_uri_mismatch')
      ) {
        setIsDomainError(true);
        setError('Google Sign-In was blocked because this runtime domain is not listed in Authorized Domains in Firebase Authentication.');
      } else if (code === 'auth/popup-blocked') {
        setError(`[${code}] Popup was blocked by your browser. Please allow popups for this site.`);
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError(`[${code}] Authentication was cancelled or the sign-in window was closed before completion.`);
      } else if (code === 'auth/operation-not-allowed') {
        setError(`[${code}] Google Sign-In provider is disabled in Firebase Authentication. Please enable Google in Firebase Console.`);
      } else {
        setError(`[${code}] ${msg}`);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const copyRuntimeDomain = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(runtimeHostname).then(() => {
        setCopiedDomain(true);
        setTimeout(() => setCopiedDomain(false), 2500);
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute inset-0 bg-[radial-gradient(#312e81_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-indigo-600/15 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-indigo-900/20 blur-3xl" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-indigo-600/30">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
        </div>
        <h2 className="mt-5 text-center text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Restaurant<span className="text-indigo-400">OS</span>
        </h2>
        <p className="mt-1.5 text-center text-xs sm:text-sm text-slate-400">
          {isRegistering ? 'Create your Web Admin owner account' : 'Sign in to your restaurant admin console'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-slate-100">
          {/* Primary Google Sign-In Card */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading}
              className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-3 transition-all transform active:scale-[0.99] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
              </div>
              <span>{isGoogleLoading ? 'Connecting with Google...' : 'Continue with Google'}</span>
            </button>
          </div>

          {/* Dedicated Domain Authorization Warning Card */}
          {isDomainError && (
            <div className="mt-5 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-3">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <Globe className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Domain Authorization Required by Firebase</span>
              </div>
              <p className="text-amber-700 leading-relaxed">
                Firebase Authentication blocks sign-in with <span className="font-semibold">"The requested action is invalid"</span> because this app's current runtime domain is not yet authorized in your Firebase project.
              </p>
              <div className="bg-white/90 p-3 rounded-xl border border-amber-200/90 font-mono text-[11px] space-y-2 text-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Required Domain:</span>
                  <button
                    type="button"
                    onClick={copyRuntimeDomain}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    {copiedDomain ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedDomain ? 'Copied!' : 'Copy Domain'}</span>
                  </button>
                </div>
                <div className="p-1.5 bg-slate-50 rounded border border-slate-200 break-all text-indigo-700 select-all font-semibold">
                  {runtimeHostname || 'ais-dev-4rf3jgxyfvttprip76s56n-1055228822160.asia-southeast1.run.app'}
                </div>
                <div className="pt-1 text-slate-600 space-y-1 text-[11px]">
                  <p>1. Open <strong>Firebase Console</strong> → <strong>Authentication</strong> → <strong>Settings</strong></p>
                  <p>2. Select <strong>Authorized domains</strong> tab</p>
                  <p>3. Click <strong>Add domain</strong>, paste the domain above, and click <strong>Save</strong></p>
                </div>
              </div>
              <div className="pt-1">
                <a
                  href="https://console.firebase.google.com/project/restaurantos-e31b2/authentication/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-800 underline text-xs"
                >
                  <span>Open Firebase Authorized Domains</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Explicit Error Card when Email/Password is unconfigured in Firebase Console */}
          {isOperationNotAllowed && (
            <div className="mt-5 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Email/Password Provider Not Enabled</span>
              </div>
              <p className="text-amber-700 leading-relaxed">
                By default, new Google Cloud Firebase projects require the Email/Password sign-in method to be turned ON in the Firebase Console:
              </p>
              <div className="bg-white/85 p-2.5 rounded-xl border border-amber-200/80 font-mono text-[11px] space-y-1 text-slate-700">
                <p>1. Open <strong>Firebase Console</strong> → <strong>Authentication</strong></p>
                <p>2. Select the <strong>Sign-in method</strong> tab</p>
                <p>3. Click <strong>Email/Password</strong> → Toggle <strong>Enable</strong> to ON → <strong>Save</strong></p>
              </div>
              <div className="pt-1 flex items-center justify-between">
                <a
                  href="https://console.firebase.google.com/project/restaurantos-e31b2/authentication/providers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700 underline"
                >
                  Open Firebase Console
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="font-bold text-emerald-700 hover:text-emerald-800"
                >
                  Use Google Sign-In Instead
                </button>
              </div>
            </div>
          )}

          {error && !isOperationNotAllowed && !isDomainError && (
            <div className="mt-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Divider with toggle for Email/Password */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowEmailAuth(!showEmailAuth);
                  setError(null);
                  setIsOperationNotAllowed(false);
                }}
                className="bg-white px-3 text-slate-500 hover:text-indigo-600 font-medium tracking-tight transition-colors"
              >
                {showEmailAuth ? '▲ Hide Email Options' : '▼ Or sign in with Email & Password'}
              </button>
            </div>
          </div>

          {/* Collapsible Email & Password Section */}
          {showEmailAuth && (
            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 leading-relaxed">
                Note: Email/Password login requires enabling the provider in your Firebase Console.
              </div>

              {isRegistering && (
                <div>
                  <Input
                    label="Your Full Name"
                    type="text"
                    placeholder="e.g. Vikram Sharma"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    leftIcon={<User className="w-4 h-4" />}
                    required
                  />
                </div>
              )}

              <div>
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="manager@restaurant.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="w-4 h-4" />}
                  required
                />
              </div>

              <div>
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="w-4 h-4" />}
                  required
                />
                {!isRegistering && (
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={isResetting}
                      className="text-[11px] font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                    >
                      {isResetting ? 'Sending reset link...' : 'Forgot password?'}
                    </button>
                  </div>
                )}
              </div>

              {resetMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>{resetMessage}</div>
                </div>
              )}

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  isLoading={isLoading}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  {isRegistering ? 'Create Account with Email' : 'Sign In with Email'}
                </Button>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(!isRegistering);
                    setError(null);
                    setIsOperationNotAllowed(false);
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  {isRegistering
                    ? 'Already registered? Sign in with email'
                    : 'Need an account? Register with email'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Milestone Indicator */}
        <p className="mt-6 text-center text-xs text-slate-500">
          RestaurantOS Foundation • Milestone 1 • Cloud Firestore
        </p>
      </div>
    </div>
  );
};
