import { describe, expect, it } from 'vitest';
import {
  categorizeMerchant,
  isDuplicateTransaction,
  parseSingleSms,
} from '../smsParser';
import {
  calculateMonthForecast,
  evaluateBudgetStatus,
  formatINR,
} from '../formatters';
import type { Budget, Expense } from '../../types/models';

describe('Indian SMS Parser — 16 Realistic Sample Messages', () => {
  it('1. Parses HDFC Bank UPI Sent message (Swiggy -> Food & Dining)', () => {
    const sms =
      'Sent Rs.450.00 From HDFC Bank A/C *1234 To Swiggy On 11-11-26 Ref 631511223344';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(450);
    expect(res.merchant.toLowerCase()).toContain('swiggy');
    expect(res.category).toBe('Food & Dining');
    expect(res.paymentMode).toBe('UPI');
    expect(res.accountLast4).toBe('1234');
    expect(res.date).toBe('2026-11-11');
  });

  it('2. Parses HDFC Bank VPA debit message (Zomato -> Food & Dining)', () => {
    const sms =
      'Rs. 640.00 debited from A/c XX9812 on 10-11-26 to VPA zomato@hdfcbank (UPI Ref No 431288990011).';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(640);
    expect(res.category).toBe('Food & Dining');
    expect(res.accountLast4).toBe('9812');
    expect(res.date).toBe('2026-11-10');
  });

  it('3. Parses SBI YONO UPI transfer (DMart -> Groceries)', () => {
    const sms =
      'Dear UPI user A/C X9876 debited by 1,850.50 on date 09Nov26 trf to DMART Refno 431298112233';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(1850.5);
    expect(res.category).toBe('Groceries');
    expect(res.accountLast4).toBe('9876');
    expect(res.date).toBe('2026-11-09');
  });

  it('4. Parses ICICI Bank UPI debit (Amazon -> Online Shopping)', () => {
    const sms =
      'ICICI Bank Acct XX4512 debited for Rs 2,999.00 on 08-Nov-26; AMAZON INDIA credited. UPI:6314887766.';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(2999);
    expect(res.category).toBe('Online Shopping');
    expect(res.accountLast4).toBe('4512');
    expect(res.date).toBe('2026-11-08');
  });

  it('5. Parses Axis Bank UPI debit (BookMyShow -> Movies & Entertainment)', () => {
    const sms =
      'INR 780.00 debited from A/c no. XX7721 on 07-11-2026 at BOOKMYSHOW. Avl Bal: INR 42,110.00';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(780);
    expect(res.category).toBe('Movies & Entertainment');
    expect(res.accountLast4).toBe('7721');
    expect(res.date).toBe('2026-11-07');
  });

  it('6. Parses Credit Card spend (Myntra -> Online Shopping)', () => {
    const sms =
      'Rs.3,499.00 spent on HDFC Bank Card x8821 at MYNTRA on 06-11-2026. Avl lmt: Rs.85,000.';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(3499);
    expect(res.category).toBe('Online Shopping');
    expect(res.paymentMode).toBe('Card');
    expect(res.accountLast4).toBe('8821');
  });

  it('7. Parses ICICI Credit Card spend with date before merchant (PVR -> Movies & Entertainment)', () => {
    const sms =
      'INR 1,120.00 spent on ICICI Bank Card XX3310 on 05-Nov-26 at PVR INOX. Avl Lmt: INR 1,20,000.';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(1120);
    expect(res.category).toBe('Movies & Entertainment');
    expect(res.paymentMode).toBe('Card');
  });

  it('8. Parses ATM Cash Withdrawal', () => {
    const sms =
      'Rs.5,000 withdrawn from ATM using Card xx4412 on 04-11-26. Avl Bal Rs.28,400.';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(5000);
    expect(res.paymentMode).toBe('Cash');
    expect(res.accountLast4).toBe('4412');
  });

  it('9. Parses Kotak / UPI Paid format (Uber -> Transport)', () => {
    const sms =
      'Paid Rs. 345.00 to UBER INDIA via UPI from A/c XX9012 on 03-11-2026. UPI Ref 6311223344.';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(345);
    expect(res.category).toBe('Transport');
    expect(res.paymentMode).toBe('UPI');
  });

  it('10. Parses Net Banking Electricity Bill (BESCOM -> Bills & Recharge)', () => {
    const sms =
      'Your A/c XX5543 is debited with Rs. 1,840.00 on 02-11-2026 towards BESCOM ELECTRICITY.';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(1840);
    expect(res.category).toBe('Bills & Recharge');
    expect(res.accountLast4).toBe('5543');
  });

  it('11. Parses Blinkit grocery UPI order (Blinkit -> Groceries)', () => {
    const sms =
      'Sent Rs.412.00 From HDFC Bank A/C *1234 To BLINKIT On 01-11-26 Ref 6319998877';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(412);
    expect(res.category).toBe('Groceries');
  });

  it('12. Parses IRCTC train booking (IRCTC -> Transport)', () => {
    const sms =
      'Your A/c XX2210 is debited with INR 1,560.00 on 01-11-2026 towards IRCTC RAIL TICKET.';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(true);
    expect(res.amount).toBe(1560);
    expect(res.category).toBe('Transport');
  });

  it('13. IGNORES OTP verification messages even if they mention amount and merchant', () => {
    const sms =
      '482910 is your OTP for txn of Rs. 2,499.00 at FLIPKART on HDFC Bank Card. Do not share this code.';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(false);
    expect(res.isIgnoredMessage).toBe(true);
  });

  it('14. IGNORES pure credit / salary / refund alerts', () => {
    const sms =
      'Your A/c XX1234 has been credited with Rs. 85,000.00 on 01-11-2026 by NEFT SALARY.';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(false);
    expect(res.isIgnoredMessage).toBe(true);
  });

  it('15. IGNORES balance-only alerts', () => {
    const sms =
      'Available Balance in your SBI A/c XX9876 as on 11-Nov-26 is Rs. 44,210.50.';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(false);
    expect(res.isIgnoredMessage).toBe(true);
  });

  it('16. IGNORES promotional loan/card offers', () => {
    const sms =
      'Congratulations! You are eligible for a pre-approved personal loan up to Rs. 5,00,000. Apply now!';
    const res = parseSingleSms(sms, [], '2026-11-11');
    expect(res.isValidDebit).toBe(false);
    expect(res.isIgnoredMessage).toBe(true);
  });

  it('17. Respects user-learned merchant category rules over defaults', () => {
    const learned = [{ merchantKey: 'freshmenu', category: 'Health', updatedAt: Date.now() }];
    const cat = categorizeMerchant('FreshMenu Kitchen', '', learned);
    expect(cat).toBe('Health');
  });

  it('18. Detects duplicate transactions within 5 minutes or matching manual entry', () => {
    const now = Date.now();
    const existing: Expense[] = [
      {
        id: 'e1',
        amount: 450,
        merchant: 'Swiggy',
        category: 'Food & Dining',
        date: '2026-11-11',
        timestamp: now,
        paymentMode: 'UPI',
        status: 'confirmed',
        source: 'sms',
      },
    ];

    expect(
      isDuplicateTransaction(
        { amount: 450, merchant: 'SWIGGY INDIA', date: '2026-11-11', timestamp: now + 120_000 },
        existing
      )
    ).toBe(true);

    expect(
      isDuplicateTransaction(
        { amount: 450, merchant: 'Swiggy', date: '2026-11-11', timestamp: now + 15 * 60_000 },
        existing
      )
    ).toBe(false);
  });
});

