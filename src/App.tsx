/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart3,
  CheckSquare,
  Home,
  MoreHorizontal,
  Plus,
  Wallet,
} from 'lucide-react';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  db,
  initializeDatabase,
} from './db/database';
import { TRANSLATIONS } from './i18n/translations';
import type { Expense } from './types/models';
import { CaptureModal, type CaptureTab } from './components/CaptureModal';
import {
  AppLockScreen,
  FirstRunOnboardingModal,
  ToastBar,
  type ToastMessage,
} from './components/GlobalOverlays';
import { OfflineIndicator } from './components/PWAInstallButton';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { TodoPage } from './pages/TodoPage';
import { MorePage } from './pages/MorePage';
import { ShareTargetPage } from './pages/ShareTargetPage';

function SpendWiseShell() {
  const location = useLocation();

  // Reactive IndexedDB queries via Dexie
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], []);
  const categories = useLiveQuery(
    () => db.categories.toArray(),
    [],
    DEFAULT_CATEGORIES
  );
  const merchantRules = useLiveQuery(() => db.merchantRules.toArray(), [], []);
  const budgets = useLiveQuery(() => db.budgets.toArray(), [], []);
  const recurringExpenses = useLiveQuery(
    () => db.recurringExpenses.toArray(),
    [],
    []
  );
  const sharedExpenses = useLiveQuery(() => db.sharedExpenses.toArray(), [], []);
  const cashTransactions = useLiveQuery(
    () => db.cashTransactions.toArray(),
    [],
    []
  );
  const savingsGoals = useLiveQuery(() => db.savingsGoals.toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const settingsRecord = useLiveQuery(() => db.settings.get('default'), []);

  const settings = settingsRecord ?? DEFAULT_SETTINGS;
  const t = TRANSLATIONS[settings.language] ?? TRANSLATIONS.en;

  // Capture Modal & Toast state
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTab, setCaptureTab] = useState<CaptureTab>('manual');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const hiddenAtRef = useRef<number | null>(null);

  // Initialize DB defaults & recurring bills on first mount
  useEffect(() => {
    initializeDatabase();
  }, []);

  // Sync Light / Dark theme class on <html>
  useEffect(() => {
    const isDark = settings.theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
  }, [settings.theme]);

  // Desktop keyboard shortcut: Press "N" to quickly add an expense
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;

      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setEditingExpense(null);
        setCaptureTab('manual');
        setCaptureOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-lock when tab is hidden for settings.autoLockMinutes
  useEffect(() => {
    if (!settings.pinCode) return;

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current) {
        const elapsedMs = Date.now() - hiddenAtRef.current;
        const thresholdMs = (settings.autoLockMinutes || 5) * 60 * 1000;
        if (elapsedMs >= thresholdMs) {
          setIsLocked(true);
        }
        hiddenAtRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [settings.pinCode, settings.autoLockMinutes]);

  const showToast = (msg: ToastMessage) => {
    setToast(msg);
  };

  const handleOpenCapture = (tab: CaptureTab, editExp?: Expense) => {
    setCaptureTab(tab);
    setEditingExpense(editExp ?? null);
    setCaptureOpen(true);
  };

  const reviewCount = expenses.filter(
    (e) => e.status === 'review' || e.status === 'unreadable'
  ).length;
  const pendingTaskCount = tasks.filter((x) => !x.completed).length;

  const navItems = [
    { to: '/', label: t.nav.home, icon: Home, badge: reviewCount },
    { to: '/dashboard', label: t.nav.dashboard, icon: BarChart3, badge: 0 },
    { to: '/budgets', label: t.nav.budgets, icon: Wallet, badge: 0 },
    { to: '/todo', label: t.nav.todo, icon: CheckSquare, badge: pendingTaskCount },
    { to: '/more', label: t.nav.more, icon: MoreHorizontal, badge: 0 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-8 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <Link
          to="/"
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display"
        >
          SpendWise
        </Link>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          {navItems.map((item) => {
            const isActive =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`whitespace-nowrap shrink-0 transition-colors py-1 border-b-2 ${
                  isActive
                    ? 'text-slate-900 dark:text-white border-emerald-600 font-semibold'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
                {item.badge > 0 ? ` (${item.badge})` : ''}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => handleOpenCapture('manual')}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            + {t.nav.quickAdd} (N)
          </button>
        </div>
      </header>

      {/* Desktop Sidebar + Main Content Area */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 p-5 justify-between">
          <div className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `min-h-[44px] px-3.5 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-between transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                    }`
                  }
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span className="font-mono text-[11px] opacity-90">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>

          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white">
              Desktop Shortcut
            </p>
            <p>
              Press <kbd className="font-mono font-bold">N</kbd> anywhere to log a new expense in under 10 seconds.
            </p>
          </div>
        </aside>

        {/* Main Scrollable Viewport */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12">
          <Routes>
            <Route
              path="/"
              element={
                <HomePage
                  expenses={expenses}
                  categories={categories}
                  budgets={budgets}
                  tasks={tasks}
                  settings={settings}
                  t={t}
                  onOpenCapture={handleOpenCapture}
                  onShowToast={showToast}
                />
              }
            />
            <Route
              path="/dashboard"
              element={
                <DashboardPage
                  expenses={expenses}
                  categories={categories}
                  budgets={budgets}
                  settings={settings}
                  t={t}
                />
              }
            />
            <Route
              path="/budgets"
              element={
                <BudgetsPage
                  expenses={expenses}
                  categories={categories}
                  budgets={budgets}
                  recurringExpenses={recurringExpenses}
                  sharedExpenses={sharedExpenses}
                  cashTransactions={cashTransactions}
                  savingsGoals={savingsGoals}
                  settings={settings}
                  t={t}
                  onShowToast={showToast}
                />
              }
            />
            <Route
              path="/todo"
              element={
                <TodoPage
                  tasks={tasks}
                  categories={categories}
                  settings={settings}
                  t={t}
                  onShowToast={showToast}
                />
              }
            />
            <Route
              path="/more"
              element={
                <MorePage
                  expenses={expenses}
                  categories={categories}
                  merchantRules={merchantRules}
                  settings={settings}
                  t={t}
                  onShowToast={showToast}
                  onLockNow={() => setIsLocked(true)}
                />
              }
            />
            <Route
              path="/share-target"
              element={
                <ShareTargetPage
                  categories={categories}
                  merchantRules={merchantRules}
                  onShowToast={showToast}
                />
              }
            />
          </Routes>
        </main>
      </div>

      {/* Mobile Floating "+" Quick Add Button */}
      <button
        onClick={() => handleOpenCapture('manual')}
        aria-label="Quick Add Expense"
        className="md:hidden fixed right-4 bottom-20 z-40 w-13 h-13 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `min-h-[44px] flex flex-col items-center justify-center relative transition-colors ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] tracking-tight mt-1 whitespace-nowrap">
                {item.label}
              </span>
              {item.badge > 0 && (
                <span className="absolute top-1 right-4 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Modals & Global Overlays */}
      <CaptureModal
        isOpen={captureOpen}
        initialTab={captureTab}
        editingExpense={editingExpense}
        categories={categories}
        merchantRules={merchantRules}
        existingExpenses={expenses}
        settings={settings}
        onClose={() => {
          setCaptureOpen(false);
          setEditingExpense(null);
        }}
        onShowToast={showToast}
      />

      <ToastBar toast={toast} onDismiss={() => setToast(null)} />
      <OfflineIndicator />

      {settingsRecord && !settings.onboardingCompleted && (
        <FirstRunOnboardingModal
          settings={settings}
          onComplete={(loadedSamples) => {
            if (loadedSamples) {
              showToast({
                id: `onboard-${Date.now()}`,
                message: 'Loaded 80+ Indian sample transactions! Explore your Dashboard.',
              });
            }
          }}
        />
      )}

      {isLocked && settings.pinCode && (
        <AppLockScreen settings={settings} onUnlock={() => setIsLocked(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SpendWiseShell />
    </BrowserRouter>
  );
}
