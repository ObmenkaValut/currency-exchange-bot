import { Context } from 'grammy';
import { WARNING_EDIT_WINDOW, WARNING_DELETE_DELAY } from '../config/constants';

// Состояние последнего предупреждения для каждого чата
interface WarningState {
    messageId: number;
    sentAt: number;
}

const lastWarnings = new Map<number, WarningState>();
// Очередь операций для каждого чата, чтобы предупреждения не перегоняли друг друга
const warningQueues = new Map<number, Promise<void>>();

/**
 * Отправляет предупреждение, используя editMessageText для свежих предупреждений.
 * Если предыдущее предупреждение устарело — отправляет новое, старое удаляет с задержкой.
 * Использует очередь для каждого чата, чтобы избежать гонки состояний.
 */
export async function sendWarning(ctx: Context, text: string): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // Добавляем операцию в очередь для этого чата
    const currentPromise = warningQueues.get(chatId) || Promise.resolve();

    const nextPromise = currentPromise.then(async () => {
        const now = Date.now();
        const lastWarning = lastWarnings.get(chatId);

        // Если есть свежее предупреждение (< WARNING_EDIT_WINDOW) — редактируем его текст
        if (lastWarning && (now - lastWarning.sentAt) < WARNING_EDIT_WINDOW) {
            try {
                await ctx.api.editMessageText(chatId, lastWarning.messageId, text);
                lastWarning.sentAt = now; // Продлеваем окно
                console.log(`📝 Warning edited: msgId=${lastWarning.messageId}, chat=${chatId}`);
                return;
            } catch (err) {
                console.warn(`⚠️ Edit warning не удался (msgId=${lastWarning.messageId}, chat=${chatId}):`, err instanceof Error ? err.message : err);
                // Отправим новое ниже
            }
        }

        // Удаляем старое предупреждение с задержкой (не блокируя очередь)
        if (lastWarning) {
            const oldMsgId = lastWarning.messageId;
            console.log(`🗑️ Запланировано удаление старого warning: msgId=${oldMsgId}, chat=${chatId}, через ${WARNING_DELETE_DELAY}мс`);
            setTimeout(() => {
                ctx.api.deleteMessage(chatId, oldMsgId).catch((err) => {
                    console.warn(`⚠️ Не удалось удалить старый warning (msgId=${oldMsgId}, chat=${chatId}):`, err instanceof Error ? err.message : err);
                });
            }, WARNING_DELETE_DELAY);
        }

        // Отправляем новое предупреждение
        try {
            const msg = await ctx.reply(text);
            lastWarnings.set(chatId, { messageId: msg.message_id, sentAt: now });
            console.log(`📨 Warning sent: msgId=${msg.message_id}, chat=${chatId}`);
        } catch (error) {
            console.error('❌ Ошибка отправки предупреждения:', error instanceof Error ? error.message : error);
        }
    }).catch((err) => {
        console.error('❌ Критическая ошибка в очереди предупреждений:', err instanceof Error ? err.message : err);
    });

    warningQueues.set(chatId, nextPromise);
    return nextPromise;
}
