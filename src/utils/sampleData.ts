import { db } from '../db/database';
import type {
  Budget,
  CashTransaction,
  Expense,
  PaymentMode,
  RecurringExpense,
  SavingsGoal,
  SharedExpense,
  TodoTask,
} from '../types/models';
import { getDaysInMonth, getPreviousYearMonth, getTodayISO, getYearMonth } from './formatters';

interface SampleTxSeed {
  merchant: string;
  category: string;
  amount: number;
  mode: PaymentMode;
  notes?: string;
  last4?: string;
}

const SAMPLE_SEEDS: SampleTxSeed[] = [
  { merchant: 'Swiggy', category: 'Food & Dining', amount: 460, mode: 'UPI', last4: '4821', notes: 'Biryani dinner' },
  { merchant: 'Zomato', category: 'Food & Dining', amount: 620, mode: 'UPI', last4: '4821', notes: 'Weekend lunch' },
  { merchant: 'BigBasket', category: 'Groceries', amount: 1480, mode: 'UPI', last4: '9104', notes: 'Weekly vegetables & staples' },
  { merchant: 'DMart', category: 'Groceries', amount: 2850, mode: 'Card', last4: '8821', notes: 'Monthly household groceries' },
  { merchant: 'Blinkit', category: 'Groceries', amount: 340, mode: 'UPI', last4: '4821', notes: 'Milk, bread & eggs' },
  { merchant: 'Uber India', category: 'Transport', amount: 295, mode: 'UPI', last4: '4821', notes: 'Office commute' },
  { merchant: 'Ola Cabs', category: 'Transport', amount: 410, mode: 'UPI', last4: '9104', notes: 'Airport drop' },
  { merchant: 'IRCTC Rail', category: 'Transport', amount: 1640, mode: 'Net Banking', last4: '5543', notes: 'Shatabdi Express ticket' },
  { merchant: 'IndianOil Fuel', category: 'Transport', amount: 1200, mode: 'Card', last4: '8821', notes: 'Petrol fill-up' },
  { merchant: 'Amazon India', category: 'Online Shopping', amount: 2199, mode: 'Card', last4: '8821', notes: 'Wireless earbuds' },
  { merchant: 'Flipkart', category: 'Online Shopping', amount: 1599, mode: 'UPI', last4: '4821', notes: 'Kitchen organizer' },
  { merchant: 'Myntra', category: 'Online Shopping', amount: 2750, mode: 'Card', last4: '3310', notes: 'Festive kurta & shirt' },
  { merchant: 'BookMyShow', category: 'Movies & Entertainment', amount: 760, mode: 'UPI', last4: '4821', notes: '2 IMAX tickets' },
  { merchant: 'PVR INOX', category: 'Movies & Entertainment', amount: 540, mode: 'Card', last4: '8821', notes: 'Popcorn & beverages' },
  { merchant: 'BESCOM Electricity', category: 'Bills & Recharge', amount: 1920, mode: 'Net Banking', last4: '5543', notes: 'Monthly electricity bill' },
  { merchant: 'JioFiber Broadband', category: 'Bills & Recharge', amount: 999, mode: 'UPI', last4: '4821', notes: '150 Mbps fiber plan' },
  { merchant: 'Airtel Prepaid', category: 'Bills & Recharge', amount: 719, mode: 'UPI', last4: '9104', notes: '84-day mobile recharge' },
  { merchant: 'Apollo Pharmacy', category: 'Health', amount: 680, mode: 'UPI', last4: '4821', notes: 'Vitamins & first-aid' },
  { merchant: 'Cult.fit', category: 'Health', amount: 1450, mode: 'Card', last4: '8821', notes: 'Fitness membership' },
  { merchant: 'Starbucks India', category: 'Food & Dining', amount: 520, mode: 'Card', last4: '3310', notes: 'Cold brew & croissant' },
  { merchant: 'Haldiram Restaurant', category: 'Food & Dining', amount: 890, mode: 'UPI', last4: '4821', notes: 'Family snacks' },
  { merchant: 'Zepto Instant', category: 'Groceries', amount: 475, mode: 'UPI', last4: '4821', notes: 'Fresh fruits & curd' },
  { merchant: 'Namma Yatri', category: 'Transport', amount: 165, mode: 'UPI', last4: '4821', notes: 'Auto ride' },
  { merchant: 'Decathlon Sports', category: 'Online Shopping', amount: 1899, mode: 'Card', last4: '8821', notes: 'Running shoes' },
];

/**
 * Generates ~82 realistic Indian transactions across current and previous month,
 * plus 4 category budgets, 6 tasks, 2 recurring expenses, 2 shared splits, cash wallet logs, and savings goals.
 */
