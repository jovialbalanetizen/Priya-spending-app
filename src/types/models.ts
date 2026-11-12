export type PaymentMode = 'UPI' | 'Card' | 'Cash' | 'Net Banking';

export type TransactionStatus = 'confirmed' | 'review' | 'unreadable' | 'ignored';

export type TransactionSource = 'manual' | 'sms' | 'share' | 'statement' | 'recurring' | 'todo' | 'receipt';

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  isDefault?: boolean;
}

export interface Expense {
  id: string;
  amount: number;
  merchant: string;
  category: string;
  date: string; // YYYY-MM-DD
  timestamp: number; // epoch ms
  paymentMode: PaymentMode;
  accountLast4?: string;
  notes?: string;
  rawSms?: string;
  status: TransactionStatus;
  source: TransactionSource;
  bankName?: string;
  isSample?: boolean;
}

export interface MerchantRule {
  merchantKey: string; // normalized lowercase merchant keyword
  category: string;
  updatedAt: number;
}

export interface Budget {
  id: string;
  category: string; // category name or 'OVERALL'
  monthlyLimit: number;
  isSample?: boolean;
}

export interface RecurringExpense {
  id: string;
  title: string;
  merchant: string;
  amount: number;
  category: string;
  paymentMode: PaymentMode;
  dayOfMonth: number; // 1 - 28
  lastProcessedMonth?: string; // YYYY-MM
  active: boolean;
  isSample?: boolean;
}

export interface SplitParticipant {
  id: string;
  name: string;
  shareAmount: number;
  settled: boolean;
}

export interface SharedExpense {
  id: string;
  title: string;
  totalAmount: number;
  category: string;
  date: string; // YYYY-MM-DD
  paidBy: string; // 'Me' or participant name
  splitMode: 'equal' | 'custom';
  participants: SplitParticipant[];
  notes?: string;
  isSample?: boolean;
}

export interface CashTransaction {
  id: string;
  type: 'withdrawal' | 'spend' | 'topup';
  amount: number;
  description: string;
  category?: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  isSample?: boolean;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  savedSoFar: number;
  monthlySaving: number;
  deadline: string; // YYYY-MM-DD
  color: string;
  isSample?: boolean;
}

export interface TodoSubtask {
  id: string;
  title: string;
  completed: boolean;
  estimatedAmount?: number;
  convertedExpenseId?: string;
}

export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface TodoTask {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  priority: TaskPriority;
  notes?: string;
  tags: string[];
  completed: boolean;
  completedAt?: number;
  recurrence: TaskRecurrence;
  isMoneyLinked: boolean;
  linkedAmount?: number;
  linkedCategory?: string;
  linkedPaymentMode?: PaymentMode;
  paidExpenseId?: string;
  subtasks: TodoSubtask[];
  isSample?: boolean;
}

export type SupportedLanguage = 'en' | 'ta' | 'hi';

export interface AppSettings {
  id: string; // 'default'
  theme: 'light' | 'dark';
  language: SupportedLanguage;
  overallMonthlyBudget: number;
  geminiEnabled: boolean;
  pinCode: string; // 4-digit PIN if set, empty string if disabled
  biometricsEnabled: boolean;
  biometricCredentialId?: string;
  autoLockMinutes: number;
  notificationsEnabled: boolean;
  currencyFormat: 'lakhs' | 'standard';
  defaultPaymentMode: PaymentMode;
  onboardingCompleted: boolean;
}
