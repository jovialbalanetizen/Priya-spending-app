import React, { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  Lock,
  MessageSquareCode,
  Palette,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { DEFAULT_CATEGORIES, db } from '../db/database';
import type { TranslationDictionary } from '../i18n/translations';
import type {
  AppSettings,
  Category,
  Expense,
  MerchantRule,
  PaymentMode,
  SupportedLanguage,
} from '../types/models';
import {
  exportEncryptedBackup,
  exportExpensesCSV,
  exportExpensesPDF,
  exportExpensesXLSX,
  restoreEncryptedBackup,
} from '../utils/cryptoBackup';
import { formatMonthLabel, getTodayISO, getYearMonth } from '../utils/formatters';
import { FIVE_TEST_BANK_SMS, parseSingleSms } from '../utils/smsParser';
import type { ToastMessage } from '../components/GlobalOverlays';
import { PWAInstallButton } from '../components/PWAInstallButton';

interface MorePageProps {
  expenses: Expense[];
  categories: Category[];
  merchantRules: MerchantRule[];
  settings: AppSettings;
  t: TranslationDictionary;
  onShowToast: (toast: ToastMessage) => void;
  onLockNow: () => void;
}

export const MorePage: React.FC<MorePageProps> = ({
  expenses,
  categories,
  merchantRules,
  settings,
  t,
  onShowToast,
  onLockNow,
}) => {
  // Category customization state
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#10B981');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [editingCatColor, setEditingCatColor] = useState('#10B981');

  // PIN Lock setup state
  const [pinDraft, setPinDraft] = useState(settings.pinCode || '');

  // Encrypted backup password state
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [backupStatus, setBackupStatus] = useState('');

  // Export month filter
  const [exportScope, setExportScope] = useState<'ALL' | string>('ALL');

  // Confirm delete all data
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const handleLoadFiveTestSms = async () => {
    const today = getTodayISO();
    const createdIds: string[] = [];

    for (let i = 0; i < FIVE_TEST_BANK_SMS.length; i++) {
      const raw = FIVE_TEST_BANK_SMS[i];
      const parsed = parseSingleSms(raw, merchantRules, today);
      const id = `test-sms-${Date.now()}-${i}`;
      createdIds.push(id);

      await db.expenses.put({
        id,
        amount: parsed.amount,
        merchant: parsed.merchant,
        category: parsed.category,
        date: parsed.date,
        timestamp: Date.now() + i,
        paymentMode: parsed.paymentMode,
        accountLast4: parsed.accountLast4,
        bankName: parsed.bankName,
        rawSms: parsed.rawSms,
        status: 'review',
        source: 'sms',
      });
    }

    onShowToast({
      id: `test-sms-${Date.now()}`,
      message: 'Loaded 5 sample bank SMS messages into your "To Review" inbox on Home',
      undoLabel: 'Undo',
      onUndo: async () => {
        await db.expenses.bulkDelete(createdIds);
      },
    });
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCatName.trim();
    if (!clean) return;
    const id = `cat-${Date.now()}`;
    await db.categories.put({
      id,
      name: clean,
      color: newCatColor,
      icon: 'Tag',
      isDefault: false,
    });
    setNewCatName('');
    onShowToast({
      id: `cat-add-${id}`,
      message: `Added category "${clean}"`,
    });
  };

  const handleSaveCategoryEdit = async (cat: Category) => {
    const clean = editingCatName.trim();
    if (!clean) return;
    const oldName = cat.name;
    await db.categories.update(cat.id, {
      name: clean,
      color: editingCatColor,
    });
    // Also update existing expenses with the old category name
    if (oldName !== clean) {
      const matching = await db.expenses.where('category').equals(oldName).toArray();
      for (const exp of matching) {
        await db.expenses.update(exp.id, { category: clean });
      }
    }
    setEditingCatId(null);
    onShowToast({
      id: `cat-edit-${cat.id}`,
      message: `Updated category "${clean}"`,
    });
  };

  const handleDeleteCategory = async (cat: Category) => {
    await db.categories.delete(cat.id);
    onShowToast({
      id: `cat-del-${cat.id}`,
      message: `Deleted category "${cat.name}"`,
    });
  };

  const handleRegisterWebAuthn = async () => {
    try {
      if (!window.PublicKeyCredential) {
        onShowToast({
          id: `bio-err-${Date.now()}`,
          message: 'WebAuthn biometrics not supported in this browser.',
        });
        return;
      }
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const userId = window.crypto.getRandomValues(new Uint8Array(16));
      await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'SpendWise India' },
          user: {
            id: userId,
            name: 'spendwise-user',
            displayName: 'SpendWise User',
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: { userVerification: 'required' },
          timeout: 30000,
        },
      });
      await db.settings.update('default', { biometricsEnabled: true });
      onShowToast({
        id: `bio-ok-${Date.now()}`,
        message: 'Biometric unlock enabled via WebAuthn',
      });
    } catch {
      await db.settings.update('default', {
        biometricsEnabled: !settings.biometricsEnabled,
      });
    }
  };

  const scopedExpenses =
    exportScope === 'ALL'
      ? expenses
      : expenses.filter((e) => e.date.startsWith(exportScope));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t.more.title}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Preferences, custom categories, SMS test runner, encrypted backups, and privacy controls
          </p>
        </div>
        <PWAInstallButton />
      </div>

      {/* Row 1: Test SMS Runner + Preferences (Language, Theme, Currency Format) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test SMS & Share-to-App Guide */}
        <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquareCode className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              SMS Parser Test & Android Share Target
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Click below to run 5 realistic Indian bank SMS messages (HDFC UPI, SBI YONO, ICICI Amazon, HDFC Card PVR, and BESCOM BillPay) through the full parser and send them to your <strong>To Review</strong> inbox.
          </p>
          <button
            onClick={handleLoadFiveTestSms}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{t.more.testSms}</span>
          </button>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white">
              How to use Android Share-to-SpendWise:
            </p>
            <p>
              1. Install SpendWise to your Android home screen using the <strong>Install App</strong> button.
            </p>
            <p>
              2. Long-press any bank or UPI SMS in Google Messages &rarr; Tap <strong>Share</strong> &rarr; Choose <strong>SpendWise</strong>.
            </p>
            <p>
              3. SpendWise opens directly on the pre-filled confirmation screen (<code className="font-mono">/share-target</code>).
            </p>
          </div>
        </section>

        {/* Language, Theme & Currency Settings */}
        <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t.more.language}, {t.more.theme} &amp; Format
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                {t.more.language}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { code: 'en', label: 'English' },
                    { code: 'ta', label: 'தமிழ்' },
                    { code: 'hi', label: 'हिन्दी' },
                  ] as { code: SupportedLanguage; label: string }[]
                ).map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() =>
                      db.settings.update('default', { language: lang.code })
                    }
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                      settings.language === lang.code
                        ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                {t.more.theme}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['light', 'dark'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => db.settings.update('default', { theme: mode })}
                    className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold capitalize border cursor-pointer ${
                      settings.theme === mode
                        ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {mode} Mode
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Number Formatting
              </label>
              <select
                value={settings.currencyFormat}
                onChange={(e) =>
                  db.settings.update('default', {
                    currencyFormat: e.target.value as 'lakhs' | 'standard',
                  })
                }
                className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value="lakhs">Indian Lakhs (₹1,25,000)</option>
                <option value="standard">International (₹125,000)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Default Payment Mode
              </label>
              <select
                value={settings.defaultPaymentMode}
                onChange={(e) =>
                  db.settings.update('default', {
                    defaultPaymentMode: e.target.value as PaymentMode,
                  })
                }
                className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Cash">Cash</option>
                <option value="Net Banking">Net Banking</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      {/* Row 2: Custom Categories Manager (Add, Rename, Recolor, Delete) */}
      <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-pink-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Categories &amp; Chart Colors
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add, rename, recolor, or delete categories. Colors stay consistent across all charts.
              </p>
            </div>
          </div>

          <form onSubmit={handleAddCategory} className="flex items-center gap-2">
            <input
              type="color"
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
            />
            <input
              type="text"
              placeholder="New Category Name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
            />
            <button
              type="submit"
              className="min-h-[40px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {categories.map((cat) => {
            const isEditing = editingCatId === cat.id;
            return (
              <div
                key={cat.id}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2"
              >
                {isEditing ? (
                  <div className="flex items-center gap-1.5 w-full">
                    <input
                      type="color"
                      value={editingCatColor}
                      onChange={(e) => setEditingCatColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={editingCatName}
                      onChange={(e) => setEditingCatName(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                    />
                    <button
                      onClick={() => handleSaveCategoryEdit(cat)}
                      className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-4 h-4 rounded-md shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {cat.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setEditingCatName(cat.name);
                          setEditingCatColor(cat.color);
                        }}
                        className="text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        aria-label={`Delete ${cat.name}`}
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Row 3: App Lock (PIN & Biometrics) + Export CSV / XLSX / PDF + Encrypted Backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* App Lock with PIN & Biometrics */}
        <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.more.appLock}
              </h2>
            </div>
            {settings.pinCode && (
              <button
                onClick={onLockNow}
                className="min-h-[36px] px-3 py-1 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Lock App Now
              </button>
            )}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Set a 4-digit PIN and auto-lock timer when the browser tab is hidden.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex gap-2">
              <input
                type="password"
                maxLength={4}
                placeholder="4-digit PIN"
                value={pinDraft}
                onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="flex-1 min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono tracking-widest"
              />
              <button
                onClick={async () => {
                  if (pinDraft.length !== 4 && pinDraft.length !== 0) {
                    onShowToast({
                      id: `pin-err-${Date.now()}`,
                      message: 'PIN must be 4 digits (or empty to disable)',
                    });
                    return;
                  }
                  await db.settings.update('default', { pinCode: pinDraft });
                  onShowToast({
                    id: `pin-save-${Date.now()}`,
                    message: pinDraft ? '4-digit App Lock PIN enabled' : 'App Lock disabled',
                  });
                }}
                className="min-h-[40px] px-3.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
              >
                {pinDraft ? 'Save PIN' : 'Clear'}
              </button>
            </div>

            <div>
              <select
                value={settings.autoLockMinutes}
                onChange={(e) =>
                  db.settings.update('default', {
                    autoLockMinutes: Number(e.target.value),
                  })
                }
                className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value={1}>Auto-lock after 1 minute hidden</option>
                <option value={3}>Auto-lock after 3 minutes hidden</option>
                <option value={5}>Auto-lock after 5 minutes hidden</option>
                <option value={15}>Auto-lock after 15 minutes hidden</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleRegisterWebAuthn}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            {settings.biometricsEnabled
              ? 'Biometrics (WebAuthn) Enabled — Click to Reconfigure'
              : 'Enable Biometric Unlock (WebAuthn)'}
          </button>
        </section>

        {/* Export CSV, Excel (.xlsx) & PDF Report + Encrypted Backup */}
        <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.more.exportData}
              </h2>
            </div>
            <select
              value={exportScope}
              onChange={(e) => setExportScope(e.target.value)}
              className="min-h-[36px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
            >
              <option value="ALL">All Data ({expenses.length})</option>
              <option value={getYearMonth()}>
                Current Month ({formatMonthLabel(getYearMonth())})
              </option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => exportExpensesCSV(scopedExpenses, exportScope)}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              onClick={() => exportExpensesXLSX(scopedExpenses, exportScope)}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel (.xlsx)</span>
            </button>
            <button
              onClick={() =>
                exportExpensesPDF(
                  scopedExpenses,
                  exportScope === 'ALL' ? 'All Months' : formatMonthLabel(exportScope)
                )
              }
              className="min-h-[42px] px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF Report</span>
            </button>
          </div>

          {/* Encrypted Backup & Restore (Web Crypto API AES-GCM-256) */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {t.more.encryptedBackup} (AES-GCM-256)
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Backup Encryption Password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                className="flex-1 min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <button
                onClick={async () => {
                  if (backupPassword.length < 4) {
                    setBackupStatus('Enter a password of at least 4 characters.');
                    return;
                  }
                  await exportEncryptedBackup(backupPassword);
                  setBackupStatus('Downloaded AES-GCM encrypted .swbak.json backup file.');
                }}
                className="min-h-[38px] px-3.5 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
              >
                Download Backup
              </button>
            </div>

            <div className="flex gap-2 items-center">
              <input
                type="password"
                placeholder="Decryption Password to Restore"
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                className="flex-1 min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <label className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <Upload className="w-3.5 h-3.5" />
                <span>Restore File</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const count = await restoreEncryptedBackup(text, restorePassword);
                      setBackupStatus(`Restored ${count} transaction(s) from encrypted backup!`);
                    } catch (err: unknown) {
                      setBackupStatus(
                        err instanceof Error ? err.message : 'Restore failed'
                      );
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
            {backupStatus && (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {backupStatus}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Row 4: Opt-In Gemini Controls & Transparent Privacy Architecture */}
      <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.more.privacyTitle} &amp; Optional Gemini Features
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                100% stored in your browser&apos;s IndexedDB by default — Gemini features are OFF unless you explicitly opt in
              </p>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.geminiEnabled}
              onChange={(e) =>
                db.settings.update('default', { geminiEnabled: e.target.checked })
              }
              className="w-4 h-4 rounded accent-emerald-600"
            />
            <span className="text-xs font-semibold text-slate-900 dark:text-white">
              Opt-In to Gemini AI
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
            <p className="font-bold text-slate-900 dark:text-white">
              What Stays Strictly on Your Device (Always):
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              • Your entire transaction database, budgets, recurring items, shared splits, cash wallet, and to-do lists live in browser IndexedDB (<code className="font-mono">SpendWiseIndianDB</code>).
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              • Standard regex SMS parsing, OTP/credit filtering, merchant keyword learning, and local insights run 100% offline in your browser.
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              • Your 4-digit PIN and AES-GCM-256 backup keys never leave your device.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
            <p className="font-bold text-slate-900 dark:text-white">
              What is Sent to Gemini (Only When Opted In Above):
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              • <strong>Unreadable SMS Fallback:</strong> Only the single SMS string that local regex patterns could not parse.
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              • <strong>Receipt Scan:</strong> Only the receipt photo you explicitly select for extraction.
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              • <strong>Monthly Summary &amp; Ask SpendWise:</strong> Aggregated category totals and your question text (configured via server environment credentials).
            </p>
          </div>
        </div>

        {/* Danger Zone: Delete All Data */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
              Danger Zone — Wipe Local Database
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Permanently deletes all expenses, budgets, tasks, and custom rules stored in this browser.
            </p>
          </div>

          {!confirmDeleteAll ? (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold cursor-pointer self-start"
            >
              {t.more.deleteAll}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await db.transaction(
                    'rw',
                    [
                      db.expenses,
                      db.categories,
                      db.merchantRules,
                      db.budgets,
                      db.recurringExpenses,
                      db.sharedExpenses,
                      db.cashTransactions,
                      db.savingsGoals,
                      db.tasks,
                    ],
                    async () => {
                      await db.expenses.clear();
                      await db.categories.clear();
                      await db.categories.bulkPut(DEFAULT_CATEGORIES);
                      await db.merchantRules.clear();
                      await db.budgets.clear();
                      await db.recurringExpenses.clear();
                      await db.sharedExpenses.clear();
                      await db.cashTransactions.clear();
                      await db.savingsGoals.clear();
                      await db.tasks.clear();
                    }
                  );
                  setConfirmDeleteAll(false);
                  onShowToast({
                    id: `wipe-${Date.now()}`,
                    message: 'All SpendWise data cleared from this device.',
                  });
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Permanent Wipe
              </button>
              <button
                onClick={() => setConfirmDeleteAll(false)}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
