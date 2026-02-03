import { GoogleGenAI } from '@google/genai';

if (!process.env.GEMINI_API_KEY) {
    throw new Error('❌ Отсутствует переменная окружения: GEMINI_API_KEY');
}

export const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

console.log('✅ Gemini AI инициализирован');
