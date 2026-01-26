import { genAI } from '../config/gemini';

interface ModerationResult {
  allowed: boolean;
  reason: string;
}

export const moderationService = {
  async moderateText(text: string): Promise<ModerationResult> {
    try {
      const prompt = `Ти модеруєш український канал обміну валют та криптовалют.

ДОЗВОЛЕНО (пропускай):
- Оголошення про обмін USD, EUR, UAH, PLN, крипти (BTC, USDT тощо)
- Навіть якщо КАПС, багато смайлів 💰💵💸, крикливий текст
- Курси валют, контакти (@username, номери телефонів)
- Локації обміну (Київ, Львів тощо)

ЗАБОРОНЕНО (блокуй):
- Порнографія, 18+ контент
- Наркотики, зброя
- Казино, азартні ігри, скам
- Продаж не пов'язаних товарів (гаражі, авто, вейпи, техніка)
- Спам не про обмін валют

Текст для перевірки:
"${text}"

Відповідь ТІЛЬКИ JSON без markdown:
{"allowed": true/false, "reason": "коротка причина українською"}`;

      const response = await genAI.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
      });

      const responseText = response.text || '';

      // Видаляємо markdown блоки якщо є
      const cleanResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanResponse);

      return {
        allowed: parsed.allowed,
        reason: parsed.reason || '',
      };
    } catch (error) {
      console.error('❌ Помилка модерації:', error);
      // У разі помилки - дозволяємо (щоб не блокувати всіх)
      return { allowed: true, reason: 'Помилка перевірки' };
    }
  },
};
