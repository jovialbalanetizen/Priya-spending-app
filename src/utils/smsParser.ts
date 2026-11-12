import type { Expense, MerchantRule, PaymentMode } from '../types/models';
import { getTodayISO } from './formatters';

export interface ParsedSmsTransaction {
  isValidDebit: boolean;
  isIgnoredMessage: boolean;
  ignoreReason?: string;
  amount: number;
  merchant: string;
  category: string;
  date: string; // YYYY-MM-DD
  paymentMode: PaymentMode;
  accountLast4?: string;
  bankName?: string;
  rawSms: string;
}

export interface BankSmsPattern {
  id: string;
  bankName: string;
  description: string;
  regex: RegExp;
  defaultPaymentMode: PaymentMode;
  extract: (match: RegExpMatchArray, rawText: string) => {
    amount: number;
    merchant: string;
    accountLast4?: string;
    dateStr?: string;
    paymentMode?: PaymentMode;
  };
}

const DEBIT_KEYWORDS = [
  /\bdebited\b/i,
  /\bspent\b/i,
  /\bpaid\b/i,
  /\bwithdrawn\b/i,
  /\bsent\b/i,
  /\bupi\b/i,
  /\btxn\b/i,
  /\btrf\b/i,
  /\bpurchase\b/i,
  /\bdr\b/i,
];

const IGNORE_PATTERNS: { reason: string; regex: RegExp }[] = [
  {
    reason: 'OTP / verification message',
    regex: /\b(otp|one[\s-]?time[\s-]?password|verification code|auth code|secret code|do not share this code)\b/i,
  },
  {
    reason: 'Promotional / loan offer',
    regex: /\b(pre-approved|apply now|exclusive offer|get instant loan|loan up to|congratulations! you are eligible|free credit card)\b/i,
  },
  {
    reason: 'Balance-only alert',
    regex: /^(?=.*\b(avl bal|available balance|bal is|clear bal)\b)(?!.*\b(debited|spent|paid|withdrawn|sent|purchase)\b).*$/i,
  },
  {
    reason: 'Credit / incoming refund',
    regex: /^(?=.*\b(credited|received|refund of|cashback of)\b)(?!.*\b(debited|spent|paid to|withdrawn|sent to)\b).*$/i,
  },
];

/**
 * Default merchant keyword map for Indian merchants.
 */
export const DEFAULT_MERCHANT_KEYWORDS: Record<string, string> = {
  // Food & Dining
  swiggy: 'Food & Dining',
  zomato: 'Food & Dining',
  dominos: 'Food & Dining',
  mcdonalds: 'Food & Dining',
  starbucks: 'Food & Dining',
  kfc: 'Food & Dining',
  burger: 'Food & Dining',
  haldiram: 'Food & Dining',
  cafe: 'Food & Dining',
  restaurant: 'Food & Dining',
  barbeque: 'Food & Dining',
  chai: 'Food & Dining',
  eatfit: 'Food & Dining',

  // Groceries
  bigbasket: 'Groceries',
  dmart: 'Groceries',
  'd-mart': 'Groceries',
  blinkit: 'Groceries',
  zepto: 'Groceries',
  instamart: 'Groceries',
  jiomart: 'Groceries',
  reliancefresh: 'Groceries',
  'reliance smart': 'Groceries',
  naturebasket: 'Groceries',
  milk: 'Groceries',
  supermarket: 'Groceries',
  kirana: 'Groceries',

  // Movies & Entertainment
  bookmyshow: 'Movies & Entertainment',
  pvr: 'Movies & Entertainment',
  inox: 'Movies & Entertainment',
  netflix: 'Movies & Entertainment',
  spotify: 'Movies & Entertainment',
  hotstar: 'Movies & Entertainment',
  primevideo: 'Movies & Entertainment',
  sonyliv: 'Movies & Entertainment',
  youtube: 'Movies & Entertainment',

  // Online Shopping
  amazon: 'Online Shopping',
  flipkart: 'Online Shopping',
  myntra: 'Online Shopping',
  ajio: 'Online Shopping',
  nykaa: 'Online Shopping',
  meesho: 'Online Shopping',
  tatacliq: 'Online Shopping',
  croma: 'Online Shopping',
  decathlon: 'Online Shopping',

  // Transport
  uber: 'Transport',
  ola: 'Transport',
  rapido: 'Transport',
  irctc: 'Transport',
  nammayatri: 'Transport',
  redbus: 'Transport',
  makemytrip: 'Transport',
  indigo: 'Transport',
  indianOil: 'Transport',
  iocl: 'Transport',
  hpcl: 'Transport',
  bpcl: 'Transport',
  petrol: 'Transport',
  fuel: 'Transport',
  fastag: 'Transport',
  metro: 'Transport',

  // Bills & Recharge
  electricity: 'Bills & Recharge',
  bescom: 'Bills & Recharge',
  tneb: 'Bills & Recharge',
  tangedco: 'Bills & Recharge',
  mahadiscom: 'Bills & Recharge',
  adani: 'Bills & Recharge',
  tatapower: 'Bills & Recharge',
  recharge: 'Bills & Recharge',
  jio: 'Bills & Recharge',
  airtel: 'Bills & Recharge',
  vi: 'Bills & Recharge',
  bsnl: 'Bills & Recharge',
  actfibernet: 'Bills & Recharge',
  broadband: 'Bills & Recharge',
  gas: 'Bills & Recharge',
  indane: 'Bills & Recharge',
  bharatgas: 'Bills & Recharge',
  waterbill: 'Bills & Recharge',

  // Health
  apollo: 'Health',
  pharmeasy: 'Health',
  '1mg': 'Health',
  tata1mg: 'Health',
  medplus: 'Health',
  netmeds: 'Health',
  hospital: 'Health',
  clinic: 'Health',
  pharmacy: 'Health',
  cultfit: 'Health',
  practo: 'Health',
};

