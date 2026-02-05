import { Context } from 'grammy';

// Сохраняем ID последнего предупреждения для каждого чата
const lastWarningIds = new Map<number, number>();
// Очередь операций для каждого чата, чтобы предупреждения не перегоняли друг друга
const warningQueues = new Map<number, Promise<void>>();

/**
 * Отправляет предупреждение, удаляя предыдущее.
 * Использует очередь для каждого чата, чтобы избежать гонки состояний.
 */
export async function sendWarning(ctx: Context, text: string): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // Добавляем операцию в очередь для этого чата
    const currentPromise = warningQueues.get(chatId) || Promise.resolve();

    const nextPromise = currentPromise.then(async () => {
        // 1. Удаляем старое предупреждение
        const oldMessageId = lastWarningIds.get(chatId);
        if (oldMessageId) {
            try {
                await ctx.api.deleteMessage(chatId, oldMessageId);
            } catch {
                // Игнорируем ошибку (уже удалено или не найдено)
            }
        }

        // 2. Отправляем новое и сохраняем ID
        try {
            const msg = await ctx.reply(text);
            lastWarningIds.set(chatId, msg.message_id);
        } catch (error) {
            console.error('❌ Ошибка отправки предупреждения:', error instanceof Error ? error.message : error);
        }
    }).catch(() => {
        // Ловим ошибки всей цепочки, чтобы очередь не сломалась
    });

    warningQueues.set(chatId, nextPromise);

    // Возвращаем промис, но вызывающий код в messages.ts все равно его не ждет (и это ок)
    return nextPromise;
}
