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

// === Периодическая очистка устаревших записей (каждые 10 минут) ===
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    // Удаляем записи о предупреждениях, которые старше WARNING_EDIT_WINDOW
    lastWarnings.forEach((state, chatId) => {
        if (now - state.sentAt > WARNING_EDIT_WINDOW) {
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
    if (!from) return 'Unknown Flow';
    return `${from.first_name}${from.username ? ` (@${from.username})` : ''} [${from.id}]`;
};

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
                console.log(`📝 Warning edited: msgId=${lastWarning.messageId}, chat=${chatId}, user=${formatUser(ctx)}`);
                return;
            } catch (err) {
                console.warn(`⚠️ Edit warning не удался (msgId=${lastWarning.messageId}, chat=${chatId}, user=${formatUser(ctx)}):`, err instanceof Error ? err.message : err);
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
            console.log(`📨 Warning sent: msgId=${msg.message_id}, chat=${chatId}, user=${formatUser(ctx)}`);
        } catch (error) {
            console.error(`❌ Ошибка отправки предупреждения (user=${formatUser(ctx)}):`, error instanceof Error ? error.message : error);
        }
    }).catch((err) => {
        console.error(`❌ Критическая ошибка в очереди предупреждений (user=${formatUser(ctx)}):`, err instanceof Error ? err.message : err);
    }).finally(() => {
        // Очищаем очередь после завершения, чтобы не хранить resolved promise
        if (warningQueues.get(chatId) === nextPromise) {
            warningQueues.delete(chatId);
        }
    });

    warningQueues.set(chatId, nextPromise);
    return nextPromise;
}

