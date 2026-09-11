import React, { useState, useEffect } from 'react';
import { subscribeToPermissionIssues } from '../../utils/firestoreError';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, Copy, Check, ExternalLink, X } from 'lucide-react';

export const SecurityRulesNotice: React.FC = () => {
  const { profile } = useAuth();
  const [deniedPath, setDeniedPath] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeToPermissionIssues((path) => {
      if (path) {
        setDeniedPath(path);
      }
    });
    return () => unsub();
  }, []);

  if (!deniedPath || isDismissed) {
    return null;
  }

  // Only show administrative security deployment notices to Owners and Managers
  const role = profile?.role || 'owner';
  if (role !== 'owner' && role !== 'manager') {
    return null;
  }

  const handleCopyRules = async () => {
    try {
      // In production/dev, fetch firestore.rules or provide the comprehensive rule snippet
      const res = await fetch('/firestore.rules');
      if (res.ok) {
        const text = await res.text();
        await navigator.clipboard.writeText(text);
      } else {
        await navigator.clipboard.writeText('// Check firestore.rules in the project repository');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="mx-4 sm:mx-6 lg:mx-8 mb-4">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 shadow-sm backdrop-blur-xs text-slate-800 transition-all animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 shrink-0 mt-0.5 border border-amber-500/20">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-amber-900 tracking-tight">
                Firestore Security Rules Deployment Recommended
              </h4>
              <button
                onClick={() => setIsDismissed(true)}
                className="text-amber-700/60 hover:text-amber-900 transition-colors p-1 -mr-1 rounded-lg hover:bg-amber-500/10"
                title="Dismiss notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-amber-800/90 mt-1 leading-relaxed">
              Access to path <code className="px-1 py-0.5 bg-amber-100/70 border border-amber-200/80 rounded text-[10px] font-mono text-amber-900">{deniedPath}</code> was restricted by Cloud Firestore rules. To enable full cloud synchronization for physical tables, KOTs, and immutable audit logs, deploy the project's <code className="font-mono text-amber-900">firestore.rules</code> to your Firebase Console.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 mt-3">
              <button
                onClick={handleCopyRules}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold shadow-xs transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied to Clipboard!' : 'Copy firestore.rules'}
              </button>
              <a
                href="https://console.firebase.google.com/project/restaurantos-e31b2/firestore/rules"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-50/50 text-amber-900 text-[11px] font-semibold transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-700" />
                Open Firebase Console Rules
              </a>
              <button
                onClick={() => setIsDismissed(true)}
                className="px-2.5 py-1.5 text-[11px] text-amber-700 hover:text-amber-900 font-medium transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
