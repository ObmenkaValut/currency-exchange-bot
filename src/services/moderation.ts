import { genAI } from '../config/gemini';
import { GEMINI_MODEL } from '../config/constants';

interface ModerationResult {
  allowed: boolean;
  reason: string;
}

const MAX_TEXT_LENGTH = 4000;

const PROMPT_TEMPLATE = `Канал обміну валют/крипти. Пропускай ТІЛЬКИ якщо текст явно про купівлю/продаж/обмін валют (USD, EUR, UAH, BTC, USDT тощо). Блокуй все інше: спам, безглузді символи, нерелевантне.

"{TEXT}"

Поверни JSON. Причина - МАКСИМУМ 3 СЛОВА.
{"allowed":true/false,"reason":"макс 3 слова"}`;

export const moderationService = {
  async moderateText(text: string): Promise<ModerationResult> {
    try {
      // Валідація
      if (!text) {
        return { allowed: false, reason: 'Некоректний текст' };
      }
      if (text.length > MAX_TEXT_LENGTH) {
        return { allowed: false, reason: 'Текст занадто довгий' };
      }

      // Запит до AI
      const escaped = text.replace(/"/g, '\\"');
      const prompt = PROMPT_TEMPLATE.replace('{TEXT}', escaped);

      const response = await genAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });

      // Парсинг відповіді
      const raw = (response.text || '').replace(/```json\n?|\n?```/g, '').trim();

      let parsed: { allowed?: boolean; reason?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.error('❌ AI невалідний JSON:', raw);
        return { allowed: true, reason: 'Помилка парсингу' };
      }

      if (typeof parsed.allowed !== 'boolean') {
        console.error('❌ AI missing allowed:', parsed);
        return { allowed: true, reason: 'Некоректна відповідь' };
      }

      return { allowed: parsed.allowed, reason: parsed.reason || '' };
    } catch (error) {
      console.error('❌ Модерація:', error);
      return { allowed: true, reason: 'Помилка перевірки' };
    }
  },
};
