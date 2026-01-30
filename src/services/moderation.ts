import { genAI } from '../config/gemini';
import { GEMINI_MODEL, AI_PROMPT_TEMPLATE } from '../config/constants';

interface ModerationResult {
  allowed: boolean;
  reason: string;
}

const MAX_TEXT_LENGTH = 4000;

export const moderationService = {
  async moderateText(text: string): Promise<ModerationResult> {
    // Валидация (без AI)
    if (!text) return { allowed: false, reason: 'Некорректный текст' };
    if (text.length > MAX_TEXT_LENGTH) return { allowed: false, reason: 'Текст слишком длинный' };

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        attempt++;

        // Запрос к AI
        const escaped = text.replace(/"/g, '\\"');
        const prompt = AI_PROMPT_TEMPLATE.replace('{TEXT}', escaped);

        const response = await genAI.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
        });

        // Парсинг ответа
        const raw = (response.text || '').replace(/```json\n?|\n?```/g, '').trim();

        let parsed: { allowed?: boolean; reason?: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          console.error(`❌ AI JSON parse error (try ${attempt}):`, raw);
          // Если json битый, вряд ли повтор поможет, но можно попробовать или выйти.
          // Обычно это не 503, так что fail open
          return { allowed: true, reason: 'Ошибка парсинга' };
        }

        if (typeof parsed.allowed !== 'boolean') {
          return { allowed: true, reason: 'Некорректный ответ' };
        }

        return { allowed: parsed.allowed, reason: parsed.reason || '' };

      } catch (error: any) {
        // Проверяем на перегрузку (503)
        const isOverloaded =
          error?.status === 503 ||
          error?.error?.code === 503 ||
          (error?.message && error.message.includes('overloaded'));

        if (isOverloaded && attempt < maxRetries) {
          console.warn(`⚠️ AI Overloaded. Retrying (${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 1000 * attempt)); // 1s, 2s...
          continue;
        }

        console.error(`❌ Модерация (fail):`, error?.message || error);
        // Fail open: разрешаем сообщение, чтобы не блокировать чат при сбое AI
        return { allowed: true, reason: 'Ошибка проверки' };
      }
    }

    return { allowed: true, reason: 'Ошибка проверки' };
  },
};
