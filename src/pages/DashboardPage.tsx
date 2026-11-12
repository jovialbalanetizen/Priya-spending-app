import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { getCategoryColor } from '../db/database';
import type { TranslationDictionary } from '../i18n/translations';
import type { AppSettings, Budget, Category, Expense } from '../types/models';
import {
  calculateMonthForecast,
  formatCompactINR,
  formatINR,
  formatMonthLabel,
  generateLocalInsights,
  getDaysInMonth,
  getPreviousYearMonth,
  getYearMonth,
} from '../utils/formatters';

interface DashboardPageProps {
  expenses: Expense[];
  categories: Category[];
  budgets: Budget[];
  settings: AppSettings;
  t: TranslationDictionary;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  expenses,
  categories,
  budgets,
  settings,
  t,
}) => {
  const [selectedYM, setSelectedYM] = useState<string>(getYearMonth());
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(null);

  // Optional Gemini Insights & "Ask SpendWise" Chat state
  const [aiSummary, setAiSummary] = useState<{
    headline: string;
    narrative: string;
    tips: string[];
  } | null>(null);
  const [loadingAiSummary, setLoadingAiSummary] = useState(false);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatAnswer, setChatAnswer] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);

  const prevYM = useMemo(() => getPreviousYearMonth(selectedYM), [selectedYM]);

  const monthExpenses = useMemo(
    () =>
      expenses.filter(
        (e) => e.status === 'confirmed' && e.date.startsWith(selectedYM)
      ),
    [expenses, selectedYM]
  );

  const prevMonthExpenses = useMemo(
    () =>
      expenses.filter(
        (e) => e.status === 'confirmed' && e.date.startsWith(prevYM)
      ),
    [expenses, prevYM]
  );

  const forecast = useMemo(
    () =>
      calculateMonthForecast(
        monthExpenses,
        prevMonthExpenses,
        selectedYM,
        new Date()
      ),
    [monthExpenses, prevMonthExpenses, selectedYM]
  );

  const localInsights = useMemo(
    () => generateLocalInsights(monthExpenses, prevMonthExpenses, budgets),
    [monthExpenses, prevMonthExpenses, budgets]
  );

  // Category split data for Donut & Bar charts
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthExpenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({
        name,
        value,
        color: getCategoryColor(name, categories),
      }))
      .sort((a, b) => b.value - a.value);
  }, [monthExpenses, categories]);

  // Daily spending across the month (Line / Area chart + Calendar heatmap)
  const dailyData = useMemo(() => {
    const daysCount = getDaysInMonth(selectedYM);
    const byDay = new Map<number, number>();
    for (let d = 1; d <= daysCount; d++) byDay.set(d, 0);

    for (const e of monthExpenses) {
      const dayNum = Number(e.date.slice(8, 10));
      if (dayNum >= 1 && dayNum <= daysCount) {
        byDay.set(dayNum, (byDay.get(dayNum) ?? 0) + e.amount);
      }
    }

    return [...byDay.entries()].map(([day, amount]) => ({
      day: String(day).padStart(2, '0'),
      dayNum: day,
      dateIso: `${selectedYM}-${String(day).padStart(2, '0')}`,
      amount,
    }));
  }, [monthExpenses, selectedYM]);

  // Weekday vs Weekend comparison
  const weekdayVsWeekend = useMemo(() => {
    let weekdayTotal = 0;
    let weekendTotal = 0;
    let weekdayCount = 0;
    let weekendCount = 0;

    for (const e of monthExpenses) {
      const [y, m, d] = e.date.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      if (dow === 0 || dow === 6) {
        weekendTotal += e.amount;
        weekendCount++;
      } else {
        weekdayTotal += e.amount;
        weekdayCount++;
      }
    }

    return [
      {
        label: 'Weekdays (Mon–Fri)',
        total: weekdayTotal,
        txCount: weekdayCount,
        color: '#6366F1',
      },
      {
        label: 'Weekends (Sat–Sun)',
        total: weekendTotal,
        txCount: weekendCount,
        color: '#F97316',
      },
    ];
  }, [monthExpenses]);

  // Top 5 Merchants & Top 5 Biggest Expenses
  const topMerchants = useMemo(() => {
    const map = new Map<string, { total: number; count: number; category: string }>();
    for (const e of monthExpenses) {
      const curr = map.get(e.merchant) ?? { total: 0, count: 0, category: e.category };
      curr.total += e.amount;
      curr.count += 1;
      map.set(e.merchant, curr);
    }
    return [...map.entries()]
      .map(([merchant, info]) => ({ merchant, ...info }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [monthExpenses]);

  const topBiggestExpenses = useMemo(
    () => [...monthExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5),
    [monthExpenses]
  );

  const drilldownTransactions = useMemo(() => {
    if (!drilldownCategory) return [];
    return monthExpenses
      .filter((e) => e.category === drilldownCategory)
      .sort((a, b) => b.amount - a.amount);
  }, [drilldownCategory, monthExpenses]);

  const shiftMonth = (delta: number) => {
    const [y, m] = selectedYM.split('-').map(Number);
    const nextDate = new Date(y, m - 1 + delta, 1);
    setSelectedYM(getYearMonth(nextDate));
    setDrilldownCategory(null);
    setAiSummary(null);
  };

  const handleGenerateGeminiSummary = async () => {
    setLoadingAiSummary(true);
    try {
      const statsSummary = [
        `Month: ${formatMonthLabel(selectedYM)}`,
        `Total Spent: ${formatINR(forecast.totalSpentSoFar)}`,
        `Forecast Month End: ${formatINR(forecast.projectedMonthTotal)}`,
        `Change vs Last Month: ${forecast.percentChangeVsLastMonth ?? 0}%`,
        `Category Breakdown: ${categoryData.map((c) => `${c.name}: ${formatINR(c.value)}`).join(', ')}`,
        `Weekday vs Weekend: ${weekdayVsWeekend.map((w) => `${w.label}=${formatINR(w.total)}`).join(', ')}`,
      ].join('\n');

      const res = await fetch('/api/gemini/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthLabel: formatMonthLabel(selectedYM),
          statsSummary,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data);
      }
    } catch {
      // Keep local insights if Gemini call fails
    } finally {
      setLoadingAiSummary(false);
    }
  };

  const handleAskSpendWise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuestion.trim()) return;
    setLoadingChat(true);
    setChatAnswer('');
    try {
      const confirmedAll = expenses.filter((x) => x.status === 'confirmed');
      const byMonthCat = new Map<string, number>();
      for (const tx of confirmedAll) {
        const key = `${tx.date.slice(0, 7)} | ${tx.category}`;
        byMonthCat.set(key, (byMonthCat.get(key) ?? 0) + tx.amount);
      }
      const contextLines = [
        `Selected Month (${selectedYM}) Total: ${formatINR(forecast.totalSpentSoFar)}`,
        'Monthly Category Totals:',
        ...[...byMonthCat.entries()].map(([k, v]) => `${k}: ${formatINR(v)}`),
        'Recent Top Transactions:',
        ...topBiggestExpenses.map(
          (tx) => `${tx.date} - ${tx.merchant} (${tx.category}): ${formatINR(tx.amount)}`
        ),
      ].join('\n');

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: chatQuestion,
          contextData: contextLines,
        }),
      });
      const data = await res.json();
      setChatAnswer(data.answer || data.error || 'Could not retrieve answer.');
    } catch {
      setChatAnswer('Offline or unable to reach SpendWise AI right now. Check your local charts above.');
    } finally {
      setLoadingChat(false);
    }
  };

  const maxDailySpend = useMemo(
    () => Math.max(1, ...dailyData.map((d) => d.amount)),
    [dailyData]
  );

  return (
    <div className="space-y-8">
      {/* Header & Month Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t.dashboard.title}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Click any category bar or donut slice to inspect its transactions
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 self-start">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 text-sm font-bold text-slate-900 dark:text-white min-w-[140px] text-center">
            {formatMonthLabel(selectedYM)}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top KPI Row: Month Spend vs Last Month + Pace Forecast */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Spent ({formatMonthLabel(selectedYM)})
          </p>
          <p className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatINR(forecast.totalSpentSoFar, {
              currencyFormat: settings.currencyFormat,
            })}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {forecast.percentChangeVsLastMonth !== null ? (
              <>
                {forecast.percentChangeVsLastMonth > 0 ? (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +{forecast.percentChangeVsLastMonth}%
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    {forecast.percentChangeVsLastMonth}%
                  </span>
                )}
                <span className="text-slate-500 dark:text-slate-400">
                  {t.dashboard.vsLastMonth}
                </span>
              </>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                No prior month baseline
              </span>
            )}
          </div>
        </div>

        <div className="md:col-span-2 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <TrendingUp className="w-4 h-4" />
              <span>Month-End Pace Forecast</span>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Daily avg: {formatINR(Math.round(forecast.dailyAverage))} / day ({forecast.daysElapsed} of {forecast.totalDaysInMonth} days)
            </span>
          </div>

          <p className="mt-3 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {t.dashboard.forecastPrefix}{' '}
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatINR(forecast.projectedMonthTotal, {
                currencyFormat: settings.currencyFormat,
              })}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Calculated from {monthExpenses.length} confirmed transaction(s) in {formatMonthLabel(selectedYM)}.
          </p>
        </div>
      </div>

      {/* Category Drilldown Modal/Drawer when a slice or bar is clicked */}
      {drilldownCategory && (
        <div className="p-6 rounded-3xl bg-emerald-950/5 dark:bg-emerald-950/20 border border-emerald-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {drilldownCategory} — {drilldownTransactions.length} Transaction(s)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Total:{' '}
                {formatINR(
                  drilldownTransactions.reduce((s, x) => s + x.amount, 0),
                  { currencyFormat: settings.currencyFormat }
                )}
              </p>
            </div>
            <button
              onClick={() => setDrilldownCategory(null)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close Filter</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {drilldownTransactions.map((tx) => (
              <div
                key={tx.id}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {tx.merchant}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {tx.date} · {tx.paymentMode}
                  </p>
                </div>
                <span className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white shrink-0">
                  {formatINR(tx.amount, { currencyFormat: settings.currencyFormat })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts Grid Row 1: Donut Chart of Category Split + Bar Chart of Category Totals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t.dashboard.categorySplit}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Tap any slice or legend item to view its transactions
          </p>

          {categoryData.length === 0 ? (
            <p className="py-16 text-center text-xs text-slate-400">
              No transactions for this month
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={2}
                      onClick={(entry) => setDrilldownCategory(entry?.name ?? null)}
                      className="cursor-pointer"
                    >
                      {categoryData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: unknown) =>
                        formatINR(Number(val), { currencyFormat: settings.currencyFormat })
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {categoryData.map((c) => {
                  const pct =
                    forecast.totalSpentSoFar > 0
                      ? Math.round((c.value / forecast.totalSpentSoFar) * 100)
                      : 0;
                  return (
                    <button
                      key={c.name}
                      onClick={() => setDrilldownCategory(c.name)}
                      className="w-full flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          {c.name}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                        {formatCompactINR(c.value)} ({pct}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bar Chart of Category Totals */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t.dashboard.categoryTotals}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Comparison across active spending categories
          </p>

          {categoryData.length === 0 ? (
            <p className="py-16 text-center text-xs text-slate-400">
              No transactions for this month
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryData}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 24, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(val: unknown) =>
                      formatINR(Number(val), { currencyFormat: settings.currencyFormat })
                    }
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 8, 8, 0]}
                    onClick={(data) => {
                      if (data?.name) setDrilldownCategory(String(data.name));
                    }}
                    className="cursor-pointer"
                  >
                    {categoryData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Charts Grid Row 2: Daily Spending Line/Area Chart + Weekday vs Weekend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t.dashboard.dailySpending}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Day-by-day outflow across {formatMonthLabel(selectedYM)}
          </p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => formatCompactINR(Number(v))}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(val: unknown) =>
                    formatINR(Number(val), { currencyFormat: settings.currencyFormat })
                  }
                  labelFormatter={(label) => `Day ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fill="#10B981"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekday vs Weekend Comparison */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              {t.dashboard.weekdayVsWeekend}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Compare Monday–Friday against Saturday–Sunday
            </p>

            <div className="space-y-4">
              {weekdayVsWeekend.map((item) => {
                const pct =
                  forecast.totalSpentSoFar > 0
                    ? Math.round((item.total / forecast.totalSpentSoFar) * 100)
                    : 0;
                return (
                  <div key={item.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.label}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {formatINR(item.total, {
                          currencyFormat: settings.currencyFormat,
                        })}{' '}
                        ({pct}%)
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.txCount} transaction(s)
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            Tip: Keeping weekend discretionary UPI spends below 35% of monthly total helps hit savings goals faster.
          </div>
        </div>
      </div>

      {/* Calendar Heatmap of Daily Spend */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t.dashboard.calendarHeatmap}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Darker emerald squares represent higher daily spending
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>₹0</span>
            <span className="w-3 h-3 rounded bg-slate-100 dark:bg-slate-800 inline-block" />
            <span className="w-3 h-3 rounded bg-emerald-500/25 inline-block" />
            <span className="w-3 h-3 rounded bg-emerald-500/60 inline-block" />
            <span className="w-3 h-3 rounded bg-emerald-600 inline-block" />
            <span>Peak</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {dailyData.map((d) => {
            const ratio = d.amount / maxDailySpend;
            const bgClass =
              d.amount === 0
                ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-400'
                : ratio < 0.3
                  ? 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 border-emerald-500/30'
                  : ratio < 0.65
                    ? 'bg-emerald-500/40 text-slate-900 dark:text-white border-emerald-500/50'
                    : 'bg-emerald-600 text-white border-emerald-600';

            return (
              <div
                key={d.day}
                className={`p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 flex flex-col justify-between min-h-[62px] ${bgClass}`}
              >
                <span className="text-[11px] font-mono font-semibold">{d.day}</span>
                <span className="text-[11px] font-mono tabular-nums font-bold truncate">
                  {d.amount > 0 ? formatCompactINR(d.amount) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 5 Merchants & Top 5 Biggest Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">
            {t.dashboard.topMerchants}
          </h2>
          {topMerchants.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No data</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {topMerchants.map((m, idx) => (
                <div
                  key={m.merchant}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      0{idx + 1}. {m.merchant}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {m.category} · {m.count} txn(s)
                    </p>
                  </div>
                  <span className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white shrink-0">
                    {formatINR(m.total, { currencyFormat: settings.currencyFormat })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">
            {t.dashboard.topExpenses}
          </h2>
          {topBiggestExpenses.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No data</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {topBiggestExpenses.map((exp, idx) => (
                <div
                  key={exp.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      0{idx + 1}. {exp.merchant}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {exp.date} · {exp.category} · {exp.paymentMode}
                    </p>
                  </div>
                  <span className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white shrink-0">
                    {formatINR(exp.amount, { currencyFormat: settings.currencyFormat })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Phase 5: Local Monthly Insights + Optional Gemini Summary & "Ask SpendWise" */}
      <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Smart Monthly Insights & Saving Tips
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Computed locally on your device from your {formatMonthLabel(selectedYM)} ledger
            </p>
          </div>
          {settings.geminiEnabled && (
            <button
              onClick={handleGenerateGeminiSummary}
              disabled={loadingAiSummary}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer self-start"
            >
              {loadingAiSummary ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Generate Deeper Gemini Analysis</span>
            </button>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-2">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {aiSummary ? aiSummary.headline : localInsights.headline}
          </p>
          {aiSummary ? (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {aiSummary.narrative}
            </p>
          ) : (
            localInsights.bullets.map((b, idx) => (
              <p key={idx} className="text-xs text-slate-600 dark:text-slate-300">
                {b}
              </p>
            ))
          )}
        </div>

        {localInsights.unusualSpends.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
              <span>Unusual or Large Spends Flagged This Month</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {localInsights.unusualSpends.map((u) => (
                <div
                  key={u.id}
                  className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {u.merchant}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {u.date} · {u.category}
                    </p>
                  </div>
                  <span className="text-xs font-bold font-mono tabular-nums text-amber-700 dark:text-amber-300">
                    {formatINR(u.amount, { currencyFormat: settings.currencyFormat })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
            3 Practical Saving Tips
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(aiSummary?.tips ?? localInsights.savingTips).map((tip, i) => (
              <div
                key={i}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed"
              >
                <span className="font-bold text-emerald-600 dark:text-emerald-400 mr-1">
                  0{i + 1}.
                </span>
                {tip}
              </div>
            ))}
          </div>
        </div>

        {/* Optional "Ask SpendWise" Chat (only displayed when user opts into Gemini in More > Settings) */}
        {settings.geminiEnabled && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <MessageSquare className="w-4 h-4" />
              <span>Ask SpendWise Assistant (Opt-In AI Q&amp;A)</span>
            </div>
            <form onSubmit={handleAskSpendWise} className="flex gap-2">
              <input
                type="text"
                placeholder='e.g. "How much did I spend on Food & Dining vs Groceries?"'
                value={chatQuestion}
                onChange={(e) => setChatQuestion(e.target.value)}
                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={loadingChat}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {loadingChat ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Ask</span>
              </button>
            </form>
            {chatAnswer && (
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                {chatAnswer}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
