import { genAI } from '../config/gemini';
import { GEMINI_MODEL, AI_PROMPT_TEMPLATE } from '../config/constants';

interface ModerationResult {
  allowed: boolean;
  reason: string;
}

interface AIModerationResponse {
  allowed?: boolean;
  reason?: string;
}

// === Константы ===
const MAX_TEXT_LENGTH = 4000; // Максимальная длина текста для модерации
const MAX_RETRIES = 3; // Количество попыток при ошибках API
const RETRY_BASE_DELAY_MS = 1000; // Базовая задержка для retry (1s, 2s, 3s...)

export const moderationService = {
  async moderateText(text: string): Promise<ModerationResult> {
    // Валидация (без AI)
    if (!text) return { allowed: false, reason: 'Некорректный текст' };
    if (text.length > MAX_TEXT_LENGTH) return { allowed: false, reason: 'Текст слишком длинный' };

    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        attempt++;

        // Подготовка запроса к AI
        const escaped = text.replace(/"/g, '\\"');
        const prompt = AI_PROMPT_TEMPLATE.replace('{TEXT}', escaped);

        const response = await genAI.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
        });

        // Парсинг ответа
        const raw = (response.text || '').replace(/```json\n?|\n?```/g, '').trim();

        let parsed: AIModerationResponse;
        try {
          parsed = JSON.parse(raw);
        } catch {
          console.error(`❌ Ошибка парсинга JSON от AI (попытка ${attempt}):`, raw);
          // Fail open: разрешаем сообщение при ошибке парсинга
          return { allowed: true, reason: 'Ошибка парсинга' };
        }

        // Проверка корректности ответа
        if (typeof parsed.allowed !== 'boolean') {
          console.error(`❌ Некорректный формат ответа от AI:`, parsed);
          return { allowed: true, reason: 'Некорректный ответ' };
        }

        return { allowed: parsed.allowed, reason: parsed.reason || '' };

      } catch (error: any) {
        // Проверка на перегрузку API (503)
        const isOverloaded =
          error?.status === 503 ||
          error?.error?.code === 503 ||
          (error?.message && error.message.includes('overloaded'));

        if (isOverloaded && attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * attempt;
          console.warn(`⚠️ AI перегружен. Повторная попытка (${attempt}/${MAX_RETRIES}) через ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        console.error(`❌ Ошибка модерации:`, error?.message || error);
        // Fail open: разрешаем сообщение при сбое AI, чтобы не блокировать чат
        return { allowed: true, reason: 'Ошибка проверки' };
      }
    }

    // Если все попытки исчерпаны
    console.error(`❌ Все попытки модерации исчерпаны (${MAX_RETRIES})`);
    return { allowed: true, reason: 'Ошибка проверки' };
  },
};