/**
 * Parses an Indian amount string like "1,25,000.50" or "450" into a number.
 */
export function parseAmountString(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Cleans up extracted merchant names (strips UPI VPA suffixes, trailing Ref/UPI numbers, etc.)
 */
export function cleanMerchantName(rawMerchant: string): string {
  let m = rawMerchant
    .replace(/\b(UPI|Ref|No|Txn|Info|Avl|Bal|Not you).*$/i, '')
    .replace(/[.;,]+$/, '')
    .trim();

  // If it's a VPA like swiggy@ybl or merchant.paytm@okaxis, take the handle prefix if readable
  if (m.includes('@')) {
    const vpaLeft = m.split('@')[0];
    m = vpaLeft.replace(/[._-]+/g, ' ');
  }

  m = m.replace(/\s{2,}/g, ' ').trim();
  if (!m || m.length < 2) return 'Unknown Merchant';

  // Title case words if all uppercase or all lowercase
  if (m === m.toUpperCase() || m === m.toLowerCase()) {
    return m
      .split(' ')
      .map((w) => (w.length <= 3 && /^(pvr|kfc|atm|upi|emi|sbi)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ');
  }
  return m;
}

/**
 * Parses common Indian SMS date strings (DD-MM-YY, DD/MM/YYYY, DD-MMM-YY, YYYY-MM-DD) into YYYY-MM-DD.
 */
export function parseSmsDate(dateStr?: string, fallbackDate: string = getTodayISO()): string {
  if (!dateStr) return fallbackDate;
  const s = dateStr.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD-MM-YYYY or DD/MM/YYYY or DD-MM-YY or DD/MM/YY
  const dmyNumeric = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyNumeric) {
    const day = dmyNumeric[1].padStart(2, '0');
    const month = dmyNumeric[2].padStart(2, '0');
    let year = dmyNumeric[3];
    if (year.length === 2) {
      year = `20${year}`;
    }
    const mNum = Number(month);
    const dNum = Number(day);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${year}-${month}-${day}`;
    }
  }

  // DD-MMM-YY or DD-MMM-YYYY or DD MMM YYYY (e.g. 11-Nov-26 or 15Oct26)
  const months: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  const dmyAlpha = s.match(/^(\d{1,2})[\s/-]*([A-Za-z]{3})[\s/-]*(\d{2,4})$/);
  if (dmyAlpha) {
    const day = dmyAlpha[1].padStart(2, '0');
    const mon = months[dmyAlpha[2].toLowerCase()];
    let year = dmyAlpha[3];
    if (year.length === 2) year = `20${year}`;
    if (mon) return `${year}-${mon}-${day}`;
  }

  return fallbackDate;
}

/**
 * Predicts category from merchant name using user-learned rules first, then default keywords.
 */
export function categorizeMerchant(
  merchant: string,
  rawText = '',
  learnedRules: MerchantRule[] = []
): string {
  const normMerchant = merchant.toLowerCase().trim();
  const combined = `${normMerchant} ${rawText.toLowerCase()}`;

  // 1. Check user-learned rules first (exact or substring match)
  for (const rule of learnedRules) {
    if (rule.merchantKey && normMerchant.includes(rule.merchantKey.toLowerCase())) {
      return rule.category;
    }
  }

  // 2. Check default keyword dictionary
  for (const [keyword, category] of Object.entries(DEFAULT_MERCHANT_KEYWORDS)) {
    if (combined.includes(keyword.toLowerCase())) {
      return category;
    }
  }

  return 'Others';
}

/**
 * Extendable list of regex patterns — one per Indian bank or message style.
 * To add a new bank pattern, append a BankSmsPattern entry to BANK_SMS_PATTERNS.
 */
export const BANK_SMS_PATTERNS: BankSmsPattern[] = [
  // 1. HDFC Bank UPI / A/c Debit ("Sent Rs.450.00 From HDFC Bank A/C *1234 To Swiggy On 11-11-26" or "Rs.450.00 debited from a/c **1234 on 11-11-26 to VPA swiggy@ybl")
  {
    id: 'hdfc-upi-sent',
    bankName: 'HDFC Bank',
    description: 'HDFC Bank Sent/Debited via UPI',
    defaultPaymentMode: 'UPI',
    regex: /(?:Sent|Debited)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+(?:HDFC\s+Bank\s+)?A\/[cC]\s*[xX*]*(\d{3,4})\s+(?:to|at)\s+([^\n\r]+?)\s+on\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    extract: (m) => ({
      amount: parseAmountString(m[1]),
      accountLast4: m[2],
      merchant: cleanMerchantName(m[3]),
      dateStr: m[4],
      paymentMode: 'UPI',
    }),
  },
  // 2. HDFC / ICICI / Axis VPA Format ("Rs. 640.00 debited from A/c XX1234 on 11-11-26 to VPA zomato@hdfcbank")
  {
    id: 'bank-vpa-debit',
    bankName: 'Bank UPI',
    description: 'Standard Bank A/c debit to VPA handle',
    defaultPaymentMode: 'UPI',
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+debited\s+from\s+A\/[cC]\s*[xX*]*(\d{3,4})\s+on\s+(\d{1,2}[\s/-][A-Za-z0-9]{2,3}[\s/-]\d{2,4})\s+to\s+(?:VPA\s+)?([^\s.(]+)/i,
    extract: (m) => ({
      amount: parseAmountString(m[1]),
      accountLast4: m[2],
      dateStr: m[3],
      merchant: cleanMerchantName(m[4]),
      paymentMode: 'UPI',
    }),
  },
  // 3. SBI YONO / UPI ("Dear UPI user A/C X9876 debited by 320.0 on date 11Nov26 trf to DMART Refno 431298")
  {
    id: 'sbi-upi-trf',
    bankName: 'SBI',
    description: 'State Bank of India UPI debit transfer',
    defaultPaymentMode: 'UPI',
    regex: /A\/[cC]\s*[xX*]*(\d{3,4})\s+debited\s+by\s+(?:Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)\s+on\s+(?:date\s+)?(\d{1,2}[\s/-]*[A-Za-z0-9]{2,3}[\s/-]*\d{2,4})\s+trf\s+to\s+(.+?)(?:\s+Ref|\s+If not|\.$|$)/i,
    extract: (m) => ({
      accountLast4: m[1],
      amount: parseAmountString(m[2]),
      dateStr: m[3],
      merchant: cleanMerchantName(m[4]),
      paymentMode: 'UPI',
    }),
  },
  // 4. ICICI Bank Account / UPI ("ICICI Bank Acct XX4512 debited for Rs 899.00 on 11-Nov-26; AMAZON INDIA credited. UPI:...")
  {
    id: 'icici-acct-debit',
    bankName: 'ICICI Bank',
    description: 'ICICI Bank Acct debited with payee credited clause',
    defaultPaymentMode: 'UPI',
    regex: /(?:ICICI\s+Bank\s+)?Acct\s*[xX*]*(\d{3,4})\s+debited\s+(?:for|with)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{1,2}[\s/-][A-Za-z0-9]{2,3}[\s/-]\d{2,4})\s*[;:,]\s*([^.;]+?)\s+credited/i,
    extract: (m) => ({
      accountLast4: m[1],
      amount: parseAmountString(m[2]),
      dateStr: m[3],
      merchant: cleanMerchantName(m[4]),
      paymentMode: 'UPI',
    }),
  },
  // 5. Axis Bank Debit ("INR 1,250.00 debited from A/c no. XX7721 on 11-11-2026 at BOOKMYSHOW")
  {
    id: 'axis-debit',
    bankName: 'Axis Bank',
    description: 'Axis Bank A/c debited at merchant/UPI',
    defaultPaymentMode: 'UPI',
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+debited\s+from\s+A\/[cC]\s*(?:no\.?)?\s*[xX*]*(\d{3,4})\s+on\s+(\d{1,2}[\s/-][A-Za-z0-9]{2,3}[\s/-]\d{2,4})\s+(?:at|to|info:?)\s*(?:UPI[/-][^/-]+[/-])?([^.\n\r]+)/i,
    extract: (m, raw) => ({
      amount: parseAmountString(m[1]),
      accountLast4: m[2],
      dateStr: m[3],
      merchant: cleanMerchantName(m[4]),
      paymentMode: /upi/i.test(raw) ? 'UPI' : 'Card',
    }),
  },
  // 6. Credit / Debit Card Spend ("Rs.2,499.00 spent on HDFC Bank Card x8821 at MYNTRA on 11-11-2026" or "INR 1450 spent on ICICI Bank Card XX3310 on 11-Nov-26 at PVR INOX")
  {
    id: 'card-spend-style-a',
    bankName: 'Card Spend',
    description: 'Credit/Debit Card spent at merchant',
    defaultPaymentMode: 'Card',
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:was\s+)?spent\s+on\s+(?:your\s+)?(?:[A-Za-z]+\s+)*Card\s*(?:ending\s+|no\.?\s*)?[xX*]*(\d{3,4})\s+(?:at|on)\s+(.+?)\s+(?:on|at)\s+(.+?)(?:\.|Avl|Curr|Not|$)/i,
    extract: (m) => {
      const part3 = m[3].trim();
      const part4 = m[4].trim();
      const isPart3Date = /^\d{1,2}[\s/-][A-Za-z0-9]{2,3}[\s/-]\d{2,4}$/.test(part3);
      return {
        amount: parseAmountString(m[1]),
        accountLast4: m[2],
        dateStr: isPart3Date ? part3 : part4,
        merchant: cleanMerchantName(isPart3Date ? part4 : part3),
        paymentMode: 'Card',
      };
    },
  },
  // 7. ATM Cash Withdrawal ("Rs.5,000 withdrawn from ATM using Card xx4412 on 11-11-26")
  {
    id: 'atm-withdrawal',
    bankName: 'ATM Withdrawal',
    description: 'Cash withdrawn at ATM',
    defaultPaymentMode: 'Cash',
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+withdrawn\s+from\s+ATM\s+(?:using\s+Card\s*[xX*]*(\d{3,4})\s+)?(?:from\s+A\/[cC]\s*[xX*]*(\d{3,4})\s+)?(?:on\s+(\d{1,2}[\s/-][A-Za-z0-9]{2,3}[\s/-]\d{2,4}))?/i,
    extract: (m) => ({
      amount: parseAmountString(m[1]),
      accountLast4: m[2] || m[3],
      dateStr: m[4],
      merchant: 'ATM Cash Withdrawal',
      paymentMode: 'Cash',
    }),
  },
  // 8. Kotak / Generic UPI Paid ("Paid Rs. 180.00 to UBER INDIA via UPI from A/c XX9012 on 11-11-2026")
  {
    id: 'upi-paid-to',
    bankName: 'UPI App',
    description: 'Paid Rs. X to Merchant via UPI',
    defaultPaymentMode: 'UPI',
    regex: /(?:Paid|Sent)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)(?:\s+via\s+UPI|\s+from\s+A\/[cC]\s*[xX*]*(\d{3,4})|\s+on\s+(\d{1,2}[\s/-][A-Za-z0-9]{2,3}[\s/-]\d{2,4})|\s+UPI\s+Ref|\.$|$)/i,
    extract: (m, raw) => {
      const acctMatch = raw.match(/A\/[cC]\s*[xX*]*(\d{3,4})/i);
      const dateMatch = raw.match(/\bon\s+(\d{1,2}[\s/-][A-Za-z0-9]{2,3}[\s/-]\d{2,4})/i);
      return {
        amount: parseAmountString(m[1]),
        merchant: cleanMerchantName(m[2]),
        accountLast4: m[3] || acctMatch?.[1],
        dateStr: m[4] || dateMatch?.[1],
        paymentMode: 'UPI',
      };
    },
  },
  // 9. Net Banking / BillPay ("Your A/c XX5543 is debited with Rs. 1,840.00 on 11-11-2026 towards BESCOM ELECTRICITY")
  {
    id: 'generic-ac-debited-towards',
    bankName: 'Bank Alert',
    description: 'Generic A/c debited with/for Rs. X towards/to/at Merchant',
    defaultPaymentMode: 'Net Banking',
    regex: /A\/[cC]\s*(?:no\.?)?\s*[xX*]*(\d{3,4})\s+(?:is\s+|has\s+been\s+)?debited\s+(?:with|for|by)?\s*(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:on\s+(\d{1,2}[\s/-][A-Za-z0-9]{2,3}[\s/-]\d{2,4})\s+)?(?:towards|to|at|for)\s+([^.\n\r]+)/i,
    extract: (m, raw) => ({
      accountLast4: m[1],
      amount: parseAmountString(m[2]),
      dateStr: m[3],
      merchant: cleanMerchantName(m[4]),
      paymentMode: /upi/i.test(raw) ? 'UPI' : /card/i.test(raw) ? 'Card' : 'Net Banking',
    }),
  },
];

/**
 * Fallback generic extractor when a message has valid debit keywords + INR amount
 * but a slightly non-standard word order.
 */
function fallbackDebitExtract(rawText: string, learnedRules: MerchantRule[], fallbackDate: string): ParsedSmsTransaction | null {
  const amtMatch =
    rawText.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    rawText.match(/debited\s+by\s+([\d,]+(?:\.\d{1,2})?)/i);

  if (!amtMatch) return null;
  const amount = parseAmountString(amtMatch[1]);
  if (amount <= 0) return null;

  const acctMatch = rawText.match(/(?:A\/[cC]|Acct|Card)\s*(?:ending|no\.?)?\s*[xX*]*(\d{3,4})/i);
  const dateMatch = rawText.match(/\b(\d{1,2}[\s/-][A-Za-z0-9]{2,3}[\s/-]\d{2,4})\b/);

  const merchMatch =
    rawText.match(/\b(?:to\s+VPA|trf\s+to|paid\s+to|spent\s+at|at|towards|to)\s+([A-Za-z0-9@._\s&-]{2,35}?)(?:\s+on\b|\s+Ref\b|\s+UPI\b|\s+Avl\b|[.;]|$)/i);

  const merchant = merchMatch ? cleanMerchantName(merchMatch[1]) : 'Unknown Merchant';
  const paymentMode: PaymentMode = /upi|vpa/i.test(rawText)
    ? 'UPI'
    : /card|pos/i.test(rawText)
      ? 'Card'
      : /atm|withdrawn/i.test(rawText)
        ? 'Cash'
        : 'Net Banking';

  return {
    isValidDebit: true,
    isIgnoredMessage: false,
    amount,
    merchant,
    category: categorizeMerchant(merchant, rawText, learnedRules),
    date: parseSmsDate(dateMatch?.[1], fallbackDate),
    paymentMode,
    accountLast4: acctMatch?.[1],
    bankName: 'Bank SMS',
    rawSms: rawText.trim(),
  };
}

/**
 * Parses a single SMS message and returns structured debit info, ignore flag, or unreadable status.
 */
export function parseSingleSms(
  rawSms: string,
  learnedRules: MerchantRule[] = [],
  fallbackDate: string = getTodayISO()
): ParsedSmsTransaction {
  const text = rawSms.trim();
  if (!text) {
    return {
      isValidDebit: false,
      isIgnoredMessage: true,
      ignoreReason: 'Empty message',
      amount: 0,
      merchant: '',
      category: 'Others',
      date: fallbackDate,
      paymentMode: 'UPI',
      rawSms: text,
    };
  }

  // 1. Check explicit ignore patterns (OTP, promo, pure credit, balance-only)
  for (const rule of IGNORE_PATTERNS) {
    if (rule.regex.test(text)) {
      return {
        isValidDebit: false,
        isIgnoredMessage: true,
        ignoreReason: rule.reason,
        amount: 0,
        merchant: '',
        category: 'Others',
        date: fallbackDate,
        paymentMode: 'UPI',
        rawSms: text,
      };
    }
  }

  // 2. Verify message contains at least one debit keyword
  const hasDebitKeyword = DEBIT_KEYWORDS.some((kw) => kw.test(text));
  if (!hasDebitKeyword) {
    return {
      isValidDebit: false,
      isIgnoredMessage: true,
      ignoreReason: 'No debit keyword found',
      amount: 0,
      merchant: '',
      category: 'Others',
      date: fallbackDate,
      paymentMode: 'UPI',
      rawSms: text,
    };
  }

  // 3. Try each bank pattern in order
  for (const pattern of BANK_SMS_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const extracted = pattern.extract(match, text);
      if (extracted.amount > 0) {
        const category = categorizeMerchant(extracted.merchant, text, learnedRules);
        return {
          isValidDebit: true,
          isIgnoredMessage: false,
          amount: extracted.amount,
          merchant: extracted.merchant,
          category,
          date: parseSmsDate(extracted.dateStr, fallbackDate),
          paymentMode: extracted.paymentMode ?? pattern.defaultPaymentMode,
          accountLast4: extracted.accountLast4,
          bankName: pattern.bankName,
          rawSms: text,
        };
      }
    }
  }

  // 4. Try fallback debit extractor
  const fallback = fallbackDebitExtract(text, learnedRules, fallbackDate);
  if (fallback) {
    return fallback;
  }

  // 5. Contains debit keyword, not an OTP/credit, but couldn't extract amount/merchant -> unreadable for manual review
  return {
    isValidDebit: false,
    isIgnoredMessage: false,
    amount: 0,
    merchant: 'Unknown Merchant',
    category: 'Others',
    date: fallbackDate,
    paymentMode: 'UPI',
    rawSms: text,
  };
}

/**
 * Splits a multi-message paste block into individual SMS messages.
 */
export function splitBulkSmsMessages(bulkText: string): string[] {
  const trimmed = bulkText.trim();
  if (!trimmed) return [];

  // Split by blank lines first; if single block with multiple lines where each line looks like an SMS, split by newline
  const blocks = trimmed
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 1 && trimmed.includes('\n')) {
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 1) return lines;
  }

  return blocks;
}

/**
 * Duplicate Protection:
 * Flags a candidate transaction if an existing expense has the same amount and normalized merchant
 * within 5 minutes (300,000 ms), OR matches an existing manual entry on the same date with same amount & merchant.
 */
export function isDuplicateTransaction(
  candidate: { amount: number; merchant: string; date: string; timestamp: number },
  existingExpenses: Expense[]
): boolean {
  const normCandidateMerchant = candidate.merchant.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const exp of existingExpenses) {
    if (exp.status === 'ignored') continue;
    if (Math.abs(exp.amount - candidate.amount) > 0.01) continue;

    const normExistingMerchant = exp.merchant.toLowerCase().replace(/[^a-z0-9]/g, '');
    const merchantMatches =
      normCandidateMerchant === normExistingMerchant ||
      (normCandidateMerchant.length >= 4 &&
        normExistingMerchant.length >= 4 &&
        (normCandidateMerchant.includes(normExistingMerchant) ||
          normExistingMerchant.includes(normCandidateMerchant)));

    if (!merchantMatches) continue;

    // Within 5 minutes
    const timeDiff = Math.abs(candidate.timestamp - exp.timestamp);
    if (timeDiff <= 5 * 60 * 1000) {
      return true;
    }

    // Or matching manual entry on the same calendar date
    if (exp.source === 'manual' && exp.date === candidate.date) {
      return true;
    }
  }

  return false;
}

/**
 * 5 realistic sample Indian bank SMS messages for the "Test SMS" button in Settings.
 */
export const FIVE_TEST_BANK_SMS: string[] = [
  'Sent Rs.540.00 From HDFC Bank A/C *4821 To Swiggy On 11-11-26 Ref 631512904412. Not You? Call 18002586161',
  'Dear UPI user A/C X9104 debited by 1,280.00 on date 11Nov26 trf to BIGBASKET Refno 431298765412',
  'ICICI Bank Acct XX4512 debited for Rs 2,499.00 on 10-Nov-26; AMAZON INDIA credited. UPI:6314998123.',
  'Rs.850.00 spent on HDFC Bank Card x8821 at PVR INOX on 09-11-2026. Avl lmt: Rs.1,42,000.',
  'Your A/c XX5543 is debited with Rs. 1,650.00 on 08-11-2026 towards BESCOM ELECTRICITY. BillPay Ref 991822.',
];
