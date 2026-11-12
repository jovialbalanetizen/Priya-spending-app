import React, { useState } from 'react';
import {
  CheckCircle2,
  Fingerprint,
  Lock,
  MessageSquarePlus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { db } from '../db/database';
import type { AppSettings } from '../types/models';
import { loadSampleData } from '../utils/sampleData';

export interface ToastMessage {
  id: string;
  message: string;
  undoLabel?: string;
  onUndo?: () => Promise<void> | void;
}

export const ToastBar: React.FC<{
  toast: ToastMessage | null;
  onDismiss: () => void;
}> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:w-96 z-50 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white px-4 py-3 shadow-xl border border-slate-700">
      <div className="flex items-center gap-2.5 min-w-0">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-sm font-medium truncate">{toast.message}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {toast.onUndo && (
          <button
            onClick={async () => {
              await toast.onUndo?.();
              onDismiss();
            }}
            className="min-h-[36px] px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{toast.undoLabel || 'Undo'}</span>
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Close notification"
          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const FirstRunOnboardingModal: React.FC<{
  settings: AppSettings;
  onComplete: (loadedSamples: boolean) => void;
}> = ({ settings, onComplete }) => {
  const [loading, setLoading] = useState(false);

  if (settings.onboardingCompleted) return null;

  const handleStartWithSample = async () => {
    setLoading(true);
    await loadSampleData();
    await db.settings.update('default', { onboardingCompleted: true });
    setLoading(false);
    onComplete(true);
  };

  const handleStartFresh = async () => {
    await db.settings.update('default', { onboardingCompleted: true });
    onComplete(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            Welcome to SpendWise India
          </span>
          <button
            onClick={handleStartFresh}
            aria-label="Skip onboarding"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
          Track Indian Bank SMS, UPI & Monthly Budgets — 100% On Your Device
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          SpendWise turns bank & UPI alerts into clean monthly insights without uploading your raw SMS inbox to any cloud server.
        </p>

        <div className="mt-6 space-y-3">
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
            <MessageSquarePlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                4 Ways to Capture Transactions
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Share SMS directly from Android, paste multiple bank SMS messages, scan a receipt, or log manually in under 10 seconds.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
            <Wallet className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Indian Numbering (₹1,25,000) & Smart Categorization
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Automatically recognizes Swiggy, Zomato, BigBasket, DMart, IRCTC, BESCOM, and learns when you recategorize a merchant.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
            <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Private IndexedDB Storage + Encrypted Backups
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Works offline as an installable PWA. Optional PIN lock and AES-GCM-256 encrypted backups keep your ledger safe.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-7 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleStartWithSample}
            disabled={loading}
            className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loading ? 'Loading 80+ Transactions...' : 'Explore with Sample Data (80+ Txns)'}</span>
          </button>
          <button
            onClick={handleStartFresh}
            className="min-h-[48px] px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors cursor-pointer"
          >
            Start Empty
          </button>
        </div>
      </div>
    </div>
  );
};

export const AppLockScreen: React.FC<{
  settings: AppSettings;
  onUnlock: () => void;
}> = ({ settings, onUnlock }) => {
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');

  const handleDigit = (digit: string) => {
    setError('');
    const next = (pinInput + digit).slice(0, 4);
    setPinInput(next);
    if (next.length === 4) {
      if (next === settings.pinCode) {
        onUnlock();
      } else {
        setError('Incorrect PIN. Please try again.');
        setTimeout(() => setPinInput(''), 350);
      }
    }
  };

  const handleBiometricUnlock = async () => {
    try {
      if (!window.PublicKeyCredential) {
        setError('WebAuthn biometrics not supported in this browser.');
        return;
      }
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 30000,
          userVerification: 'required',
        },
      });
      onUnlock();
    } catch {
      setError('Biometric verification cancelled or unavailable. Use your 4-digit PIN.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-white p-6">
      <div className="w-full max-w-xs text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7 text-emerald-400" />
        </div>
        <h2 className="mt-4 text-xl font-bold">SpendWise Locked</h2>
        <p className="mt-1 text-xs text-slate-400">
          Enter your 4-digit PIN to unlock your financial ledger
        </p>

        <div className="mt-6 flex items-center justify-center gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border transition-all ${
                pinInput.length > idx
                  ? 'bg-emerald-400 border-emerald-400 scale-110'
                  : 'border-slate-600 bg-slate-900'
              }`}
            />
          ))}
        </div>

        {error && <p className="mt-3 text-xs text-rose-400 font-medium">{error}</p>}

        <div className="mt-8 grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-lg font-mono font-semibold transition-colors cursor-pointer"
            >
              {digit}
            </button>
          ))}
          {settings.biometricsEnabled ? (
            <button
              onClick={handleBiometricUnlock}
              aria-label="Unlock with Biometrics"
              className="h-14 rounded-2xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400 cursor-pointer"
            >
              <Fingerprint className="w-6 h-6" />
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-lg font-mono font-semibold transition-colors cursor-pointer"
          >
            0
          </button>
          <button
            onClick={() => setPinInput((p) => p.slice(0, -1))}
            className="h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};
