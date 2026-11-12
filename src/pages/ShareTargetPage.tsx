import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Share2, XCircle } from 'lucide-react';
import { db, learnMerchantCategory } from '../db/database';
import type { Category, MerchantRule, PaymentMode } from '../types/models';
import { formatINR, getTodayISO } from '../utils/formatters';
import { parseSingleSms } from '../utils/smsParser';
import type { ToastMessage } from '../components/GlobalOverlays';

interface ShareTargetPageProps {
  categories: Category[];
  merchantRules: MerchantRule[];
  onShowToast: (toast: ToastMessage) => void;
}

export const ShareTargetPage: React.FC<ShareTargetPageProps> = ({
  categories,
  merchantRules,
  onShowToast,
}) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const sharedText =
    searchParams.get('text') ||
    searchParams.get('title') ||
    searchParams.get('url') ||
    'Sent Rs.540.00 From HDFC Bank A/C *4821 To Swiggy On 11-11-26';

  const parsed = useMemo(
    () => parseSingleSms(sharedText, merchantRules, getTodayISO()),
    [sharedText, merchantRules]
  );

  const [amount, setAmount] = useState(
    parsed.amount > 0 ? String(parsed.amount) : ''
  );
  const [merchant, setMerchant] = useState(
    parsed.merchant || 'Shared SMS Merchant'
  );
  const [category, setCategory] = useState(parsed.category || 'Others');
  const [date, setDate] = useState(parsed.date || getTodayISO());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    parsed.paymentMode || 'UPI'
  );

  const handleConfirmShared = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount);
    if (!Number.isFinite(numAmt) || numAmt <= 0) return;

    const id = `share-${Date.now()}`;
    await db.expenses.put({
      id,
      amount: numAmt,
      merchant: merchant.trim() || 'Merchant',
      category,
      date,
      timestamp: Date.now(),
      paymentMode,
      accountLast4: parsed.accountLast4,
      rawSms: sharedText,
      status: 'confirmed',
      source: 'share',
    });

    await learnMerchantCategory(merchant.trim(), category);

    onShowToast({
      id: `toast-${id}`,
      message: `Confirmed shared SMS: ${formatINR(numAmt)} at ${merchant}`,
      undoLabel: 'Undo',
      onUndo: async () => {
        await db.expenses.delete(id);
      },
    });
    navigate('/');
  };

  return (
    <div className="max-w-xl mx-auto py-6">
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg space-y-5">
        <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
          <Share2 className="w-5 h-5" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Confirm Shared Bank SMS
          </h1>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-300">
          {sharedText}
        </div>

        <form onSubmit={handleConfirmShared} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Amount (₹ INR)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base font-bold font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Merchant
              </label>
              <input
                type="text"
                required
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Date &amp; Mode
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1 min-h-[44px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-28 min-h-[44px] px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Cash">Cash</option>
                  <option value="Net Banking">Net Banking</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Confirm Transaction</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="min-h-[46px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
            >
              <XCircle className="w-4 h-4" />
              <span>Ignore</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
