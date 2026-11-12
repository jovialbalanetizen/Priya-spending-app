import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Camera,
  FileSpreadsheet,
  Loader2,
  MessageSquareText,
  PlusCircle,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { db, learnMerchantCategory } from '../db/database';
import type {
  AppSettings,
  Category,
  Expense,
  MerchantRule,
  PaymentMode,
} from '../types/models';
import { formatINR, getTodayISO } from '../utils/formatters';
import {
  categorizeMerchant,
  isDuplicateTransaction,
  parseAmountString,
  parseSingleSms,
   parseSmsDate,
  splitBulkSmsMessages,
} from '../utils/smsParser';
import type { ToastMessage } from './GlobalOverlays';

export type CaptureTab = 'manual' | 'sms' | 'receipt' | 'statement';

interface CaptureModalProps {
  isOpen: boolean;
  initialTab?: CaptureTab;
  initialSmsText?: string;
  editingExpense?: Expense | null;
  categories: Category[];
  merchantRules: MerchantRule[];
  existingExpenses: Expense[];
  settings: AppSettings;
  onClose: () => void;
  onShowToast: (toast: ToastMessage) => void;
}

const PAYMENT_MODES: PaymentMode[] = ['UPI', 'Card', 'Cash', 'Net Banking'];

export const CaptureModal: React.FC<CaptureModalProps> = ({
  isOpen,
  initialTab = 'manual',
  initialSmsText = '',
  editingExpense = null,
  categories,
  merchantRules,
  existingExpenses,
  settings,
  onClose,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<CaptureTab>(
    initialSmsText ? 'sms' : initialTab
  );

  // Manual / Edit form state
  const [amountStr, setAmountStr] = useState(
    editingExpense ? String(editingExpense.amount) : ''
  );
  const [merchant, setMerchant] = useState(editingExpense?.merchant ?? '');
  const [selectedCategory, setSelectedCategory] = useState(
    editingExpense?.category ?? categories[1]?.name ?? 'Food & Dining'
  );
  const [dateIso, setDateIso] = useState(editingExpense?.date ?? getTodayISO());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    editingExpense?.paymentMode ?? settings.defaultPaymentMode ?? 'UPI'
  );
  const [accountLast4, setAccountLast4] = useState(editingExpense?.accountLast4 ?? '');
  const [notes, setNotes] = useState(editingExpense?.notes ?? '');
  const [manualError, setManualError] = useState('');

  // Paste SMS state
  const [smsBulkText, setSmsBulkText] = useState(initialSmsText);
  const [smsResultLog, setSmsResultLog] = useState<string>('');
  const [isParsingGeminiSms, setIsParsingGeminiSms] = useState(false);

  // Receipt OCR state
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [receiptStatus, setReceiptStatus] = useState('');

  // Statement Import state
  const [statementHeaders, setStatementHeaders] = useState<string[]>([]);
  const [statementRows, setStatementRows] = useState<Record<string, string>[]>([]);
  const [colDate, setColDate] = useState('');
  const [colNarration, setColNarration] = useState('');
  const [colDebit, setColDebit] = useState('');
  const [rawPdfStatementText, setRawPdfStatementText] = useState('');

  React.useEffect(() => {
    if (editingExpense) {
      setActiveTab('manual');
      setAmountStr(String(editingExpense.amount));
      setMerchant(editingExpense.merchant);
      setSelectedCategory(editingExpense.category);
      setDateIso(editingExpense.date);
      setPaymentMode(editingExpense.paymentMode);
      setAccountLast4(editingExpense.accountLast4 ?? '');
      setNotes(editingExpense.notes ?? '');
    } else if (initialSmsText) {
      setActiveTab('sms');
      setSmsBulkText(initialSmsText);
    } else {
      setActiveTab(initialTab);
      setAmountStr('');
      setMerchant('');
      setDateIso(getTodayISO());
      setPaymentMode(settings.defaultPaymentMode ?? 'UPI');
      setAccountLast4('');
      setNotes('');
    }
    setManualError('');
    setSmsResultLog('');
  }, [editingExpense, initialSmsText, initialTab, isOpen, settings.defaultPaymentMode]);

  if (!isOpen) return null;

  const handleMerchantChange = (val: string) => {
    setMerchant(val);
    if (!editingExpense && val.trim().length >= 3) {
      const autoCat = categorizeMerchant(val, '', merchantRules);
      if (autoCat !== 'Others') {
        setSelectedCategory(autoCat);
      }
    }
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseAmountString(amountStr);
    if (numericAmount <= 0) {
      setManualError('Please enter a valid amount greater than ₹0.');
      return;
    }

    const cleanMerch = merchant.trim() || selectedCategory;
    const now = Date.now();

    if (!editingExpense) {
      const isDup = isDuplicateTransaction(
        { amount: numericAmount, merchant: cleanMerch, date: dateIso, timestamp: now },
        existingExpenses
      );
      if (isDup) {
        setManualError(
          `Duplicate detected: ${formatINR(numericAmount)} at ${cleanMerch} was already logged within 5 minutes.`
        );
        return;
      }
    }

    const txId = editingExpense?.id ?? `exp-${now}-${Math.random().toString(36).slice(2, 7)}`;
    const previousRecord = editingExpense ? { ...editingExpense } : null;

    const newExpense: Expense = {
      id: txId,
      amount: numericAmount,
      merchant: cleanMerch,
      category: selectedCategory,
      date: dateIso,
      timestamp: editingExpense?.timestamp ?? now,
      paymentMode,
      accountLast4: accountLast4.trim() || undefined,
      notes: notes.trim() || undefined,
      rawSms: editingExpense?.rawSms,
      status: 'confirmed',
      source: editingExpense?.source ?? 'manual',
    };

    await db.expenses.put(newExpense);

    // Learn merchant category mapping if merchant name was provided
    const defaultGuess = categorizeMerchant(cleanMerch, '', []);
    if (cleanMerch !== selectedCategory && selectedCategory !== defaultGuess) {
      await learnMerchantCategory(cleanMerch, selectedCategory);
    }

    onShowToast({
      id: `toast-${now}`,
      message: editingExpense
        ? `Updated ${cleanMerch} (${formatINR(numericAmount)})`
        : `Saved ${formatINR(numericAmount)} at ${cleanMerch}`,
      undoLabel: 'Undo',
      onUndo: async () => {
        if (previousRecord) {
          await db.expenses.put(previousRecord);
        } else {
          await db.expenses.delete(txId);
        }
      },
    });

    onClose();
  };

  const handleParseBulkSms = async () => {
    const messages = splitBulkSmsMessages(smsBulkText);
    if (messages.length === 0) {
      setSmsResultLog('Paste at least one bank or UPI SMS message above.');
      return;
    }

    let addedReview = 0;
    let addedUnreadable = 0;
    let ignoredCount = 0;
    let duplicateCount = 0;
    const createdIds: string[] = [];

    for (let i = 0; i < messages.length; i++) {
      const raw = messages[i];
      const parsed = parseSingleSms(raw, merchantRules, getTodayISO());

      if (parsed.isIgnoredMessage) {
        ignoredCount++;
        continue;
      }

      const now = Date.now() + i;
      if (parsed.isValidDebit && parsed.amount > 0) {
        if (
          isDuplicateTransaction(
            {
              amount: parsed.amount,
              merchant: parsed.merchant,
              date: parsed.date,
              timestamp: now,
            },
            existingExpenses
          )
        ) {
          duplicateCount++;
          continue;
        }

        const id = `sms-${now}-${Math.random().toString(36).slice(2, 6)}`;
        createdIds.push(id);
        await db.expenses.put({
          id,
          amount: parsed.amount,
          merchant: parsed.merchant,
          category: parsed.category,
          date: parsed.date,
          timestamp: now,
          paymentMode: parsed.paymentMode,
          accountLast4: parsed.accountLast4,
          bankName: parsed.bankName,
          rawSms: parsed.rawSms,
          status: 'review',
          source: 'sms',
        });
        addedReview++;
      } else {
        // Unreadable debit message -> if Gemini is opted in, try server-side Gemini fallback first
        let resolvedByGemini = false;
        if (settings.geminiEnabled) {
          setIsParsingGeminiSms(true);
          try {
            const resp = await fetch('/api/gemini/parse-sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                rawText: raw,
                categories: categories.map((c) => c.name),
              }),
            });
            if (resp.ok) {
              const aiData = await resp.json();
              if (aiData.isDebit && Number(aiData.amount) > 0) {
                const id = `sms-ai-${now}`;
                createdIds.push(id);
                await db.expenses.put({
                  id,
                  amount: Number(aiData.amount),
                  merchant: aiData.merchant || 'Merchant',
                  category: aiData.category || 'Others',
                  date: aiData.dateIso || getTodayISO(),
                  timestamp: now,
                  paymentMode: (aiData.paymentMode as PaymentMode) || 'UPI',
                  accountLast4: aiData.accountLast4 || undefined,
                  rawSms: raw,
                  status: 'review',
                  source: 'sms',
                });
                addedReview++;
                resolvedByGemini = true;
              }
            }
          } catch {
            // Graceful fallback to local unreadable status
          } finally {
            setIsParsingGeminiSms(false);
          }
        }

        if (!resolvedByGemini) {
          const id = `sms-unread-${now}-${Math.random().toString(36).slice(2, 6)}`;
          createdIds.push(id);
          await db.expenses.put({
            id,
            amount: 0,
            merchant: 'Unknown Merchant',
            category: 'Others',
            date: getTodayISO(),
            timestamp: now,
            paymentMode: 'UPI',
            rawSms: raw,
            status: 'unreadable',
            source: 'sms',
          });
          addedUnreadable++;
        }
      }
    }

    onShowToast({
      id: `sms-batch-${Date.now()}`,
      message: `Added ${addedReview} to review${addedUnreadable ? `, ${addedUnreadable} unreadable` : ''}${ignoredCount ? ` (${ignoredCount} OTP/credit ignored)` : ''}${duplicateCount ? ` (${duplicateCount} duplicates skipped)` : ''}`,
      undoLabel: createdIds.length > 0 ? 'Undo' : undefined,
      onUndo:
        createdIds.length > 0
          ? async () => {
              await db.expenses.bulkDelete(createdIds);
            }
          : undefined,
    });

    if (addedReview > 0 || addedUnreadable > 0) {
      onClose();
    } else {
      setSmsResultLog(
        `Processed ${messages.length} message(s): ${ignoredCount} non-debit (OTP/credit/balance) ignored, ${duplicateCount} duplicate(s) skipped.`
      );
    }
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanningReceipt(true);
    setReceiptStatus(
      settings.geminiEnabled
        ? 'Scanning receipt with Gemini Vision...'
        : 'Running on-device Tesseract OCR...'
    );

    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
      });

      let extracted = false;

      if (settings.geminiEnabled) {
        try {
          const resp = await fetch('/api/gemini/scan-receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: dataUrl,
              mimeType: file.type || 'image/jpeg',
              categories: categories.map((c) => c.name),
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.amount) setAmountStr(String(data.amount));
            if (data.merchant) setMerchant(data.merchant);
            if (data.category) setSelectedCategory(data.category);
            if (data.dateIso && /^\d{4}-\d{2}-\d{2}$/.test(data.dateIso)) {
              setDateIso(data.dateIso);
            }
            if (data.notes) setNotes(data.notes);
            extracted = true;
          }
        } catch {
          // Fall back to Tesseract.js below
        }
      }

      if (!extracted) {
        setReceiptStatus('Extracting text locally with Tesseract.js...');
        const Tesseract = await import('tesseract.js');
        const result = await Tesseract.recognize(dataUrl, 'eng');
        const text = result.data.text || '';
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        const topLine = lines[0] || 'Receipt Merchant';
        const amtMatches = [...text.matchAll(/(?:total|amt|inr|rs\.?|₹)\s*[:=-]?\s*([\d,]+(?:\.\d{1,2})?)/gi)];
        const bestAmt = amtMatches.length
          ? Math.max(...amtMatches.map((m) => parseAmountString(m[1])))
          : 0;

        if (bestAmt > 0) setAmountStr(String(bestAmt));
        setMerchant(topLine.slice(0, 32));
        setSelectedCategory(categorizeMerchant(topLine, text, merchantRules));
        setNotes('Scanned via Receipt OCR');
      }

      setActiveTab('manual');
      setReceiptStatus('');
    } catch {
      setReceiptStatus('Could not extract receipt automatically. Please fill the fields manually.');
    } finally {
      setIsScanningReceipt(false);
    }
  };

  const handleStatementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

    if (json.length > 0) {
      const headers = Object.keys(json[0]);
      setStatementHeaders(headers);
      const stringRows = json.map((row) => {
        const out: Record<string, string> = {};
        for (const h of headers) out[h] = String(row[h] ?? '');
        return out;
      });
      setStatementRows(stringRows);

      // Auto-detect common Indian bank CSV columns
      const findCol = (patterns: RegExp[]) =>
        headers.find((h) => patterns.some((p) => p.test(h))) ?? headers[0] ?? '';

      setColDate(findCol([/date/i, /txn date/i, /value date/i]));
      setColNarration(findCol([/narration/i, /description/i, /particulars/i, /remarks/i, /merchant/i]));
      setColDebit(findCol([/debit/i, /withdrawal/i, /dr/i, /amount/i]));
    }
  };

  const handleImportMappedStatement = async () => {
    let imported = 0;
    const createdIds: string[] = [];

    // 1. Process CSV/XLSX mapped rows if present
    for (let i = 0; i < statementRows.length; i++) {
      const r = statementRows[i];
      const rawAmt = r[colDebit] ?? '';
      const amt = parseAmountString(rawAmt);
      if (amt <= 0) continue;

      const rawDesc = r[colNarration] || 'Bank Statement Debit';
      const rawDate = r[colDate] || getTodayISO();
      const parsedDate = parseSmsDate(rawDate, getTodayISO());
      const cleanMerch = rawDesc.replace(/UPI[/-]\d+[/-]/gi, '').slice(0, 36).trim() || 'Statement Merchant';
      const cat = categorizeMerchant(cleanMerch, rawDesc, merchantRules);
      const now = Date.now() + i;

      if (
        isDuplicateTransaction(
          { amount: amt, merchant: cleanMerch, date: parsedDate, timestamp: now },
          existingExpenses
        )
      ) {
        continue;
      }

      const id = `stmt-${now}-${i}`;
      createdIds.push(id);
      await db.expenses.put({
        id,
        amount: amt,
        merchant: cleanMerch,
        category: cat,
        date: parsedDate,
        timestamp: now,
        paymentMode: /upi/i.test(rawDesc) ? 'UPI' : 'Net Banking',
        rawSms: `Statement row: ${rawDate} | ${rawDesc} | Rs.${amt}`,
        status: 'review',
        source: 'statement',
      });
      imported++;
    }

    // 2. Also process pasted PDF statement lines if provided
    if (rawPdfStatementText.trim()) {
      const lines = rawPdfStatementText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (let j = 0; j < lines.length; j++) {
        const line = lines[j];
        const m = line.match(
          /(\d{1,2}[/-][A-Za-z0-9]{2,3}[/-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})/
        );
        if (m) {
          const parsedDate = parseSmsDate(m[1], getTodayISO());
          const cleanMerch = m[2].slice(0, 36).trim();
          const amt = parseAmountString(m[3]);
          if (amt > 0) {
            const id = `stmt-pdf-${Date.now()}-${j}`;
            createdIds.push(id);
            await db.expenses.put({
              id,
              amount: amt,
              merchant: cleanMerch,
              category: categorizeMerchant(cleanMerch, line, merchantRules),
              date: parsedDate,
              timestamp: Date.now() + j,
              paymentMode: /upi/i.test(line) ? 'UPI' : 'Net Banking',
              rawSms: line,
              status: 'review',
              source: 'statement',
            });
            imported++;
          }
        }
      }
    }

    onShowToast({
      id: `stmt-import-${Date.now()}`,
      message: `Imported ${imported} statement debit(s) to "To Review"`,
      undoLabel: createdIds.length > 0 ? 'Undo' : undefined,
      onUndo: async () => {
        await db.expenses.bulkDelete(createdIds);
      },
    });
    if (imported > 0) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-xl rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {editingExpense ? 'Edit Transaction' : 'Add or Capture Expense'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (hidden when editing a single transaction) */}
        {!editingExpense && (
          <div className="grid grid-cols-4 gap-1 p-2 bg-slate-100 dark:bg-slate-800/70 mx-6 mt-4 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'manual'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Manual</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sms')}
              className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'sms'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>Paste SMS</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('receipt')}
              className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'receipt'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Receipt</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('statement')}
              className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'statement'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Statement</span>
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {activeTab === 'manual' && (
            <form onSubmit={handleSaveManual} className="space-y-5">
              {/* Big Fast Amount Input */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Amount (₹ INR)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-2xl font-bold font-mono text-slate-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    autoFocus
                    required
                    placeholder="0"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Category Selection Buttons */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {categories.map((cat) => {
                    const isSelected = selectedCategory === cat.name;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.name)}
                        className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-medium text-left truncate border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-500 shadow-sm'
                            : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Merchant & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Merchant / Payee
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Swiggy, DMart, Uber"
                    value={merchant}
                    onChange={(e) => handleMerchantChange(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={dateIso}
                    onChange={(e) => setDateIso(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Payment Mode & Optional Note */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Payment Mode
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PAYMENT_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMode(mode)}
                        className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          paymentMode === mode
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Note & Last 4 Digits (Optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Quick note"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="XX12"
                      value={accountLast4}
                      onChange={(e) => setAccountLast4(e.target.value.replace(/\D/g, ''))}
                      className="w-20 min-h-[44px] px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-center text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {editingExpense?.rawSms && (
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 text-xs font-mono text-slate-600 dark:text-slate-300">
                  Original SMS: {editingExpense.rawSms}
                </div>
              )}

              {manualError && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {manualError}
                </p>
              )}

              <button
                type="submit"
                className="w-full min-h-[48px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-sm transition-colors cursor-pointer"
              >
                {editingExpense ? 'Save Changes' : 'Confirm & Save Expense'}
              </button>
            </form>
          )}

          {activeTab === 'sms' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Paste one or more Indian bank, UPI, or credit card SMS messages (separated by new lines). OTPs, credits, and balance inquiries are automatically ignored, and debits are added to your <strong>To Review</strong> inbox.
              </p>

              <textarea
                rows={6}
                placeholder={`Example:\nSent Rs.450.00 From HDFC Bank A/C *1234 To Swiggy On 11-11-26\n\nDear UPI user A/C X9876 debited by 1,280.0 on date 11Nov26 trf to BIGBASKET`}
                value={smsBulkText}
                onChange={(e) => setSmsBulkText(e.target.value)}
                className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              {smsResultLog && (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  {smsResultLog}
                </p>
              )}

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setSmsBulkText(
                      `Sent Rs.540.00 From HDFC Bank A/C *4821 To Swiggy On ${getTodayISO()}\n\nICICI Bank Acct XX4512 debited for Rs 1,499.00 on ${getTodayISO()}; AMAZON INDIA credited.\n\n882190 is your OTP for txn of Rs. 500.00. Do not share this code.`
                    )
                  }
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Load Sample Paste
                </button>

                <button
                  type="button"
                  disabled={isParsingGeminiSms}
                  onClick={handleParseBulkSms}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {isParsingGeminiSms && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Parse & Add to Review Inbox</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'receipt' && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <Camera className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Scan Restaurant Bill or Store Receipt
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {settings.geminiEnabled
                    ? 'Gemini Vision is enabled — upload a receipt photo to extract amount, merchant, and date automatically.'
                    : 'Runs local Tesseract.js OCR on your device (enable Gemini in More > Settings for higher accuracy).'}
                </p>
              </div>

              <label className="inline-flex min-h-[48px] px-6 py-3 rounded-2xl bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold items-center gap-2 cursor-pointer hover:opacity-95 transition">
                {isScanningReceipt ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{receiptStatus || 'Scanning...'}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Choose Photo or Capture Receipt</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleReceiptFileChange}
                  disabled={isScanningReceipt}
                  className="hidden"
                />
              </label>

              {receiptStatus && !isScanningReceipt && (
                <p className="text-xs text-amber-600 dark:text-amber-400">{receiptStatus}</p>
              )}
            </div>
          )}

          {activeTab === 'statement' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Upload a bank statement CSV / Excel file or paste statement lines from a PDF. Map the columns below to send all debit rows to your <strong>To Review</strong> inbox.
              </p>

              <div className="flex items-center gap-3">
                <label className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Upload CSV / XLSX Statement</span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleStatementUpload}
                    className="hidden"
                  />
                </label>
                {statementRows.length > 0 && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Loaded {statementRows.length} rows
                  </span>
                )}
              </div>

              {statementHeaders.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Date Column
                    </label>
                    <select
                      value={colDate}
                      onChange={(e) => setColDate(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      {statementHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Merchant / Narration
                    </label>
                    <select
                      value={colNarration}
                      onChange={(e) => setColNarration(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      {statementHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Debit Amount Column
                    </label>
                    <select
                      value={colDebit}
                      onChange={(e) => setColDebit(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      {statementHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Or Paste PDF Statement Text Lines (DD-MM-YYYY Description Amount)
                </label>
                <textarea
                  rows={3}
                  placeholder={`10-11-2026 UPI-SWIGGY-ORDER 540.00\n09-11-2026 UPI-BIGBASKET 1280.00`}
                  value={rawPdfStatementText}
                  onChange={(e) => setRawPdfStatementText(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleImportMappedStatement}
                disabled={statementRows.length === 0 && !rawPdfStatementText.trim()}
                className="w-full min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold cursor-pointer"
              >
                Import Debits to Review Inbox
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
