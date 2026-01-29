import { Context } from 'grammy';

// Зберігаємо ID останнього попередження для кожного чату
// Використовуємо Map навіть для одного чату - це надійніше і не ускладнює код
const lastWarningIds = new Map<number, number>();

/**
 * Відправляє попередження, видаляючи попереднє, щоб уникнути спаму.
 */
export async function sendWarning(ctx: Context, text: string): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // 1. Видаляємо старе попередження, якщо воно є
    const oldMessageId = lastWarningIds.get(chatId);
    if (oldMessageId) {
        try {
            await ctx.api.deleteMessage(chatId, oldMessageId);
        } catch (error) {
            // Ігноруємо помилку, якщо повідомлення вже видалено або не знайдено
            // console.warn('Could not delete old warning:', error);
        }
    }

    // 2. Відправляємо нове і зберігаємо його ID
    try {
        const msg = await ctx.reply(text);
        lastWarningIds.set(chatId, msg.message_id);
    } catch (error) {
        console.error('Failed to send warning:', error);
    }
}
