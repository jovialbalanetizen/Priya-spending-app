import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../db/database';
import type { Expense } from '../types/models';
import { formatINR } from './formatters';

interface BackupPayload {
  version: number;
  exportedAt: string;
  expenses: unknown[];
  categories: unknown[];
  merchantRules: unknown[];
  budgets: unknown[];
  recurringExpenses: unknown[];
  sharedExpenses: unknown[];
  cashTransactions: unknown[];
  savingsGoals: unknown[];
  tasks: unknown[];
  settings: unknown[];
}

interface EncryptedEnvelope {
  app: 'SpendWise';
  algorithm: 'AES-GCM-256';
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 120000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Creates a password-protected AES-GCM encrypted backup file of all IndexedDB tables.
 */
export async function exportEncryptedBackup(password: string): Promise<void> {
  const payload: BackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    expenses: await db.expenses.toArray(),
    categories: await db.categories.toArray(),
    merchantRules: await db.merchantRules.toArray(),
    budgets: await db.budgets.toArray(),
    recurringExpenses: await db.recurringExpenses.toArray(),
    sharedExpenses: await db.sharedExpenses.toArray(),
    cashTransactions: await db.cashTransactions.toArray(),
    savingsGoals: await db.savingsGoals.toArray(),
    tasks: await db.tasks.toArray(),
    settings: await db.settings.toArray(),
  };

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    encoded
  );

  const envelope: EncryptedEnvelope = {
    app: 'SpendWise',
    algorithm: 'AES-GCM-256',
    saltBase64: uint8ToBase64(salt),
    ivBase64: uint8ToBase64(iv),
    ciphertextBase64: uint8ToBase64(new Uint8Array(encryptedBuf)),
  };

  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spendwise-encrypted-backup-${new Date().toISOString().slice(0, 10)}.swbak.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Decrypts and restores a password-protected SpendWise backup file.
 */
export async function restoreEncryptedBackup(fileText: string, password: string): Promise<number> {
  const envelope = JSON.parse(fileText) as EncryptedEnvelope;
  if (envelope.app !== 'SpendWise' || !envelope.ciphertextBase64) {
    throw new Error('Invalid SpendWise backup file format.');
  }

  const salt = base64ToUint8(envelope.saltBase64);
  const iv = base64ToUint8(envelope.ivBase64);
  const ciphertext = base64ToUint8(envelope.ciphertextBase64);
  const key = await deriveKey(password, salt);

  let decryptedBuf: ArrayBuffer;
  try {
    decryptedBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
  } catch {
    throw new Error('Incorrect password or corrupted backup file.');
  }

  const jsonStr = new TextDecoder().decode(decryptedBuf);
  const payload = JSON.parse(jsonStr) as BackupPayload;

  await db.transaction(
    'rw',
    [
      db.expenses,
      db.categories,
      db.merchantRules,
      db.budgets,
      db.recurringExpenses,
      db.sharedExpenses,
      db.cashTransactions,
      db.savingsGoals,
      db.tasks,
      db.settings,
    ],
    async () => {
      if (Array.isArray(payload.categories) && payload.categories.length) {
        await db.categories.bulkPut(payload.categories as never[]);
      }
      if (Array.isArray(payload.expenses)) {
        await db.expenses.bulkPut(payload.expenses as never[]);
      }
      if (Array.isArray(payload.merchantRules)) {
        await db.merchantRules.bulkPut(payload.merchantRules as never[]);
      }
      if (Array.isArray(payload.budgets)) {
        await db.budgets.bulkPut(payload.budgets as never[]);
      }
      if (Array.isArray(payload.recurringExpenses)) {
        await db.recurringExpenses.bulkPut(payload.recurringExpenses as never[]);
      }
      if (Array.isArray(payload.sharedExpenses)) {
        await db.sharedExpenses.bulkPut(payload.sharedExpenses as never[]);
      }
      if (Array.isArray(payload.cashTransactions)) {
        await db.cashTransactions.bulkPut(payload.cashTransactions as never[]);
      }
      if (Array.isArray(payload.savingsGoals)) {
        await db.savingsGoals.bulkPut(payload.savingsGoals as never[]);
      }
      if (Array.isArray(payload.tasks)) {
        await db.tasks.bulkPut(payload.tasks as never[]);
      }
    }
  );

  return Array.isArray(payload.expenses) ? payload.expenses.length : 0;
}

/**
 * Exports expenses to CSV.
 */
export function exportExpensesCSV(expenses: Expense[], label = 'all'): void {
  const rows = expenses.map((e) => ({
    Date: e.date,
    Merchant: e.merchant,
    Category: e.category,
    Amount_INR: e.amount,
    Payment_Mode: e.paymentMode,
    Account_Last4: e.accountLast4 || '',
    Status: e.status,
    Notes: e.notes || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spendwise-expenses-${label}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exports expenses and category summary to an Excel (.xlsx) workbook.
 */
export function exportExpensesXLSX(expenses: Expense[], label = 'all'): void {
  const confirmed = expenses.filter((e) => e.status === 'confirmed');
  const byCat = new Map<string, number>();
  for (const e of confirmed) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  }

  const summaryRows = [...byCat.entries()].map(([cat, total]) => ({
    Category: cat,
    Total_INR: total,
    Formatted: formatINR(total),
  }));

  const txRows = expenses.map((e) => ({
    Date: e.date,
    Merchant: e.merchant,
    Category: e.category,
    Amount_INR: e.amount,
    Payment_Mode: e.paymentMode,
    Account_Last4: e.accountLast4 || '',
    Status: e.status,
    Notes: e.notes || '',
  }));

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  const wsTx = XLSX.utils.json_to_sheet(txRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Category Summary');
  XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions');
  XLSX.writeFile(wb, `spendwise-report-${label}.xlsx`);
}

/**
 * Generates a PDF report with visual category bars and full transaction ledger.
 */
export function exportExpensesPDF(expenses: Expense[], periodTitle: string): void {
  const confirmed = expenses.filter((e) => e.status === 'confirmed');
  const total = confirmed.reduce((s, e) => s + e.amount, 0);

  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(`SpendWise Expense Report — ${periodTitle}`, 14, 20);

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Total Confirmed Spend: Rs. ${total.toLocaleString('en-IN')} (${confirmed.length} transactions)`,
    14,
    28
  );

  // Category chart bars drawn directly onto the PDF canvas
  const byCat = new Map<string, number>();
  for (const e of confirmed) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  }
  const sortedCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

  let yPos = 38;
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Category Breakdown Chart', 14, yPos);
  yPos += 6;

  const maxVal = sortedCats[0]?.[1] || 1;
  for (const [cat, amt] of sortedCats.slice(0, 8)) {
    const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
    const barWidth = Math.max(4, Math.round((amt / maxVal) * 95));

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(`${cat}`, 14, yPos + 4);

    doc.setFillColor(16, 185, 129);
    doc.roundedRect(68, yPos, barWidth, 5, 1, 1, 'F');

    doc.text(`Rs. ${amt.toLocaleString('en-IN')} (${pct}%)`, 72 + barWidth, yPos + 4);
    yPos += 8;
  }

  autoTable(doc, {
    startY: yPos + 6,
    head: [['Date', 'Merchant', 'Category', 'Mode', 'Amount (INR)']],
    body: confirmed
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => [
        e.date,
        e.merchant,
        e.category,
        e.paymentMode,
        `Rs. ${e.amount.toLocaleString('en-IN')}`,
      ]),
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [15, 23, 42] },
  });

  doc.save(`spendwise-report-${periodTitle.toLowerCase().replace(/\s+/g, '-')}.pdf`);
}
