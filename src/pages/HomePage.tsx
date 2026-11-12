import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Edit3,
  FileSpreadsheet,
  Filter,
  Inbox,
  MessageSquarePlus,
  Plus,
  Search,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, getCategoryColor } from '../db/database';
import type { TranslationDictionary } from '../i18n/translations';
import type {
  AppSettings,
  Budget,
  Category,
  Expense,
  PaymentMode,
  TodoTask,
} from '../types/models';
import {
  evaluateBudgetStatus,
  formatDateFriendly,
  formatINR,
  getTodayISO,
  getYearMonth,
} from '../utils/formatters';
import { clearSampleData, loadSampleData } from '../utils/sampleData';
import type { CaptureTab } from '../components/CaptureModal';
import type { ToastMessage } from '../components/GlobalOverlays';

interface HomePageProps {
  expenses: Expense[];
  categories: Category[];
  budgets: Budget[];
  tasks: TodoTask[];
  settings: AppSettings;
  t: TranslationDictionary;
  onOpenCapture: (tab: CaptureTab, editExpense?: Expense) => void;
  onShowToast: (toast: ToastMessage) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  expenses,
  categories,
  budgets,
  tasks,
  settings,
  t,
  onOpenCapture,
  onShowToast,
}) => {
  const todayIso = getTodayISO();
  const currentYM = getYearMonth();

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [modeFilter, setModeFilter] = useState<'ALL' | PaymentMode>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Touch swipe tracking per row
  const [touchStartX, setTouchStartX] = useState<{ id: string; x: number } | null>(null);

  const hasSampleData = useMemo(() => expenses.some((e) => e.isSample), [expenses]);

  const reviewInbox = useMemo(
    () =>
      expenses
        .filter((e) => e.status === 'review' || e.status === 'unreadable')
        .sort((a, b) => b.timestamp - a.timestamp),
    [expenses]
  );

  const confirmedExpenses = useMemo(
    () => expenses.filter((e) => e.status === 'confirmed'),
    [expenses]
  );

  const todaySpend = useMemo(
    () =>
      confirmedExpenses
        .filter((e) => e.date === todayIso)
        .reduce((sum, e) => sum + e.amount, 0),
    [confirmedExpenses, todayIso]
  );

  const currentMonthExpenses = useMemo(
    () => confirmedExpenses.filter((e) => e.date.startsWith(currentYM)),
    [confirmedExpenses, currentYM]
  );

  const monthTotal = useMemo(
    () => currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0),
    [currentMonthExpenses]
  );

  const budgetStatus = useMemo(
    () =>
      evaluateBudgetStatus(
        budgets,
        currentMonthExpenses,
        settings.overallMonthlyBudget
      ),
    [budgets, currentMonthExpenses, settings.overallMonthlyBudget]
  );

  const topBudgetAlert = useMemo(() => {
    const catAlert = budgetStatus.categories.find(
      (c) => c.alertLevel === 'exceeded' || c.alertLevel === 'warning'
    );
    if (catAlert) return catAlert;
    if (
      budgetStatus.overall &&
      (budgetStatus.overall.alertLevel === 'exceeded' ||
        budgetStatus.overall.alertLevel === 'warning')
    ) {
      return budgetStatus.overall;
    }
    return budgetStatus.overall ?? budgetStatus.categories[0] ?? null;
  }, [budgetStatus]);

  const tasksDueThisWeek = useMemo(() => {
    const now = new Date();
    const inSevenDays = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 7
    );
    const maxIso = getTodayISO(inSevenDays);
    return tasks
      .filter((task) => !task.completed && task.dueDate <= maxIso)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [tasks]);

  const filteredExpenses = useMemo(() => {
    return confirmedExpenses
      .filter((e) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchMerch = e.merchant.toLowerCase().includes(q);
          const matchNote = (e.notes ?? '').toLowerCase().includes(q);
          const matchCat = e.category.toLowerCase().includes(q);
          if (!matchMerch && !matchNote && !matchCat) return false;
        }
        if (categoryFilter !== 'ALL' && e.category !== categoryFilter) return false;
        if (modeFilter !== 'ALL' && e.paymentMode !== modeFilter) return false;
        if (dateFrom && e.date < dateFrom) return false;
        if (dateTo && e.date > dateTo) return false;
        if (minAmount && e.amount < Number(minAmount)) return false;
        if (maxAmount && e.amount > Number(maxAmount)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.timestamp - a.timestamp);
  }, [
    confirmedExpenses,
    searchQuery,
    categoryFilter,
    modeFilter,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
  ]);

  const groupedExpenses = useMemo(() => {
    const groups = new Map<string, Expense[]>();
    for (const exp of filteredExpenses.slice(0, 60)) {
      const list = groups.get(exp.date) ?? [];
      list.push(exp);
      groups.set(exp.date, list);
    }
    return [...groups.entries()];
  }, [filteredExpenses]);

  const handleConfirmReviewItem = async (item: Expense) => {
    if (item.status === 'unreadable' || item.amount <= 0) {
      onOpenCapture('manual', item);
      return;
    }
    const prevStatus = item.status;
    await db.expenses.update(item.id, { status: 'confirmed' });
    onShowToast({
      id: `confirm-${item.id}`,
      message: `Confirmed ${formatINR(item.amount, { currencyFormat: settings.currencyFormat })} at ${item.merchant}`,
      undoLabel: 'Undo',
      onUndo: async () => {
        await db.expenses.update(item.id, { status: prevStatus });
      },
    });
  };

  const handleIgnoreReviewItem = async (item: Expense) => {
    const prevStatus = item.status;
    await db.expenses.update(item.id, { status: 'ignored' });
    onShowToast({
      id: `ignore-${item.id}`,
      message: `Ignored message from ${item.merchant}`,
      undoLabel: 'Undo',
      onUndo: async () => {
        await db.expenses.update(item.id, { status: prevStatus });
      },
    });
  };

  const handleDeleteExpense = async (item: Expense) => {
    const copy = { ...item };
    await db.expenses.delete(item.id);
    onShowToast({
      id: `del-${item.id}`,
      message: `Deleted ${item.merchant} (${formatINR(item.amount, { currencyFormat: settings.currencyFormat })})`,
      undoLabel: 'Undo',
      onUndo: async () => {
        await db.expenses.put(copy);
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* Action Bar: Quick Capture + Sample Data Loader */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onOpenCapture('manual')}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
          <button
            onClick={() => onOpenCapture('sms')}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <MessageSquarePlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t.home.pasteSms}</span>
          </button>
          <button
            onClick={() => onOpenCapture('receipt')}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{t.home.scanReceipt}</span>
          </button>
          <button
            onClick={() => onOpenCapture('statement')}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>{t.home.statementImport}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!hasSampleData ? (
            <button
              onClick={async () => {
                await loadSampleData();
                onShowToast({
                  id: `sample-load-${Date.now()}`,
                  message: 'Loaded 80+ Indian sample transactions, budgets & tasks',
                });
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t.home.loadSample}</span>
            </button>
          ) : (
            <button
              onClick={async () => {
                await clearSampleData();
                onShowToast({
                  id: `sample-clear-${Date.now()}`,
                  message: 'Cleared all sample data',
                });
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-300 hover:text-rose-600 text-xs font-medium transition-colors cursor-pointer"
            >
              {t.home.clearSample}
            </button>
          )}
        </div>
      </div>

      {/* 4-Column Metric Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t.home.todaySpend}
          </p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatINR(todaySpend, { currencyFormat: settings.currencyFormat })}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {confirmedExpenses.filter((e) => e.date === todayIso).length} txns today
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t.home.monthTotal}
          </p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatINR(monthTotal, { currencyFormat: settings.currencyFormat })}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {currentMonthExpenses.length} confirmed in {currentYM}
          </p>
        </div>

        <Link
          to="/budgets"
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors block"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Budget Status
            </p>
            {topBudgetAlert && topBudgetAlert.percentage >= 80 && (
              <AlertTriangle
                className={`w-4 h-4 ${
                  topBudgetAlert.alertLevel === 'exceeded'
                    ? 'text-rose-500'
                    : 'text-amber-500'
                }`}
              />
            )}
          </div>
          {topBudgetAlert ? (
            <>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {topBudgetAlert.percentage}%
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                {topBudgetAlert.category} ·{' '}
                {topBudgetAlert.alertLevel === 'exceeded'
                  ? 'Over budget'
                  : topBudgetAlert.alertLevel === 'warning'
                    ? 'Near 80% limit'
                    : 'Within budget'}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                Set Budget
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Configure monthly limits
              </p>
            </>
          )}
        </Link>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t.home.toReview}
          </p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {reviewInbox.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {tasksDueThisWeek.length} task(s) due this week
          </p>
        </div>
      </div>

      {/* "To Review" SMS & Statement Confirmation Flow */}
      {reviewInbox.length > 0 && (
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2.5">
              <Inbox className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                To Review Inbox ({reviewInbox.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Confirm, edit, or ignore parsed SMS & statement debits
            </span>
          </div>

          <div className="space-y-3">
            {reviewInbox.map((item) => {
              const isUnreadable = item.status === 'unreadable' || item.amount <= 0;
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    {isUnreadable ? (
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-semibold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Couldn&apos;t read this one — tap Complete to enter amount</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {formatINR(item.amount, { currencyFormat: settings.currencyFormat })}
                        </span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {item.merchant}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {item.category} · {item.paymentMode} · {item.date}
                          {item.accountLast4 ? ` · XX${item.accountLast4}` : ''}
                        </span>
                      </div>
                    )}
                    {item.rawSms && (
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 line-clamp-2">
                        &ldquo;{item.rawSms}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isUnreadable ? (
                      <button
                        onClick={() => handleConfirmReviewItem(item)}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Confirm</span>
                      </button>
                    ) : null}
                    <button
                      onClick={() => onOpenCapture('manual', item)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{isUnreadable ? 'Complete' : 'Edit'}</span>
                    </button>
                    <button
                      onClick={() => handleIgnoreReviewItem(item)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Ignore</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Two-Column Split on Desktop: Left = Recent & Searchable Expenses, Right = Tasks Due This Week */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Expense Ledger & Filters (2 cols) */}
        <section className="lg:col-span-2 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.home.recentExpenses}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Showing {filteredExpenses.length} confirmed transaction(s) · Tap any row to edit or swipe left to delete
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search merchant, note..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                onClick={() => setShowFilters((prev) => !prev)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  showFilters
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filter</span>
              </button>
            </div>
          </div>

          {/* Expandable Filter Panel */}
          {showFilters && (
            <div className="mb-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Category
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="ALL">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Payment Mode
                </label>
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value as 'ALL' | PaymentMode)}
                  className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="ALL">All Modes</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Cash">Cash</option>
                  <option value="Net Banking">Net Banking</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Amount Range (₹)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    placeholder="Min"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('ALL');
                    setModeFilter('ALL');
                    setDateFrom('');
                    setDateTo('');
                    setMinAmount('');
                    setMaxAmount('');
                  }}
                  className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          )}

          {/* Grouped Transactions List */}
          {groupedExpenses.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {t.home.noExpensesYet}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => onOpenCapture('manual')}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Log First Expense
                </button>
                <button
                  onClick={() => loadSampleData()}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {t.home.loadSample}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedExpenses.map(([dateStr, dayItems]) => {
                const daySum = dayItems.reduce((s, x) => s + x.amount, 0);
                return (
                  <div key={dateStr} className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                      <span className="font-semibold">
                        {formatDateFriendly(dateStr, todayIso)}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatINR(daySum, { currencyFormat: settings.currencyFormat })}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200/70 dark:border-slate-800 rounded-2xl overflow-hidden">
                      {dayItems.map((exp) => {
                        const catColor = getCategoryColor(exp.category, categories);
                        return (
                          <div
                            key={exp.id}
                            onTouchStart={(e) =>
                              setTouchStartX({ id: exp.id, x: e.touches[0].clientX })
                            }
                            onTouchEnd={(e) => {
                              if (!touchStartX || touchStartX.id !== exp.id) return;
                              const deltaX = e.changedTouches[0].clientX - touchStartX.x;
                              if (deltaX < -75) {
                                handleDeleteExpense(exp);
                              }
                              setTouchStartX(null);
                            }}
                            onClick={() => onOpenCapture('manual', exp)}
                            className="flex items-center justify-between gap-3 px-4 py-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ backgroundColor: catColor }}
                              >
                                {exp.category.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                  {exp.merchant}
                                </p>
                                {/* Clean unboxed metadata with typographic separators */}
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {exp.category} · {exp.paymentMode}
                                  {exp.accountLast4 ? ` · XX${exp.accountLast4}` : ''}
                                  {exp.notes ? ` · ${exp.notes}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                                {formatINR(exp.amount, { currencyFormat: settings.currencyFormat })}
                              </span>
                              <button
                                type="button"
                                aria-label="Delete expense"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteExpense(exp);
                                }}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Tasks Due This Week */}
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.home.dueThisWeek}
              </h2>
            </div>
            <Link
              to="/todo"
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              View All
            </Link>
          </div>

          {tasksDueThisWeek.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              All caught up! No pending tasks or bills due in the next 7 days.
            </p>
          ) : (
            <div className="space-y-3">
              {tasksDueThisWeek.slice(0, 6).map((task) => {
                const isOverdue = task.dueDate < todayIso;
                return (
                  <div
                    key={task.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {task.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {isOverdue ? (
                            <span className="text-rose-600 dark:text-rose-400 font-semibold">
                              Overdue ({task.dueDate})
                            </span>
                          ) : (
                            <span>Due {formatDateFriendly(task.dueDate, todayIso)}</span>
                          )}{' '}
                          · {task.priority} Priority
                        </p>
                      </div>
                      {task.isMoneyLinked && task.linkedAmount && (
                        <span className="text-xs font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                          {formatINR(task.linkedAmount, {
                            currencyFormat: settings.currencyFormat,
                          })}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      {task.isMoneyLinked && task.linkedAmount ? (
                        <button
                          onClick={async () => {
                            const expId = `todo-exp-${Date.now()}`;
                            await db.expenses.put({
                              id: expId,
                              amount: task.linkedAmount!,
                              merchant: task.title,
                              category: task.linkedCategory || 'Bills & Recharge',
                              date: todayIso,
                              timestamp: Date.now(),
                              paymentMode: task.linkedPaymentMode || 'UPI',
                              notes: 'Marked paid from To-Do list',
                              status: 'confirmed',
                              source: 'todo',
                            });
                            await db.tasks.update(task.id, {
                              completed: true,
                              completedAt: Date.now(),
                              paidExpenseId: expId,
                            });
                            onShowToast({
                              id: `paid-${task.id}`,
                              message: `Marked paid & logged ${formatINR(task.linkedAmount!)}`,
                              undoLabel: 'Undo',
                              onUndo: async () => {
                                await db.expenses.delete(expId);
                                await db.tasks.update(task.id, {
                                  completed: false,
                                  paidExpenseId: undefined,
                                });
                              },
                            });
                          }}
                          className="min-h-[36px] px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.todo.markPaid}</span>
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            await db.tasks.update(task.id, {
                              completed: true,
                              completedAt: Date.now(),
                            });
                            onShowToast({
                              id: `done-${task.id}`,
                              message: `Completed "${task.title}"`,
                              undoLabel: 'Undo',
                              onUndo: async () => {
                                await db.tasks.update(task.id, { completed: false });
                              },
                            });
                          }}
                          className="min-h-[36px] px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
