import { Context } from 'grammy';
import { WARNING_EDIT_WINDOW } from '../config/constants';

// Состояние последнего предупреждения для каждого чата
interface WarningState {
    messageId: number;
    sentAt: number;
}

const lastWarnings = new Map<number, WarningState>();
// Очередь операций для каждого чата, чтобы предупреждения не перегоняли друг друга
const warningQueues = new Map<number, Promise<void>>();

// === Периодическая очистка устаревших записей (каждые 10 минут) ===
const WARNING_TTL = 60 * 60 * 1000; // 1 час — после этого запись точно неактуальна
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    lastWarnings.forEach((state, chatId) => {
        if (now - state.sentAt > WARNING_TTL) {
            lastWarnings.delete(chatId);
            cleaned++;
        }
    });

    if (cleaned > 0 || lastWarnings.size > 0 || warningQueues.size > 0) {
        console.log(`🧹 Warning cleanup: удалено ${cleaned}, осталось lastWarnings=${lastWarnings.size}, queues=${warningQueues.size}`);
    }
}, 10 * 60 * 1000);

const formatUser = (ctx: Context) => {
    const from = ctx.from;
    if (!from) return 'Unknown';
    return `${from.first_name}${from.username ? ` (@${from.username})` : ''} [${from.id}]`;
};

export async function sendWarning(ctx: Context, text: string): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const currentPromise = warningQueues.get(chatId) || Promise.resolve();

    const nextPromise = currentPromise.then(async () => {
        const now = Date.now();
        const lastWarning = lastWarnings.get(chatId);

        // Если есть свежее предупреждение (< WARNING_EDIT_WINDOW) — редактируем его текст
        if (lastWarning && (now - lastWarning.sentAt) < WARNING_EDIT_WINDOW) {
            try {
                await ctx.api.editMessageText(chatId, lastWarning.messageId, text);
                lastWarning.sentAt = now;
                console.log(`📝 Warning edited: msgId=${lastWarning.messageId}, chat=${chatId}, user=${formatUser(ctx)}`);
                return;
            } catch (err) {
                console.warn(`⚠️ Edit warning не удался (msgId=${lastWarning.messageId}, chat=${chatId}):`, err instanceof Error ? err.message : err);
            }
        }

        // Удаляем старое предупреждение (fire-and-forget, не блокируя очередь)
        if (lastWarning) {
            ctx.api.deleteMessage(chatId, lastWarning.messageId).catch((err) => {
                console.warn(`⚠️ Не удалось удалить warning (msgId=${lastWarning.messageId}, chat=${chatId}):`, err instanceof Error ? err.message : err);
            });
        }

        // Отправляем новое предупреждение
        try {
            const msg = await ctx.reply(text);
            lastWarnings.set(chatId, { messageId: msg.message_id, sentAt: now });
            console.log(`📨 Warning sent: msgId=${msg.message_id}, chat=${chatId}, user=${formatUser(ctx)}`);
        } catch (error) {
            console.error(`❌ Ошибка отправки предупреждения (user=${formatUser(ctx)}):`, error instanceof Error ? error.message : error);
        }
    }).catch((err) => {
        console.error(`❌ Критическая ошибка в очереди (user=${formatUser(ctx)}):`, err instanceof Error ? err.message : err);
    }).finally(() => {
        if (warningQueues.get(chatId) === nextPromise) {
            warningQueues.delete(chatId);
        }
    });

    warningQueues.set(chatId, nextPromise);
    return nextPromise;
}


