import { Context } from 'grammy';

// Сохраняем ID последнего предупреждения для каждого чата
// Используем Map даже для одного чата - это надежнее и не усложняет код
const lastWarningIds = new Map<number, number>();

/**
 * Отправляет предупреждение, удаляя предыдущее, чтобы избежать спама.
 */
export async function sendWarning(ctx: Context, text: string): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // 1. Удаляем старое предупреждение, если оно есть
    const oldMessageId = lastWarningIds.get(chatId);
    if (oldMessageId) {
        try {
            await ctx.api.deleteMessage(chatId, oldMessageId);
        } catch {
            // Игнорируем ошибку, если сообщение уже удалено или не найдено
        }
    }

    // 2. Отправляем новое и сохраняем его ID
    try {
        const msg = await ctx.reply(text);
        lastWarningIds.set(chatId, msg.message_id);
    } catch (error) {
        console.error('❌ Ошибка отправки предупреждения:', error instanceof Error ? error.message : error);
    }
}
