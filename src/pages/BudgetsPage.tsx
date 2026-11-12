import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  PiggyBank,
  Plus,
  Repeat,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { db, getCategoryColor } from '../db/database';
import type { TranslationDictionary } from '../i18n/translations';
import type {
  AppSettings,
  Budget,
  CashTransaction,
  Category,
  Expense,
  PaymentMode,
  RecurringExpense,
  SavingsGoal,
  SharedExpense,
  SplitParticipant,
} from '../types/models';
import {
  evaluateBudgetStatus,
  formatINR,
  getTodayISO,
  getYearMonth,
} from '../utils/formatters';
import type { ToastMessage } from '../components/GlobalOverlays';

interface BudgetsPageProps {
  expenses: Expense[];
  categories: Category[];
  budgets: Budget[];
  recurringExpenses: RecurringExpense[];
  sharedExpenses: SharedExpense[];
  cashTransactions: CashTransaction[];
  savingsGoals: SavingsGoal[];
  settings: AppSettings;
  t: TranslationDictionary;
  onShowToast: (toast: ToastMessage) => void;
}

export const BudgetsPage: React.FC<BudgetsPageProps> = ({
  expenses,
  categories,
  budgets,
  recurringExpenses,
  sharedExpenses,
  cashTransactions,
  savingsGoals,
  settings,
  t,
  onShowToast,
}) => {
  const currentYM = getYearMonth();
  const todayIso = getTodayISO();

  // Budget form state
  const [selectedBudgetCat, setSelectedBudgetCat] = useState(
    categories[0]?.name ?? 'Food & Dining'
  );
  const [budgetLimitInput, setBudgetLimitInput] = useState('');

  // Recurring expense form state
  const [recTitle, setRecTitle] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recCategory, setRecCategory] = useState('Bills & Recharge');
  const [recDay, setRecDay] = useState('5');
  const [recMode, setRecMode] = useState<PaymentMode>('UPI');

  // Split expense form state
  const [splitTitle, setSplitTitle] = useState('');
  const [splitTotal, setSplitTotal] = useState('');
  const [splitPaidBy, setSplitPaidBy] = useState('Me');
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [splitPeopleStr, setSplitPeopleStr] = useState('Aarav, Priya');
  const [customSharesStr, setCustomSharesStr] = useState('');

  // Cash tracker form state
  const [cashType, setCashType] = useState<'withdrawal' | 'spend'>('spend');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDesc, setCashDesc] = useState('');

  // Savings goal form state
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalSaved, setGoalSaved] = useState('');
  const [goalMonthly, setGoalMonthly] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('2027-06-01');

  const currentMonthConfirmed = useMemo(
    () =>
      expenses.filter(
        (e) => e.status === 'confirmed' && e.date.startsWith(currentYM)
      ),
    [expenses, currentYM]
  );

  const budgetEval = useMemo(
    () =>
      evaluateBudgetStatus(
        budgets,
        currentMonthConfirmed,
        settings.overallMonthlyBudget
      ),
    [budgets, currentMonthConfirmed, settings.overallMonthlyBudget]
  );

  const warningBanners = useMemo(
    () =>
      [
        ...(budgetEval.overall ? [budgetEval.overall] : []),
        ...budgetEval.categories,
      ].filter((b) => b.alertLevel === 'warning' || b.alertLevel === 'exceeded'),
    [budgetEval]
  );

  // Cash in Hand calculation
  const cashInHand = useMemo(() => {
    let balance = 0;
    for (const c of cashTransactions) {
      if (c.type === 'withdrawal' || c.type === 'topup') balance += c.amount;
      else if (c.type === 'spend') balance -= c.amount;
    }
    return balance;
  }, [cashTransactions]);

  // Split summary: how much others owe Me vs how much I owe others
  const splitBalances = useMemo(() => {
    let owedToMe = 0;
    let iOweOthers = 0;
    for (const s of sharedExpenses) {
      for (const p of s.participants) {
        if (p.settled) continue;
        if (s.paidBy.toLowerCase() === 'me' && p.name.toLowerCase() !== 'me') {
          owedToMe += p.shareAmount;
        } else if (
          s.paidBy.toLowerCase() !== 'me' &&
          p.name.toLowerCase() === 'me'
        ) {
          iOweOthers += p.shareAmount;
        }
      }
    }
    return { owedToMe, iOweOthers };
  }, [sharedExpenses]);

  const handleSaveCategoryBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const limit = Number(budgetLimitInput);
    if (!Number.isFinite(limit) || limit <= 0) return;

    const existing = budgets.find((b) => b.category === selectedBudgetCat);
    const id = existing?.id ?? `b-${Date.now()}`;
    await db.budgets.put({
      id,
      category: selectedBudgetCat,
      monthlyLimit: limit,
    });
    if (selectedBudgetCat === 'OVERALL') {
      await db.settings.update('default', { overallMonthlyBudget: limit });
    }
    setBudgetLimitInput('');
    onShowToast({
      id: `budget-${id}`,
      message: `Set ${selectedBudgetCat} budget to ${formatINR(limit)}`,
    });
  };

  const handleAddRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(recAmount);
    const day = Math.min(28, Math.max(1, Number(recDay) || 1));
    if (!recTitle.trim() || amt <= 0) return;

    const id = `rec-${Date.now()}`;
    await db.recurringExpenses.put({
      id,
      title: recTitle.trim(),
      merchant: recTitle.trim(),
      amount: amt,
      category: recCategory,
      paymentMode: recMode,
      dayOfMonth: day,
      active: true,
    });
    setRecTitle('');
    setRecAmount('');
    onShowToast({
      id: `toast-${id}`,
      message: `Added recurring item "${recTitle.trim()}" on day ${day}`,
    });
  };

  const handleAddSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = Number(splitTotal);
    if (!splitTitle.trim() || total <= 0) return;

    const names = splitPeopleStr
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.some((n) => n.toLowerCase() === 'me')) {
      names.push('Me');
    }

    const customNums = customSharesStr
      .split(',')
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    const equalShare = Math.round(total / names.length);
    const participants: SplitParticipant[] = names.map((name, idx) => ({
      id: `part-${Date.now()}-${idx}`,
      name,
      shareAmount:
        splitMode === 'custom' && customNums[idx] ? customNums[idx] : equalShare,
      settled: name.toLowerCase() === splitPaidBy.trim().toLowerCase(),
    }));

    const id = `split-${Date.now()}`;
    await db.sharedExpenses.put({
      id,
      title: splitTitle.trim(),
      totalAmount: total,
      category: 'Food & Dining',
      date: todayIso,
      paidBy: splitPaidBy.trim() || 'Me',
      splitMode,
      participants,
    });
    setSplitTitle('');
    setSplitTotal('');
    onShowToast({
      id: `toast-${id}`,
      message: `Created shared split "${splitTitle.trim()}" (${formatINR(total)})`,
    });
  };

  const handleAddCashTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(cashAmount);
    if (amt <= 0 || !cashDesc.trim()) return;

    const id = `cash-${Date.now()}`;
    await db.cashTransactions.put({
      id,
      type: cashType,
      amount: amt,
      description: cashDesc.trim(),
      date: todayIso,
      timestamp: Date.now(),
    });

    // If it's a cash spend, also log it into confirmed expenses so the monthly ledger stays synced
    if (cashType === 'spend') {
      await db.expenses.put({
        id: `exp-${id}`,
        amount: amt,
        merchant: cashDesc.trim(),
        category: 'Others',
        date: todayIso,
        timestamp: Date.now(),
        paymentMode: 'Cash',
        notes: 'Logged from Cash in Hand tracker',
        status: 'confirmed',
        source: 'manual',
      });
    }

    setCashAmount('');
    setCashDesc('');
    onShowToast({
      id: `toast-${id}`,
      message:
        cashType === 'withdrawal'
          ? `Added ${formatINR(amt)} ATM withdrawal to Cash in Hand`
          : `Logged ${formatINR(amt)} cash spend`,
    });
  };

  const handleAddSavingsGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(goalTarget);
    const saved = Number(goalSaved) || 0;
    const monthly = Number(goalMonthly) || 1000;
    if (!goalName.trim() || target <= 0) return;

    const id = `goal-${Date.now()}`;
    await db.savingsGoals.put({
      id,
      name: goalName.trim(),
      targetAmount: target,
      savedSoFar: saved,
      monthlySaving: monthly,
      deadline: goalDeadline || '2027-12-31',
      color: '#10B981',
    });
    setGoalName('');
    setGoalTarget('');
    setGoalSaved('');
    setGoalMonthly('');
    onShowToast({
      id: `toast-${id}`,
      message: `Created savings goal "${goalName.trim()}"`,
    });
  };

  const getNextDueLabel = (dayOfMonth: number): string => {
    const now = new Date();
    const currentDay = now.getDate();
    if (dayOfMonth >= currentDay) {
      const diff = dayOfMonth - currentDay;
      return diff === 0
        ? 'Due Today'
        : `Next due in ${diff} day(s) (${currentYM}-${String(dayOfMonth).padStart(2, '0')})`;
    }
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth);
    return `Next due on ${nextMonthDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t.budgets.title}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Category budgets with 80% / 100% alerts, recurring EMIs & rent, shared splits, cash wallet, and savings goals
        </p>
      </div>

      {/* Warning Banners at 80% and 100% */}
      {warningBanners.length > 0 && (
        <div className="space-y-2.5">
          {warningBanners.map((b) => {
            const isExceeded = b.alertLevel === 'exceeded';
            return (
              <div
                key={b.category}
                className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  isExceeded
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold">
                      {isExceeded ? '100%+ Budget Exceeded: ' : '80%+ Budget Warning: '}
                      {b.category} is at {b.percentage}%
                    </p>
                    <p className="text-xs opacity-90">
                      Spent {formatINR(b.spent)} of {formatINR(b.limit)} monthly limit
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold font-mono tabular-nums shrink-0">
                  {b.remaining >= 0
                    ? `${formatINR(b.remaining)} left`
                    : `${formatINR(Math.abs(b.remaining))} over`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Section 1: Overall & Category Budgets */}
      <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t.budgets.categoryBudgets}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Set or update monthly spending limits per category or overall
            </p>
          </div>

          <form
            onSubmit={handleSaveCategoryBudget}
            className="flex flex-wrap items-center gap-2"
          >
            <select
              value={selectedBudgetCat}
              onChange={(e) => setSelectedBudgetCat(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              <option value="OVERALL">Overall Monthly Budget</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Monthly Limit (₹)"
              value={budgetLimitInput}
              onChange={(e) => setBudgetLimitInput(e.target.value)}
              className="w-40 min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
            <button
              type="submit"
              className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
            >
              Save Budget
            </button>
          </form>
        </div>

        {/* Overall Budget Bar */}
        {budgetEval.overall && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-slate-900 dark:text-white">
                {budgetEval.overall.category}
              </span>
              <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                {formatINR(budgetEval.overall.spent)} / {formatINR(budgetEval.overall.limit)} ({budgetEval.overall.percentage}%)
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  budgetEval.overall.alertLevel === 'exceeded'
                    ? 'bg-rose-600'
                    : budgetEval.overall.alertLevel === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(100, budgetEval.overall.percentage)}%` }}
              />
            </div>
          </div>
        )}

        {/* Category Budget Progress Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgetEval.categories.map((item) => {
            const catColor = getCategoryColor(item.category, categories);
            const barColor =
              item.alertLevel === 'exceeded'
                ? '#E11D48'
                : item.alertLevel === 'warning'
                  ? '#F59E0B'
                  : catColor;
            return (
              <div
                key={item.category}
                className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {item.category}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                      {formatINR(item.spent)} / {formatINR(item.limit)} ({item.percentage}%)
                    </span>
                    <button
                      onClick={async () => {
                        const b = budgets.find((x) => x.category === item.category);
                        if (b) await db.budgets.delete(b.id);
                      }}
                      aria-label={`Remove ${item.category} budget`}
                      className="text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, item.percentage)}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {item.remaining >= 0
                    ? `${formatINR(item.remaining)} remaining this month`
                    : `Exceeded by ${formatINR(Math.abs(item.remaining))}`}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2 & 3: Recurring Expenses + Cash in Hand Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recurring Expenses (Rent, Subscriptions, EMIs) */}
        <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.budgets.recurringTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Auto-logged into your ledger when SpendWise opens on or after the due date
              </p>
            </div>
          </div>

          <form onSubmit={handleAddRecurring} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Title (e.g. Flat Rent, Netflix)"
              value={recTitle}
              onChange={(e) => setRecTitle(e.target.value)}
              className="col-span-2 sm:col-span-1 min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
            />
            <input
              type="number"
              placeholder="Amount ₹"
              value={recAmount}
              onChange={(e) => setRecAmount(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
            <div className="flex gap-1.5">
              <input
                type="number"
                min={1}
                max={28}
                placeholder="Day (1-28)"
                value={recDay}
                onChange={(e) => setRecDay(e.target.value)}
                className="w-20 min-h-[40px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
              />
              <button
                type="submit"
                className="flex-1 min-h-[40px] px-3 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
              >
                Add
              </button>
            </div>
          </form>

          <div className="space-y-2.5">
            {recurringExpenses.map((rec) => (
              <div
                key={rec.id}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {rec.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <CalendarClock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>
                      Day {rec.dayOfMonth} · {getNextDueLabel(rec.dayOfMonth)} · {rec.category}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatINR(rec.amount)}
                  </span>
                  <button
                    onClick={() => db.recurringExpenses.delete(rec.id)}
                    aria-label="Delete recurring item"
                    className="text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Cash Tracker (Withdrawals, Cash Spends & Cash in Hand) */}
        <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t.budgets.cashWalletTitle}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Track ATM withdrawals and offline cash spends
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-medium text-slate-500 block">
                Cash in Hand
              </span>
              <span className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatINR(cashInHand)}
              </span>
            </div>
          </div>

          <form onSubmit={handleAddCashTx} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <select
              value={cashType}
              onChange={(e) => setCashType(e.target.value as 'withdrawal' | 'spend')}
              className="min-h-[40px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              <option value="spend">Cash Spend (-)</option>
              <option value="withdrawal">ATM Withdrawal (+)</option>
            </select>
            <input
              type="number"
              placeholder="Amount ₹"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
            <input
              type="text"
              placeholder="Note (e.g. Sabzi mandi, ATM)"
              value={cashDesc}
              onChange={(e) => setCashDesc(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
            />
            <button
              type="submit"
              className="min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
            >
              Log Cash
            </button>
          </form>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {cashTransactions
              .slice()
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {c.description}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      {c.date} · {c.type === 'withdrawal' ? 'ATM Withdrawal' : 'Cash Spend'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono tabular-nums font-bold ${
                        c.type === 'withdrawal'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {c.type === 'withdrawal' ? '+' : '-'}
                      {formatINR(c.amount)}
                    </span>
                    <button
                      onClick={() => db.cashTransactions.delete(c.id)}
                      className="text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>

      {/* Section 4 & 5: Split / Shared Expenses + Savings Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Split / Shared Expenses */}
        <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-500" />
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t.budgets.splitTitle}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Split bills equally or by custom shares and mark settled
                </p>
              </div>
            </div>
            <div className="text-right text-xs font-mono tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold block">
                Owed to you: {formatINR(splitBalances.owedToMe)}
              </span>
              <span className="text-rose-600 dark:text-rose-400 font-bold block">
                You owe: {formatINR(splitBalances.iOweOthers)}
              </span>
            </div>
          </div>

          <form onSubmit={handleAddSplit} className="space-y-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Bill Title (e.g. Dinner, Trip)"
                value={splitTitle}
                onChange={(e) => setSplitTitle(e.target.value)}
                className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <input
                type="number"
                placeholder="Total Amount ₹"
                value={splitTotal}
                onChange={(e) => setSplitTotal(e.target.value)}
                className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
              />
              <input
                type="text"
                placeholder="Paid by (Me or Friend)"
                value={splitPaidBy}
                onChange={(e) => setSplitPaidBy(e.target.value)}
                className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="People (comma separated)"
                value={splitPeopleStr}
                onChange={(e) => setSplitPeopleStr(e.target.value)}
                className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <select
                value={splitMode}
                onChange={(e) => setSplitMode(e.target.value as 'equal' | 'custom')}
                className="min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value="equal">Split Equally</option>
                <option value="custom">Custom Amounts</option>
              </select>
              <button
                type="submit"
                className="min-h-[38px] px-3 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
              >
                Add Split Expense
              </button>
            </div>

            {splitMode === 'custom' && (
              <input
                type="text"
                placeholder="Custom shares in order (e.g. 1200, 1500, 900)"
                value={customSharesStr}
                onChange={(e) => setCustomSharesStr(e.target.value)}
                className="w-full min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
              />
            )}
          </form>

          <div className="space-y-3">
            {sharedExpenses.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {s.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Paid by {s.paidBy} · {s.date} · Total {formatINR(s.totalAmount)}
                    </p>
                  </div>
                  <button
                    onClick={() => db.sharedExpenses.delete(s.id)}
                    className="text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {s.participants.map((p) => (
                    <button
                      key={p.id}
                      onClick={async () => {
                        const updated = s.participants.map((part) =>
                          part.id === p.id ? { ...part, settled: !part.settled } : part
                        );
                        await db.sharedExpenses.update(s.id, {
                          participants: updated,
                        });
                      }}
                      className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                        p.settled
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-900 border-amber-500/40 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {p.name}: {formatINR(p.shareAmount)} ({p.settled ? 'Settled' : 'Owes'})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Savings Goals */}
        <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.budgets.savingsGoalsTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track target amount, deadline, and estimated months to completion
              </p>
            </div>
          </div>

          <form onSubmit={handleAddSavingsGoal} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Goal Name"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              className="min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
            />
            <input
              type="number"
              placeholder="Target ₹"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              className="min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
            <input
              type="number"
              placeholder="Saved so far ₹"
              value={goalSaved}
              onChange={(e) => setGoalSaved(e.target.value)}
              className="min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
            <input
              type="number"
              placeholder="Monthly Saving ₹"
              value={goalMonthly}
              onChange={(e) => setGoalMonthly(e.target.value)}
              className="min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
            <input
              type="date"
              value={goalDeadline}
              onChange={(e) => setGoalDeadline(e.target.value)}
              className="min-h-[38px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
            <button
              type="submit"
              className="min-h-[38px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
            >
              Add Goal
            </button>
          </form>

          <div className="space-y-3">
            {savingsGoals.map((goal) => {
              const pct = Math.min(
                100,
                Math.round((goal.savedSoFar / Math.max(1, goal.targetAmount)) * 100)
              );
              const remaining = Math.max(0, goal.targetAmount - goal.savedSoFar);
              const monthsLeft =
                goal.monthlySaving > 0 ? Math.ceil(remaining / goal.monthlySaving) : 0;

              return (
                <div
                  key={goal.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {goal.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Target: {formatINR(goal.targetAmount)} by {goal.deadline} · Saving {formatINR(goal.monthlySaving)}/mo
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          db.savingsGoals.update(goal.id, {
                            savedSoFar: goal.savedSoFar + goal.monthlySaving,
                          })
                        }
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-600/25 cursor-pointer"
                      >
                        +{formatINR(goal.monthlySaving)}
                      </button>
                      <button
                        onClick={() => db.savingsGoals.delete(goal.id)}
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Saved: {formatINR(goal.savedSoFar)} ({pct}%)
                    </span>
                    <span>
                      {remaining === 0
                        ? 'Goal Reached!'
                        : `~${monthsLeft} month(s) at current monthly pace`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