export async function loadSampleData(now: Date = new Date()): Promise<void> {
  await clearSampleData();

  const currentYM = getYearMonth(now);
  const prevYM = getPreviousYearMonth(currentYM);
  const todayDay = now.getDate();
  const prevMonthDays = getDaysInMonth(prevYM);

  const expenses: Expense[] = [];

  // 1. Generate 42 confirmed transactions in the previous month
  for (let i = 0; i < 42; i++) {
    const seed = SAMPLE_SEEDS[i % SAMPLE_SEEDS.length];
    const day = ((i * 2) % prevMonthDays) + 1;
    const dateStr = `${prevYM}-${String(day).padStart(2, '0')}`;
    const variance = ((i % 5) - 2) * 45;
    const amount = Math.max(80, seed.amount + variance);

    expenses.push({
      id: `sample-prev-${i + 1}`,
      amount,
      merchant: seed.merchant,
      category: seed.category,
      date: dateStr,
      timestamp: new Date(`${dateStr}T14:30:00`).getTime() + i * 1000,
      paymentMode: seed.mode,
      accountLast4: seed.last4,
      notes: seed.notes,
      rawSms: `Sent Rs.${amount}.00 From HDFC Bank A/C *${seed.last4 || '4821'} To ${seed.merchant.toUpperCase()} On ${dateStr}`,
      status: 'confirmed',
      source: 'sms',
      bankName: 'HDFC Bank',
      isSample: true,
    });
  }

  // 2. Generate 38 confirmed transactions in the current month up to today
  for (let i = 0; i < 38; i++) {
    const seed = SAMPLE_SEEDS[(i + 3) % SAMPLE_SEEDS.length];
    const maxDay = Math.max(1, todayDay);
    const day = (i % maxDay) + 1;
    const dateStr = `${currentYM}-${String(day).padStart(2, '0')}`;
    // Slightly higher food spend on weekends for realistic insights
    const [y, m, d] = dateStr.split('-').map(Number);
    const isWeekend = [0, 6].includes(new Date(y, m - 1, d).getDay());
    const multiplier = isWeekend && seed.category === 'Food & Dining' ? 1.35 : 1.05;
    const amount = Math.round((seed.amount * multiplier) / 10) * 10;

    expenses.push({
      id: `sample-curr-${i + 1}`,
      amount,
      merchant: seed.merchant,
      category: seed.category,
      date: dateStr,
      timestamp: new Date(`${dateStr}T18:15:00`).getTime() + i * 1000,
      paymentMode: seed.mode,
      accountLast4: seed.last4,
      notes: seed.notes,
      rawSms: `Sent Rs.${amount}.00 From HDFC Bank A/C *${seed.last4 || '4821'} To ${seed.merchant.toUpperCase()} On ${dateStr}`,
      status: 'confirmed',
      source: i % 4 === 0 ? 'manual' : 'sms',
      bankName: 'HDFC Bank',
      isSample: true,
    });
  }

  // 3. Add 3 items in "To Review" inbox (including 1 unreadable SMS for manual completion)
  const todayIso = getTodayISO(now);
  expenses.push(
    {
      id: 'sample-review-1',
      amount: 585,
      merchant: 'Swiggy',
      category: 'Food & Dining',
      date: todayIso,
      timestamp: Date.now() - 3600_000,
      paymentMode: 'UPI',
      accountLast4: '4821',
      rawSms: `Sent Rs.585.00 From HDFC Bank A/C *4821 To Swiggy On ${todayIso} Ref 631598712301`,
      status: 'review',
      source: 'sms',
      bankName: 'HDFC Bank',
      isSample: true,
    },
    {
      id: 'sample-review-2',
      amount: 1340,
      merchant: 'BigBasket',
      category: 'Groceries',
      date: todayIso,
      timestamp: Date.now() - 7200_000,
      paymentMode: 'UPI',
      accountLast4: '9104',
      rawSms: `Dear UPI user A/C X9104 debited by 1,340.00 on date ${todayIso} trf to BIGBASKET Refno 431298761111`,
      status: 'review',
      source: 'sms',
      bankName: 'SBI',
      isSample: true,
    },
    {
      id: 'sample-review-unreadable',
      amount: 0,
      merchant: 'Unknown Merchant',
      category: 'Others',
      date: todayIso,
      timestamp: Date.now() - 10800_000,
      paymentMode: 'UPI',
      rawSms: 'Alert: Custom debit instruction processed on your linked wallet ref #BLR-9921-TXN for pantry settlement.',
      status: 'unreadable',
      source: 'sms',
      bankName: 'Unrecognized SMS',
      isSample: true,
    }
  );

  // 4. Four category budgets + overall budget
  const budgets: Budget[] = [
    { id: 'sample-b-overall', category: 'OVERALL', monthlyLimit: 45000, isSample: true },
    { id: 'sample-b-food', category: 'Food & Dining', monthlyLimit: 8500, isSample: true },
    { id: 'sample-b-groceries', category: 'Groceries', monthlyLimit: 10000, isSample: true },
    { id: 'sample-b-shopping', category: 'Online Shopping', monthlyLimit: 12000, isSample: true },
    { id: 'sample-b-transport', category: 'Transport', monthlyLimit: 6000, isSample: true },
  ];

  // 5. Two recurring items (Rent & Streaming/Broadband)
  const recurring: RecurringExpense[] = [
    {
      id: 'sample-rec-1',
      title: '2BHK Apartment Rent (Indiranagar)',
      merchant: 'Landlord Rent UPI',
      amount: 22000,
      category: 'Bills & Recharge',
      paymentMode: 'UPI',
      dayOfMonth: 5,
      lastProcessedMonth: currentYM,
      active: true,
      isSample: true,
    },
    {
      id: 'sample-rec-2',
      title: 'Netflix & JioFiber Combo',
      merchant: 'Netflix India',
      amount: 1499,
      category: 'Movies & Entertainment',
      paymentMode: 'Card',
      dayOfMonth: 15,
      lastProcessedMonth: prevYM,
      active: true,
      isSample: true,
    },
  ];

  // 6. Six realistic To-Do tasks (money-linked bills, overdue, today, upcoming, grocery checklist)
  const addDays = (offset: number): string => {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return getTodayISO(dt);
  };

  const tasks: TodoTask[] = [
    {
      id: 'sample-task-1',
      title: 'Pay BESCOM Electricity Bill',
      dueDate: todayIso,
      dueTime: '18:00',
      priority: 'High',
      notes: 'Consumer No: 48291044 — avoid late surcharge',
      tags: ['Bills', 'Monthly'],
      completed: false,
      recurrence: 'monthly',
      isMoneyLinked: true,
      linkedAmount: 1890,
      linkedCategory: 'Bills & Recharge',
      linkedPaymentMode: 'UPI',
      subtasks: [],
      isSample: true,
    },
    {
      id: 'sample-task-2',
      title: 'HDFC Regalia Credit Card Statement Due',
      dueDate: addDays(-1), // Overdue by 1 day to showcase overdue banner
      dueTime: '20:00',
      priority: 'High',
      notes: 'Pay total amount due via NEFT/UPI to avoid finance charges',
      tags: ['Credit Card', 'Urgent'],
      completed: false,
      recurrence: 'monthly',
      isMoneyLinked: true,
      linkedAmount: 14250,
      linkedCategory: 'Bills & Recharge',
      linkedPaymentMode: 'Net Banking',
      subtasks: [],
      isSample: true,
    },
    {
      id: 'sample-task-3',
      title: 'Weekend Supermarket Grocery Run',
      dueDate: addDays(2),
      dueTime: '11:00',
      priority: 'Medium',
      notes: 'Tick items below to convert directly into a Groceries expense',
      tags: ['Groceries', 'Home'],
      completed: false,
      recurrence: 'weekly',
      isMoneyLinked: false,
      subtasks: [
        { id: 'sub-1', title: 'Sona Masoori Rice 5kg & Toor Dal', completed: false, estimatedAmount: 680 },
        { id: 'sub-2', title: 'Filter Coffee Powder & Nandini Ghee', completed: false, estimatedAmount: 540 },
        { id: 'sub-3', title: 'Fresh Vegetables & Fruits', completed: true, estimatedAmount: 320 },
      ],
      isSample: true,
    },
    {
      id: 'sample-task-4',
      title: 'Recharge Parents Jio Mobile Plan',
      dueDate: addDays(3),
      dueTime: '15:00',
      priority: 'Medium',
      notes: '84 days unlimited 5G pack',
      tags: ['Family', 'Recharge'],
      completed: false,
      recurrence: 'none',
      isMoneyLinked: true,
      linkedAmount: 859,
      linkedCategory: 'Bills & Recharge',
      linkedPaymentMode: 'UPI',
      subtasks: [],
      isSample: true,
    },
    {
      id: 'sample-task-5',
      title: 'Upload Section 80C & HRA Receipts on Payroll Portal',
      dueDate: addDays(5),
      priority: 'Low',
      notes: 'Download LIC & ELSS statements',
      tags: ['Tax', 'Work'],
      completed: false,
      recurrence: 'none',
      isMoneyLinked: false,
      subtasks: [],
      isSample: true,
    },
    {
      id: 'sample-task-6',
      title: 'Society Maintenance Quarterly Transfer',
      dueDate: addDays(-4),
      priority: 'Medium',
      notes: 'Paid via MyGate UPI',
      tags: ['Home'],
      completed: true,
      completedAt: Date.now() - 86400_000 * 3,
      recurrence: 'monthly',
      isMoneyLinked: true,
      linkedAmount: 3500,
      linkedCategory: 'Bills & Recharge',
      linkedPaymentMode: 'UPI',
      subtasks: [],
      isSample: true,
    },
  ];

  // 7. Split / Shared Expenses
  const sharedExpenses: SharedExpense[] = [
    {
      id: 'sample-split-1',
      title: 'Toit Indiranagar Team Dinner',
      totalAmount: 3600,
      category: 'Food & Dining',
      date: addDays(-2),
      paidBy: 'Me',
      splitMode: 'equal',
      participants: [
        { id: 'p-1', name: 'Aarav', shareAmount: 1200, settled: false },
        { id: 'p-2', name: 'Priya', shareAmount: 1200, settled: true },
        { id: 'p-3', name: 'Me', shareAmount: 1200, settled: true },
      ],
      notes: 'Split 3 ways equally',
      isSample: true,
    },
    {
      id: 'sample-split-2',
      title: 'Coorg Weekend Homestay & Fuel',
      totalAmount: 12000,
      category: 'Transport',
      date: addDays(-6),
      paidBy: 'Rohan',
      splitMode: 'custom',
      participants: [
        { id: 'p-4', name: 'Me', shareAmount: 4000, settled: false },
        { id: 'p-5', name: 'Rohan', shareAmount: 4500, settled: true },
        { id: 'p-6', name: 'Neha', shareAmount: 3500, settled: true },
      ],
      notes: 'Rohan booked the homestay',
      isSample: true,
    },
  ];

  // 8. Cash Tracker Logs
  const cashTransactions: CashTransaction[] = [
    {
      id: 'sample-cash-1',
      type: 'withdrawal',
      amount: 5000,
      description: 'SBI ATM Withdrawal — Koramangala',
      date: addDays(-5),
      timestamp: Date.now() - 86400_000 * 5,
      isSample: true,
    },
    {
      id: 'sample-cash-2',
      type: 'spend',
      amount: 650,
      description: 'Local Flower & Vegetable Vendor',
      category: 'Groceries',
      date: addDays(-3),
      timestamp: Date.now() - 86400_000 * 3,
      isSample: true,
    },
    {
      id: 'sample-cash-3',
      type: 'spend',
      amount: 300,
      description: 'Ironing & Car Wash Tip',
      category: 'Others',
      date: addDays(-1),
      timestamp: Date.now() - 86400_000,
      isSample: true,
    },
  ];

  // 9. Savings Goals
  const savingsGoals: SavingsGoal[] = [
    {
      id: 'sample-goal-1',
      name: 'Emergency Fund (6 Months)',
      targetAmount: 300000,
      savedSoFar: 185000,
      monthlySaving: 25000,
      deadline: '2027-05-01',
      color: '#10B981',
      isSample: true,
    },
    {
      id: 'sample-goal-2',
      name: 'Diwali Gold & Family Trip',
      targetAmount: 120000,
      savedSoFar: 54000,
      monthlySaving: 12000,
      deadline: '2027-10-15',
      color: '#6366F1',
      isSample: true,
    },
  ];

  await db.transaction(
    'rw',
    [
      db.expenses,
      db.budgets,
      db.recurringExpenses,
      db.tasks,
      db.sharedExpenses,
      db.cashTransactions,
      db.savingsGoals,
    ],
    async () => {
      await db.expenses.bulkPut(expenses);
      await db.budgets.bulkPut(budgets);
      await db.recurringExpenses.bulkPut(recurring);
      await db.tasks.bulkPut(tasks);
      await db.sharedExpenses.bulkPut(sharedExpenses);
      await db.cashTransactions.bulkPut(cashTransactions);
      await db.savingsGoals.bulkPut(savingsGoals);
    }
  );
}

/**
 * Removes all sample records while preserving any user-created records.
 */
export async function clearSampleData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.expenses,
      db.budgets,
      db.recurringExpenses,
      db.tasks,
      db.sharedExpenses,
      db.cashTransactions,
      db.savingsGoals,
    ],
    async () => {
      await db.expenses.filter((x) => Boolean(x.isSample)).delete();
      await db.budgets.filter((x) => Boolean(x.isSample)).delete();
      await db.recurringExpenses.filter((x) => Boolean(x.isSample)).delete();
      await db.tasks.filter((x) => Boolean(x.isSample)).delete();
      await db.sharedExpenses.filter((x) => Boolean(x.isSample)).delete();
      await db.cashTransactions.filter((x) => Boolean(x.isSample)).delete();
      await db.savingsGoals.filter((x) => Boolean(x.isSample)).delete();
    }
  );
}
