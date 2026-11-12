import type { Budget, Expense } from '../types/models';

/**
 * Formats an amount in Indian Rupee format (e.g. ₹1,25,000 or ₹1,25,000.50).
 */
export function formatINR(
  amount: number,
  options: { showDecimals?: boolean; currencyFormat?: 'lakhs' | 'standard' } = {}
): string {
  const { showDecimals = false, currencyFormat = 'lakhs' } = options;
  if (!Number.isFinite(amount)) return '₹0';

  const isNegative = amount < 0;
  const absVal = Math.abs(amount);
  const locale = currencyFormat === 'standard' ? 'en-US' : 'en-IN';

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(Math.round(showDecimals ? absVal * 100 : absVal) / (showDecimals ? 100 : 1));

  return `${isNegative ? '-' : ''}₹${formatted}`;
}

/**
 * Compact Indian currency format (e.g. ₹1.25L, ₹45.2k, ₹850) for chart axes.
 */
export function formatCompactINR(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) {
    return `${sign}₹${(abs / 10000000).toFixed(2).replace(/\.00$/, '')}Cr`;
  }
  if (abs >= 100000) {
    return `${sign}₹${(abs / 100000).toFixed(2).replace(/\.00$/, '')}L`;
  }
  if (abs >= 1000) {
    return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${sign}₹${Math.round(abs)}`;
}

/**
 * Returns today's date string in YYYY-MM-DD local time.
 */
export function getTodayISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns YYYY-MM for a given Date or ISO date string.
 */
export function getYearMonth(dateOrIso: Date | string = new Date()): string {
  if (typeof dateOrIso === 'string') {
    return dateOrIso.slice(0, 7);
  }
  const year = dateOrIso.getFullYear();
  const month = String(dateOrIso.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns previous month's YYYY-MM given a YYYY-MM string.
 */
export function getPreviousYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;
  const prevDate = new Date(y, m - 2, 1);
  return getYearMonth(prevDate);
}

/**
 * Returns total days in a YYYY-MM month.
 */
export function getDaysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

/**
 * Formats YYYY-MM into human-readable label like "November 2026".
 */
export function formatMonthLabel(yearMonth: string, locale = 'en-IN'): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/**
 * Formats YYYY-MM-DD into "11 Nov 2026" or "Today" / "Yesterday".
 */
export function formatDateFriendly(dateIso: string, todayIso: string = getTodayISO()): string {
  if (dateIso === todayIso) return 'Today';
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const yesterday = new Date(ty, tm - 1, td - 1);
  if (dateIso === getTodayISO(yesterday)) return 'Yesterday';

  const [y, m, d] = dateIso.split('-').map(Number);
  if (!y || !m || !d) return dateIso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface ForecastResult {
  totalSpentSoFar: number;
  daysElapsed: number;
  totalDaysInMonth: number;
  dailyAverage: number;
  projectedMonthTotal: number;
  percentChangeVsLastMonth: number | null;
}

/**
 * Calculates month-end spending forecast and percentage change vs previous month.
 */
export function calculateMonthForecast(
  currentMonthExpenses: Expense[],
  lastMonthExpenses: Expense[],
  yearMonth: string,
  referenceDate: Date = new Date()
): ForecastResult {
  const confirmedCurrent = currentMonthExpenses.filter((e) => e.status === 'confirmed');
  const confirmedLast = lastMonthExpenses.filter((e) => e.status === 'confirmed');

  const totalSpentSoFar = confirmedCurrent.reduce((sum, e) => sum + e.amount, 0);
  const lastMonthTotal = confirmedLast.reduce((sum, e) => sum + e.amount, 0);

  const totalDaysInMonth = getDaysInMonth(yearMonth);
  const currentYM = getYearMonth(referenceDate);

  let daysElapsed = totalDaysInMonth;
  if (yearMonth === currentYM) {
    daysElapsed = Math.max(1, referenceDate.getDate());
  } else if (yearMonth > currentYM) {
    daysElapsed = 1;
  }

  const dailyAverage = totalSpentSoFar / daysElapsed;
  const projectedMonthTotal =
    yearMonth === currentYM ? Math.round(dailyAverage * totalDaysInMonth) : Math.round(totalSpentSoFar);

  const percentChangeVsLastMonth =
    lastMonthTotal > 0 ? Number((((totalSpentSoFar - lastMonthTotal) / lastMonthTotal) * 100).toFixed(1)) : null;

  return {
    totalSpentSoFar,
    daysElapsed,
    totalDaysInMonth,
    dailyAverage,
    projectedMonthTotal,
    percentChangeVsLastMonth,
  };
}

export interface BudgetStatusItem {
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  percentage: number;
  alertLevel: 'normal' | 'warning' | 'exceeded';
}

/**
 * Evaluates category or overall budgets with warning at >=80% and exceeded at >=100%.
 */
export function evaluateBudgetStatus(
  budgets: Budget[],
  confirmedExpenses: Expense[],
  overallBudgetLimit = 0
): {
  overall: BudgetStatusItem | null;
  categories: BudgetStatusItem[];
} {
  const totalSpent = confirmedExpenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = new Map<string, number>();
  for (const exp of confirmedExpenses) {
    byCategory.set(exp.category, (byCategory.get(exp.category) ?? 0) + exp.amount);
  }

  const buildItem = (category: string, limit: number, spent: number): BudgetStatusItem => {
    const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    const alertLevel: 'normal' | 'warning' | 'exceeded' =
      percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'normal';
    return {
      category,
      limit,
      spent,
      remaining: limit - spent,
      percentage,
      alertLevel,
    };
  };

  const explicitOverall = budgets.find((b) => b.category === 'OVERALL');
  const effectiveOverallLimit = explicitOverall ? explicitOverall.monthlyLimit : overallBudgetLimit;

  const overall =
    effectiveOverallLimit > 0 ? buildItem('Overall Monthly Budget', effectiveOverallLimit, totalSpent) : null;

  const categories = budgets
    .filter((b) => b.category !== 'OVERALL' && b.monthlyLimit > 0)
    .map((b) => buildItem(b.category, b.monthlyLimit, byCategory.get(b.category) ?? 0))
    .sort((a, b) => b.percentage - a.percentage);

  return { overall, categories };
}

export interface LocalInsights {
  headline: string;
  bullets: string[];
  unusualSpends: Expense[];
  savingTips: string[];
}

/**
 * Generates plain-language monthly summary, unusual spend alerts, and 3 saving tips locally on device.
 */
export function generateLocalInsights(
  currentExpenses: Expense[],
  lastMonthExpenses: Expense[],
  budgets: Budget[]
): LocalInsights {
  const confirmed = currentExpenses.filter((e) => e.status === 'confirmed');
  const prevConfirmed = lastMonthExpenses.filter((e) => e.status === 'confirmed');

  const totalCurrent = confirmed.reduce((s, e) => s + e.amount, 0);
  const totalPrev = prevConfirmed.reduce((s, e) => s + e.amount, 0);

  if (confirmed.length === 0) {
    return {
      headline: 'No confirmed expenses recorded for this month yet.',
      bullets: ['Add an expense manually, paste bank SMS messages, or load sample data to see insights.'],
      unusualSpends: [],
      savingTips: [
        'Set category budgets for Food & Dining and Online Shopping to get 80% threshold alerts.',
        'Paste weekly UPI SMS alerts every Sunday to keep your ledger accurate.',
        'Link recurring utility bills in the To-Do tab so you never pay late fees.',
      ],
    };
  }

  // Category totals current vs previous
  const catCurr = new Map<string, number>();
  const catPrev = new Map<string, number>();
  let weekendSpend = 0;
  let weekdaySpend = 0;

  for (const e of confirmed) {
    catCurr.set(e.category, (catCurr.get(e.category) ?? 0) + e.amount);
    const [y, m, d] = e.date.split('-').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendSpend += e.amount;
    } else {
      weekdaySpend += e.amount;
    }
  }

  for (const e of prevConfirmed) {
    catPrev.set(e.category, (catPrev.get(e.category) ?? 0) + e.amount);
  }

  const topCatEntry = [...catCurr.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCatName = topCatEntry ? topCatEntry[0] : 'Others';
  const topCatAmount = topCatEntry ? topCatEntry[1] : 0;
  const topCatPrev = catPrev.get(topCatName) ?? 0;

  const weekendRatio = totalCurrent > 0 ? Math.round((weekendSpend / totalCurrent) * 100) : 0;
  const weekendNote = weekendRatio >= 40 ? ', mostly on weekends' : ', distributed across weekdays';

  let headline = `You spent ${formatINR(topCatAmount)} on ${topCatName} this month${weekendNote}.`;
  if (topCatPrev > 0) {
    const diffPct = Math.round(((topCatAmount - topCatPrev) / topCatPrev) * 100);
    if (diffPct > 0) {
      headline = `You spent ${diffPct}% more on ${topCatName} than last month${weekendNote}.`;
    } else if (diffPct < 0) {
      headline = `You spent ${Math.abs(diffPct)}% less on ${topCatName} than last month — great discipline!`;
    }
  }

  const bullets: string[] = [];
  if (totalPrev > 0) {
    const overallPct = Math.round(((totalCurrent - totalPrev) / totalPrev) * 100);
    bullets.push(
      `Overall spending is ${formatINR(totalCurrent)} (${overallPct >= 0 ? `+${overallPct}%` : `${overallPct}%`} vs last month's ${formatINR(totalPrev)}).`
    );
  } else {
    bullets.push(`Total confirmed spend this month is ${formatINR(totalCurrent)} across ${confirmed.length} transactions.`);
  }

  bullets.push(
    `Weekend spending accounts for ${weekendRatio}% (${formatINR(weekendSpend)}) while weekdays account for ${100 - weekendRatio}% (${formatINR(weekdaySpend)}).`
  );

  // Unusual / large spend detection (> 2.2x mean transaction and >= ₹1,500)
  const avgTx = totalCurrent / confirmed.length;
  const unusualSpends = confirmed
    .filter((e) => e.amount >= Math.max(1500, avgTx * 2.2))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  // 3 practical saving tips
  const savingTips: string[] = [];
  const foodSpend = catCurr.get('Food & Dining') ?? 0;
  if (foodSpend > 3000) {
    savingTips.push(
      `Food & Dining is at ${formatINR(foodSpend)}. Trimming 2 weekend delivery orders a week could save ~${formatINR(Math.round(foodSpend * 0.25))}/month.`
    );
  }
  if (weekendRatio > 42) {
    savingTips.push(
      `${weekendRatio}% of your outflow happens on Saturday & Sunday. Try setting a ₹2,000 weekend UPI cap before Friday evening.`
    );
  }
  const budgetStatuses = evaluateBudgetStatus(budgets, confirmed);
  const warningCat = budgetStatuses.categories.find((c) => c.percentage >= 80);
  if (warningCat) {
    savingTips.push(
      `Your ${warningCat.category} budget is at ${warningCat.percentage}% (${formatINR(warningCat.spent)} / ${formatINR(warningCat.limit)}). Pause non-essential spends in this category for the rest of the month.`
    );
  }
  if (savingTips.length < 3) {
    savingTips.push(
      `Consolidate small UPI micro-payments (< ₹200) using your Cash Wallet or UPI Lite to curb impulse checkouts.`
    );
  }
  if (savingTips.length < 3) {
    savingTips.push(
      `Automate your monthly savings transfer on the 1st of the month before discretionary categories ramp up.`
    );
  }

  return {
    headline,
    bullets,
    unusualSpends,
    savingTips: savingTips.slice(0, 3),
  };
}
