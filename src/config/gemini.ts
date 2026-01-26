import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error('❌ GEMINI_API_KEY не знайдено в .env');
}

export const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

console.log('✅ Gemini AI ініціалізовано');
