import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  Budget,
  CashTransaction,
  Category,
  Expense,
  MerchantRule,
  RecurringExpense,
  SavingsGoal,
  SharedExpense,
  TodoTask,
} from '../types/models';
import { getTodayISO, getYearMonth } from '../utils/formatters';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-shopping', name: 'Online Shopping', color: '#6366F1', icon: 'ShoppingBag', isDefault: true },
  { id: 'cat-food', name: 'Food & Dining', color: '#F97316', icon: 'Utensils', isDefault: true },
  { id: 'cat-movies', name: 'Movies & Entertainment', color: '#EC4899', icon: 'Film', isDefault: true },
  { id: 'cat-groceries', name: 'Groceries', color: '#10B981', icon: 'ShoppingCart', isDefault: true },
  { id: 'cat-transport', name: 'Transport', color: '#0EA5E9', icon: 'Car', isDefault: true },
  { id: 'cat-bills', name: 'Bills & Recharge', color: '#EAB308', icon: 'Zap', isDefault: true },
  { id: 'cat-health', name: 'Health', color: '#14B8A6', icon: 'HeartPulse', isDefault: true },
  { id: 'cat-others', name: 'Others', color: '#64748B', icon: 'Layers', isDefault: true },
];

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'default',
  theme: 'light',
  language: 'en',
  overallMonthlyBudget: 45000,
  geminiEnabled: false,
  pinCode: '',
  biometricsEnabled: false,
  autoLockMinutes: 5,
  notificationsEnabled: true,
  currencyFormat: 'lakhs',
  defaultPaymentMode: 'UPI',
  onboardingCompleted: false,
};

export class SpendWiseDB extends Dexie {
  expenses!: Table<Expense, string>;
  categories!: Table<Category, string>;
  merchantRules!: Table<MerchantRule, string>;
  budgets!: Table<Budget, string>;
  recurringExpenses!: Table<RecurringExpense, string>;
  sharedExpenses!: Table<SharedExpense, string>;
  cashTransactions!: Table<CashTransaction, string>;
  savingsGoals!: Table<SavingsGoal, string>;
  tasks!: Table<TodoTask, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('SpendWiseIndianDB');
    this.version(1).stores({
      expenses: 'id, date, status, category, merchant, paymentMode, timestamp, isSample',
      categories: 'id, &name',
      merchantRules: 'merchantKey, category',
      budgets: 'id, &category, isSample',
      recurringExpenses: 'id, dayOfMonth, active, isSample',
      sharedExpenses: 'id, date, isSample',
      cashTransactions: 'id, date, type, timestamp, isSample',
      savingsGoals: 'id, deadline, isSample',
      tasks: 'id, dueDate, completed, priority, isMoneyLinked, isSample',
      settings: 'id',
    });
  }
}

export const db = new SpendWiseDB();

/**
 * Ensures default categories and settings exist on startup, and processes any due recurring expenses.
 */
export async function initializeDatabase(): Promise<void> {
  const catCount = await db.categories.count();
  if (catCount === 0) {
    await db.categories.bulkPut(DEFAULT_CATEGORIES);
  }

  const existingSettings = await db.settings.get('default');
  if (!existingSettings) {
    await db.settings.put(DEFAULT_SETTINGS);
  }

  await processDueRecurringExpenses();
}

/**
 * Automatically creates confirmed expenses for active recurring items when the app opens
 * on or after their due day in the current month.
 */
export async function processDueRecurringExpenses(now: Date = new Date()): Promise<number> {
  const currentYM = getYearMonth(now);
  const currentDay = now.getDate();
  const allRecurring = await db.recurringExpenses.toArray();
  let createdCount = 0;

  for (const item of allRecurring) {
    if (!item.active) continue;
    if (item.lastProcessedMonth === currentYM) continue;

    if (currentDay >= item.dayOfMonth) {
      const dueDayPadded = String(Math.min(item.dayOfMonth, 28)).padStart(2, '0');
      const dueDateIso = `${currentYM}-${dueDayPadded}`;

      const newExpense: Expense = {
        id: `rec-${item.id}-${currentYM}`,
        amount: item.amount,
        merchant: item.merchant || item.title,
        category: item.category,
        date: dueDateIso,
        timestamp: Date.now(),
        paymentMode: item.paymentMode,
        notes: `Auto-added recurring: ${item.title}`,
        status: 'confirmed',
        source: 'recurring',
        isSample: item.isSample,
      };

      await db.expenses.put(newExpense);
      await db.recurringExpenses.update(item.id, { lastProcessedMonth: currentYM });
      createdCount++;
    }
  }

  return createdCount;
}

/**
 * Saves a learned merchant-to-category mapping when the user changes a merchant's category.
 */
export async function learnMerchantCategory(merchant: string, category: string): Promise<void> {
  const key = merchant.toLowerCase().trim();
  if (!key || key === 'unknown merchant' || key.length < 2) return;
  await db.merchantRules.put({
    merchantKey: key,
    category,
    updatedAt: Date.now(),
  });
}

/**
 * Returns the color for a category name from the category list, with a deterministic fallback.
 */
export function getCategoryColor(categoryName: string, categories: Category[] = DEFAULT_CATEGORIES): string {
  const found = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
  if (found) return found.color;
  const fallback = DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
  return fallback?.color ?? '#64748B';
}
