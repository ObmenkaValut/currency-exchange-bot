import { GoogleGenAI } from '@google/genai';

if (!process.env.GEMINI_API_KEY) {
    throw new Error('❌ Отсутствует переменная окружения: GEMINI_API_KEY');
}

let genAI: GoogleGenAI;
try {
    genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('✅ Gemini AI инициализирован');
} catch (error) {
    console.error('❌ Ошибка инициализации Gemini AI:', error instanceof Error ? error.message : error);
    throw new Error('Не удалось инициализировать Gemini AI');
}

export { genAI };
