import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Support POST Web Share Target in addition to GET
  app.post('/share-target', (req: Request, res: Response) => {
    const text = String(req.body?.text || req.body?.title || req.body?.url || '');
    const params = new URLSearchParams();
    if (text) params.set('text', text);
    res.redirect(303, `/share-target?${params.toString()}`);
  });

  // 1. Parse unreadable SMS with Gemini (only called when user explicitly opts in)
  app.post('/api/gemini/parse-sms', async (req: Request, res: Response) => {
    try {
      const { rawText, categories } = req.body as { rawText?: string; categories?: string[] };
      if (!rawText || typeof rawText !== 'string') {
        res.status(400).json({ error: 'Missing SMS text to parse.' });
        return;
      }

      const ai = getGenAIClient();
      const catList = Array.isArray(categories) && categories.length > 0
        ? categories.join(', ')
        : 'Online Shopping, Food & Dining, Movies & Entertainment, Groceries, Transport, Bills & Recharge, Health, Others';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Extract Indian expense details from this bank/UPI SMS message. Determine if it is a debit/expense transaction (not an OTP, credit, or balance inquiry). Choose the best category from: [${catList}].\n\nSMS: "${rawText}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isDebit: { type: Type.BOOLEAN, description: 'True if money was spent/debited/paid.' },
              amount: { type: Type.NUMBER, description: 'Transaction amount in INR.' },
              merchant: { type: Type.STRING, description: 'Merchant or payee name.' },
              category: { type: Type.STRING, description: 'Suggested category from the list.' },
              dateIso: { type: Type.STRING, description: 'ISO date YYYY-MM-DD if found, else empty string.' },
              paymentMode: { type: Type.STRING, description: 'One of: UPI, Card, Cash, Net Banking' },
              accountLast4: { type: Type.STRING, description: 'Last 4 digits of account or card if present.' },
            },
            required: ['isDebit', 'amount', 'merchant', 'category', 'paymentMode'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to parse SMS with Gemini.';
      res.status(500).json({ error: message });
    }
  });

  // 2. Receipt OCR & Extraction with Gemini Vision
  app.post('/api/gemini/scan-receipt', async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType, categories } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        categories?: string[];
      };

      if (!imageBase64) {
        res.status(400).json({ error: 'Missing receipt image data.' });
        return;
      }

      const ai = getGenAIClient();
      const catList = Array.isArray(categories) && categories.length > 0
        ? categories.join(', ')
        : 'Online Shopping, Food & Dining, Movies & Entertainment, Groceries, Transport, Bills & Recharge, Health, Others';

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
            {
              text: `Read this Indian bill or receipt image. Extract the total amount in INR, merchant/store name, date (YYYY-MM-DD if visible), payment mode (UPI, Card, Cash, Net Banking), and best category from [${catList}].`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER, description: 'Total bill amount in INR.' },
              merchant: { type: Type.STRING, description: 'Store or merchant name.' },
              dateIso: { type: Type.STRING, description: 'Date on receipt in YYYY-MM-DD format if visible.' },
              category: { type: Type.STRING, description: 'Best matching category.' },
              paymentMode: { type: Type.STRING, description: 'UPI, Card, Cash, or Net Banking' },
              notes: { type: Type.STRING, description: 'Short summary of items purchased.' },
            },
            required: ['amount', 'merchant', 'category'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Receipt scan failed.';
      res.status(500).json({ error: message });
    }
  });

  // 3. Richer Monthly Summary & Saving Advice with Gemini
  app.post('/api/gemini/summary', async (req: Request, res: Response) => {
    try {
      const { monthLabel, statsSummary } = req.body as { monthLabel?: string; statsSummary?: string };
      if (!statsSummary) {
        res.status(400).json({ error: 'Missing summary context.' });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are SpendWise, a sharp financial advisor for an Indian household. Based on the aggregated monthly spending statistics below for ${monthLabel || 'this month'}, write a concise, practical analysis in Indian Rupees (₹) with Indian numbering (lakhs/thousands).\n\nData:\n${statsSummary}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING, description: '1-sentence punchy summary of the month.' },
              narrative: { type: Type.STRING, description: '2-3 sentences comparing categories, weekend vs weekday habits, and pace.' },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 concrete, actionable saving tips tailored to the numbers.',
              },
            },
            required: ['headline', 'narrative', 'tips'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not generate AI summary.';
      res.status(500).json({ error: message });
    }
  });

  // 4. "Ask SpendWise" Financial Q&A Chat
  app.post('/api/gemini/chat', async (req: Request, res: Response) => {
    try {
      const { question, contextData } = req.body as { question?: string; contextData?: string };
      if (!question) {
        res.status(400).json({ error: 'Missing question.' });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `User Question: "${question}"\n\nAggregated SpendWise Expense Context:\n${contextData || 'No transactions recorded yet.'}`,
        config: {
          systemInstruction:
            'You are SpendWise Assistant, a helpful personal finance assistant for a user in India. Always format currency in Indian Rupees (e.g. ₹1,25,000 or ₹4,500). Answer concisely and accurately using only the provided expense context. Keep responses under 120 words.',
        },
      });

      res.json({ answer: response.text ?? 'No response generated.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to answer question.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SpendWise server running on http://localhost:${PORT}`);
  });
}

startServer();
