import { GoogleGenAI } from '@google/genai';

if (!process.env.GEMINI_API_KEY) throw new Error('❌ GEMINI_API_KEY not found');

export const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

console.log('✅ Gemini AI initialized');
