import React, { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Mail,
  Lock,
  User,
  ArrowRight,
  RefreshCw,
  LogOut,
  Clock,
  Sparkles,
  Store,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { staffService, InvitationDetails } from '../services/staffService';
import { StaffRole } from '../types/auth';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../config/firebase';

const ROLE_METADATA: Record<
  StaffRole,
  { label: string; color: string; bg: string; border: string; description: string }
> = {
  owner: {
    label: 'Owner',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    description: 'Full restaurant management, staff, financial settings, and billing operations.'
  },
  manager: {
    label: 'Manager',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    description: 'Operations, orders, tables, menu, reports, refunds, and viewing staff.'
  },
  cashier: {
    label: 'Cashier',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    description: 'POS terminal, taking orders, processing payments, and daily drawer summaries.'
  },
  captain: {
    label: 'Captain / Waiter',
    color: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    description: 'Table management, guest sessions, taking orders, and serving KOTs.'
  },
  kitchen: {
    label: 'Kitchen / Chef',
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    description: 'KOT queue, prep workflow, and marking kitchen order tickets ready.'
  },
  accountant: {
    label: 'Accountant',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    description: 'Financial reports, settlement audits, order history, and business analytics.'
  }
};

interface AcceptInvitationPageProps {
  token?: string;
  onComplete?: () => void;
}

export const AcceptInvitationPage: React.FC<AcceptInvitationPageProps> = ({ token: propToken, onComplete }) => {
  const { user, login, register, loginGoogle, logout } = useAuth();

  // Parse token from props or URL query string
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const token = propToken || urlParams.get('token') || '';

  const [invitationDetails, setInvitationDetails] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auth form states
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const fetchDetails = async () => {
    if (!token) {
      setError('No invitation token provided in the URL.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const details = await staffService.getInvitationByToken(token);
      if (!details) {
        setError('This invitation link is invalid or no longer exists.');
      } else {
        setInvitationDetails(details);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve invitation details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [token]);

  // Attempt auto-claim if user is authenticated & verified & matching email
  useEffect(() => {
    if (user && invitationDetails && !loading && !isClaiming) {
      const userEmail = user.email?.toLowerCase();
      const invitedEmail = invitationDetails.invitation.email?.toLowerCase();

      const isGoogleAuth = Boolean(
        user.providerData?.some((p) => p.providerId === 'google.com') ||
        auth.currentUser?.providerData?.some((p) => p.providerId === 'google.com')
      );
      const isVerified = Boolean(user.emailVerified || auth.currentUser?.emailVerified || isGoogleAuth);

      if (
        userEmail === invitedEmail &&
        isVerified &&
        !invitationDetails.isExpired &&
        !invitationDetails.isRevoked &&
        !invitationDetails.isAccepted
      ) {
        handleClaimInvitation();
      }
    }
  }, [user, invitationDetails, loading]);

  const handleClaimInvitation = async () => {
    if (!user || !token) return;
    setIsClaiming(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await staffService.claimInvitationWithToken(token, user);
      setSuccessMessage(`Congratulations! You have successfully joined "${invitationDetails?.restaurantName}" as ${ROLE_METADATA[invitationDetails?.invitation.role || 'captain'].label}.`);
      setTimeout(() => {
        if (onComplete) {
          onComplete();
        } else if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to claim invitation.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitationDetails?.invitation.email) return;
    const email = invitationDetails.invitation.email;

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setError(null);
    setIsSubmittingAuth(true);

    try {
      if (authMode === 'register') {
        const nameToUse = displayName.trim() || invitationDetails.invitation.displayName || 'Staff Member';
        await register(email, password, nameToUse);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);

    try {
      await loginGoogle(false);
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setVerificationSent(true);
      setTimeout(() => setVerificationSent(false), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-2xl shadow-indigo-600/40 animate-pulse mb-4">
          <UtensilsCrossed className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">RestaurantOS</h1>
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
          Validating staff invitation token...
        </p>
      </div>
    );
  }

  const { invitation, restaurantName, isExpired, isRevoked, isAccepted } = invitationDetails || {
    invitation: {} as any,
    restaurantName: 'RestaurantOS',
    isExpired: false,
    isRevoked: false,
    isAccepted: false
  };

  const roleMeta = ROLE_METADATA[invitation.role || 'captain'] || ROLE_METADATA.captain;
  const userEmail = user?.email?.toLowerCase();
  const invitedEmail = invitation.email?.toLowerCase();
  const isGoogleAuth = Boolean(
    user?.providerData?.some((p) => p.providerId === 'google.com') ||
    auth.currentUser?.providerData?.some((p) => p.providerId === 'google.com')
  );
  const isEmailVerified = Boolean(user?.emailVerified || auth.currentUser?.emailVerified || isGoogleAuth);
  const isEmailMatch = userEmail === invitedEmail;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
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
        <h2 className="mt-5 text-center text-2xl font-extrabold text-white tracking-tight">
          Restaurant<span className="text-indigo-400">OS</span> Staff Onboarding
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Accept your official staff invitation and access your outlet team dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-slate-100 space-y-6">
          {/* Header Banner */}
          {invitationDetails && (
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-bold">
                <Store className="w-3.5 h-3.5" />
                <span>{restaurantName}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Invitation for {invitation.displayName || invitation.email}
              </h3>
              <div className="flex items-center justify-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${roleMeta.bg} ${roleMeta.color} ${roleMeta.border}`}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {roleMeta.label}
                </span>
              </div>
            </div>
          )}

          {/* Messages */}
          {successMessage && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium space-y-2 text-center animate-fadeIn">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
              <p className="font-bold text-sm text-emerald-900">{successMessage}</p>
              <p className="text-[11px] text-emerald-700">Redirecting to your dashboard...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-rose-900">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Invitation Issue</span>
              </div>
              <p className="text-rose-700 leading-relaxed">{error}</p>
            </div>
          )}

          {/* Invalid or Missing Token */}
          {!invitationDetails && !loading && (
            <div className="text-center space-y-4 py-4">
              <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">Invalid Invitation Link</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                This invitation link is invalid, malformed, or has expired. Please ask your restaurant manager to send a new invitation link.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => { window.location.href = '/'; }}
              >
                Go to Sign In Page
              </Button>
            </div>
          )}

          {/* Expired State */}
          {invitationDetails && isExpired && (
            <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-3 text-center">
              <Clock className="w-8 h-8 text-amber-600 mx-auto" />
              <h3 className="font-bold text-sm text-amber-900">Invitation Link Expired</h3>
              <p className="text-amber-700 leading-relaxed">
                This staff invitation link expired. Please ask your restaurant manager to resend a fresh invitation to <strong className="text-slate-900">{invitedEmail}</strong>.
              </p>
            </div>
          )}

          {/* Revoked State */}
          {invitationDetails && isRevoked && !isExpired && (
            <div className="p-5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 text-xs space-y-3 text-center">
              <ShieldAlert className="w-8 h-8 text-slate-500 mx-auto" />
              <h3 className="font-bold text-sm text-slate-900">Invitation Revoked</h3>
              <p className="text-slate-600 leading-relaxed">
                This invitation has been revoked or deactivated by the restaurant management. Please contact your manager if you believe this was an error.
              </p>
            </div>
          )}

          {/* Already Accepted State */}
          {invitationDetails && isAccepted && !isExpired && !isRevoked && (
            <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs space-y-3 text-center">
              <CheckCircle2 className="w-8 h-8 text-indigo-600 mx-auto" />
              <h3 className="font-bold text-sm text-indigo-900">Invitation Already Claimed</h3>
              <p className="text-indigo-700 leading-relaxed">
                This staff invitation has already been accepted and linked. You can log into your account directly.
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="w-full bg-indigo-600 text-white"
                onClick={() => { window.location.href = '/'; }}
              >
                Go to Sign In Page
              </Button>
            </div>
          )}

          {/* Valid Pending State */}
          {invitationDetails && !isExpired && !isRevoked && !isAccepted && (
            <>
              {/* STATE 1: User Not Authenticated */}
              {!user && (
                <div className="space-y-5">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
                    To claim this invitation and join <strong className="text-slate-900">{restaurantName}</strong>, create an account or sign in with <strong className="text-indigo-600 font-semibold">{invitedEmail}</strong>.
                  </div>

                  {/* Primary Google Sign In */}
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading}
                    className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2.5 transition-all disabled:opacity-60"
                  >
                    <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
                        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                      </svg>
                    </div>
                    <span>{isGoogleLoading ? 'Connecting...' : 'Sign In with Google'}</span>
                  </button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-2 text-slate-400">Or use Email & Password</span>
                    </div>
                  </div>

                  {/* Password Registration / Login Form */}
                  <form onSubmit={handleAuthSubmit} className="space-y-3">
                    <div>
                      <Input
                        label="Invited Email Address"
                        type="email"
                        value={invitedEmail}
                        disabled
                        leftIcon={<Mail className="w-4 h-4 text-slate-400" />}
                      />
                    </div>

                    {authMode === 'register' && (
                      <div>
                        <Input
                          label="Your Name"
                          type="text"
                          placeholder="e.g. Ramesh Kumar"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          leftIcon={<User className="w-4 h-4" />}
                          required
                        />
                      </div>
                    )}

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
                    </div>

                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      isLoading={isSubmittingAuth}
                      rightIcon={<ArrowRight className="w-4 h-4" />}
                    >
                      {authMode === 'register' ? 'Create Account & Accept Invitation' : 'Sign In & Accept Invitation'}
                    </Button>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => setAuthMode(authMode === 'register' ? 'login' : 'register')}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        {authMode === 'register' ? 'Already have an account? Sign In' : 'Need a new account? Register'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* STATE 2: Authenticated but Email Mismatch */}
              {user && !isEmailMatch && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-3">
                  <div className="flex items-center gap-2 font-bold text-amber-800">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Account Email Mismatch</span>
                  </div>
                  <p className="text-amber-700 leading-relaxed">
                    You are currently signed in as <strong className="text-slate-900">{userEmail}</strong>, but this invitation was issued strictly to <strong className="text-slate-900">{invitedEmail}</strong>.
                  </p>
                  <p className="text-amber-700">
                    Please sign out and log in with <strong className="text-indigo-700">{invitedEmail}</strong> to claim this staff role.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={logout}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out & Switch Account
                  </Button>
                </div>
              )}

              {/* STATE 3: Authenticated but Email Not Verified */}
              {user && isEmailMatch && !isEmailVerified && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-3">
                  <div className="flex items-center gap-2 font-bold text-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Email Verification Required</span>
                  </div>
                  <p className="text-amber-700 leading-relaxed">
                    Your email address <strong className="text-slate-900">{userEmail}</strong> has not been verified yet. Security mandates that your email address must be verified before claiming staff permissions.
                  </p>
                  {verificationSent && (
                    <p className="p-2 bg-emerald-100 text-emerald-800 rounded-lg text-center font-semibold">
                      Verification link sent! Check your email inbox.
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResendVerification}
                      className="w-1/2 text-[11px]"
                    >
                      Resend Email
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => { window.location.reload(); }}
                      className="w-1/2 text-[11px] bg-indigo-600 text-white"
                    >
                      Refresh Status
                    </Button>
                  </div>
                </div>
              )}

              {/* STATE 4: Authenticated, Email Verified & Email Matches -> Claim Button */}
              {user && isEmailMatch && isEmailVerified && !successMessage && (
                <div className="space-y-4 text-center">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Verified identity confirmed for {userEmail}</span>
                  </div>

                  <p className="text-xs text-slate-600">
                    Click below to claim your staff membership and join <strong className="text-slate-900">{restaurantName}</strong> as <strong className="text-indigo-600">{roleMeta.label}</strong>.
                  </p>

                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    isLoading={isClaiming}
                    onClick={handleClaimInvitation}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 py-3"
                  >
                    Accept Invitation & Join Team
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
