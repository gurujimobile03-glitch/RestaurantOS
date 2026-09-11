import React, { useState } from 'react';
import { Sidebar, AdminView } from './Sidebar';
import { Header } from './Header';
import { useRestaurant } from '../../context/RestaurantContext';
import { ShieldAlert, RefreshCw, ExternalLink } from 'lucide-react';
import { SecurityRulesNotice } from '../common/SecurityRulesNotice';

interface AdminLayoutProps {
  currentView: AdminView;
  onNavigate: (view: AdminView) => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentView,
  onNavigate,
  children
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { restaurant, error, retry, loading: restaurantLoading, isSwitching } = useRestaurant();

  const isPermissionError =
    error &&
    (error.toLowerCase().includes('permission') ||
      error.toLowerCase().includes('insufficient'));

  const isOfflineError =
    error &&
    (error.toLowerCase().includes('offline') ||
      error.toLowerCase().includes('network') ||
      error.toLowerCase().includes('backend didn\'t respond') ||
      error.toLowerCase().includes('could not reach'));

  return (
    <div className="min-h-screen bg-slate-50 flex relative">
      {/* Switching Context Overlay */}
      {isSwitching && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex flex-col items-center justify-center transition-all duration-200">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xl flex flex-col items-center max-w-sm text-center mx-4 animate-in zoom-in-95 duration-150">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
            <h3 className="text-sm font-bold text-slate-900">Switching Outlet Context</h3>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
              Verifying credentials, updating database session channels, and loading real-time settings...
            </p>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        <Header
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onNavigateToSetup={() => onNavigate('restaurant')}
        />

        {error && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm text-amber-900">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-amber-950">
                    {isPermissionError
                      ? 'Firestore Security Rules Configuration Required'
                      : isOfflineError
                      ? 'Network / Offline Notice'
                      : 'Database Synchronization Notice'}
                  </h3>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    {isPermissionError ? (
                      <>
                        The active Firestore database on project{' '}
                        <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900 font-bold">
                          restaurantos-e31b2
                        </code>{' '}
                        rejected read/write access. Ensure you have published the updated{' '}
                        <span className="font-semibold">firestore.rules</span> in your Firebase Console.
                      </>
                    ) : isOfflineError ? (
                      <>
                        Cloud Firestore was temporarily unable to reach the backend service. If your internet connection is active, click <span className="font-semibold">Retry Connection</span> below.
                      </>
                    ) : (
                      error
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {isPermissionError && (
                      <a
                        href="https://console.firebase.google.com/project/restaurantos-e31b2/firestore/rules"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
                      >
                        Open Firebase Rules Console
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={retry}
                      disabled={restaurantLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100/50 text-amber-900 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${restaurantLoading ? 'animate-spin' : ''}`} />
                      {restaurantLoading ? 'Retrying...' : 'Retry Connection'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <SecurityRulesNotice />

        <main className={`flex-1 p-4 sm:p-6 ${['pos', 'kitchen', 'captain'].includes(currentView) ? 'max-w-none w-full' : 'max-w-7xl w-full mx-auto'}`}>
          {restaurantLoading && !restaurant ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
              <h3 className="text-base font-semibold text-slate-800">Connecting to Firestore</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Resolving restaurant profile and synchronizing real-time menu data...
              </p>
            </div>
          ) : !restaurant && error ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center max-w-md mx-auto my-12 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200/60">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-900 mb-1.5">Restaurant Data Unavailable</h2>
              <p className="text-xs text-slate-600 mb-6 leading-relaxed">
                {error}
              </p>
              <button
                onClick={retry}
                disabled={restaurantLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors w-full disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${restaurantLoading ? 'animate-spin' : ''}`} />
                {restaurantLoading ? 'Connecting...' : 'Retry Connection'}
              </button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
};
