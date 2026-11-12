# SpendWise — Indian Personal Expense & SMS Tracker (PWA)

SpendWise is a responsive, mobile-first Progressive Web Application (PWA) built for users in India. It captures Indian bank, UPI, and credit card SMS alerts, formats numbers in Indian Rupees (`₹1,25,000`), provides a month-end analytics dashboard, tracks category budgets, splits shared bills, manages a cash-in-hand wallet, and includes a money-linked To-Do list — all stored locally on your device in IndexedDB via Dexie.

---

## 1. Setup & Run Instructions

### Install Dependencies
```bash
npm install
```

### Start Development Server (Port 3000)
```bash
npm run dev
```
This runs the Express + Vite full-stack server (`server.ts`) on `http://localhost:3000`.

### Run Vitest Unit Tests (SMS Parser & Budget/Forecast Math)
```bash
npm test
```

### Production Build & Start
```bash
npm run build
npm start
```

---

## 2. How to Install the SpendWise PWA

1. **Android (Chrome / Edge / Brave)**
   - Open SpendWise in your mobile browser.
   - Tap the **Install App** button in the top-right of the **More** screen (or tap the browser menu &rarr; **Install app** / **Add to Home screen**).
   - Once installed, SpendWise launches in standalone full-screen mode and works 100% offline.

2. **iOS (Safari on iPhone / iPad)**
   - Open SpendWise in Safari.
   - Tap **Install on iOS** in the **More** screen to view guided instructions, or tap the Safari **Share** button and select **Add to Home Screen**.

3. **Desktop (Chrome / Edge)**
   - Click **Install App** in the **More** screen or the install icon in the browser address bar.

---

## 3. How to Use the Share-to-App Flow on Android

Because web browsers cannot automatically read your private SMS inbox in the background, SpendWise registers as a native **Android Web Share Target**:

1. Install SpendWise to your Android home screen as a PWA.
2. Open your SMS app (e.g., Google Messages) and **long-press** any bank debit or UPI alert message.
3. Tap the **Share** icon in your SMS app toolbar.
4. Select **SpendWise** from the Android Share Sheet.
5. SpendWise opens directly on `/share-target` with the amount, merchant, category, date, and payment mode pre-filled for 1-tap confirmation.

You can also copy multiple SMS messages at once and paste them into **Home &rarr; Paste Bank SMS**, or click **More &rarr; Load 5 Test Bank SMS** to preview the flow immediately.

---

## 4. How to Add a New Bank Pattern to the SMS Parser

All SMS parsing logic lives in [`src/utils/smsParser.ts`](src/utils/smsParser.ts).

To add a new Indian bank or credit card SMS format:

1. Open `src/utils/smsParser.ts` and locate the `BANK_SMS_PATTERNS` array.
2. Append a new `BankSmsPattern` object with a regular expression and an `extract` function:

```ts
{
  id: 'idfc-first-upi',
  bankName: 'IDFC FIRST Bank',
  description: 'IDFC FIRST Bank A/c debit alert',
  defaultPaymentMode: 'UPI',
  regex: /Your\s+IDFC\s+FIRST\s+Bank\s+A\/c\s+[xX*]*(\d{3,4})\s+is\s+debited\s+by\s+Rs\.?\s*([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+towards\s+([^.\n\r]+)/i,
  extract: (match) => ({
    accountLast4: match[1],
    amount: parseAmountString(match[2]),
    dateStr: match[3],
    merchant: cleanMerchantName(match[4]),
    paymentMode: 'UPI',
  }),
}
```

3. Add a unit test case for a sample SMS from that bank in [`src/utils/__tests__/smsParser.test.ts`](src/utils/__tests__/smsParser.test.ts) and run `npm test` to verify.