describe('Indian Currency, Budget & Month-End Forecast Calculations', () => {
  it('Formats Indian Rupee numbers in Lakhs/Thousands (₹1,25,000)', () => {
    expect(formatINR(125000)).toBe('₹1,25,000');
    expect(formatINR(4500)).toBe('₹4,500');
  });

  it('Calculates month-end forecast and % change vs last month accurately', () => {
    const currentMonth: Expense[] = [
      {
        id: '1',
        amount: 5000,
        merchant: 'BigBasket',
        category: 'Groceries',
        date: '2026-11-05',
        timestamp: 1,
        paymentMode: 'UPI',
        status: 'confirmed',
        source: 'manual',
      },
      {
        id: '2',
        amount: 5000,
        merchant: 'Amazon',
        category: 'Online Shopping',
        date: '2026-11-10',
        timestamp: 2,
        paymentMode: 'Card',
        status: 'confirmed',
        source: 'manual',
      },
    ];
    const lastMonth: Expense[] = [
      {
        id: '3',
        amount: 8000,
        merchant: 'DMart',
        category: 'Groceries',
        date: '2026-10-15',
        timestamp: 3,
        paymentMode: 'UPI',
        status: 'confirmed',
        source: 'manual',
      },
    ];

    // On Nov 10 (10 days elapsed out of 30 days in November), ₹10,000 spent -> ₹1,000/day -> ₹30,000 forecast
    const forecast = calculateMonthForecast(
      currentMonth,
      lastMonth,
      '2026-11',
      new Date(2026, 10, 10)
    );
    expect(forecast.totalSpentSoFar).toBe(10000);
    expect(forecast.daysElapsed).toBe(10);
    expect(forecast.totalDaysInMonth).toBe(30);
    expect(forecast.projectedMonthTotal).toBe(30000);
    expect(forecast.percentChangeVsLastMonth).toBe(25);
  });

  it('Flags budgets at 80% warning and 100% exceeded thresholds', () => {
    const budgets: Budget[] = [
      { id: 'b1', category: 'Food & Dining', monthlyLimit: 5000 },
      { id: 'b2', category: 'Groceries', monthlyLimit: 10000 },
    ];
    const expenses: Expense[] = [
      {
        id: 'e1',
        amount: 4200, // 84% of 5000 -> warning
        merchant: 'Swiggy',
        category: 'Food & Dining',
        date: '2026-11-11',
        timestamp: 1,
        paymentMode: 'UPI',
        status: 'confirmed',
        source: 'sms',
      },
      {
        id: 'e2',
        amount: 10500, // 105% of 10000 -> exceeded
        merchant: 'DMart',
        category: 'Groceries',
        date: '2026-11-11',
        timestamp: 2,
        paymentMode: 'UPI',
        status: 'confirmed',
        source: 'sms',
      },
    ];

    const status = evaluateBudgetStatus(budgets, expenses, 20000);
    const food = status.categories.find((c) => c.category === 'Food & Dining');
    const groc = status.categories.find((c) => c.category === 'Groceries');
    expect(food?.alertLevel).toBe('warning');
    expect(groc?.alertLevel).toBe('exceeded');
    expect(status.overall?.percentage).toBe(74);
    expect(status.overall?.alertLevel).toBe('normal');
  });
});
