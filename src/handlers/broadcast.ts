import { Context, Bot } from 'grammy';
import { db } from '../config/firebase';
import { ADMIN_IDS, MESSAGES } from '../config/constants';

// === Управление состоянием ===
type AdminState =
    | { step: 'IDLE' }
    | { step: 'WAITING_FOR_CONTENT'; type: 'test' | 'all' }
    | { step: 'WAITING_FOR_CONFIRM'; type: 'test' | 'all'; messageId: number; chatId: number };

// Сохраняем состояние в памяти (adminId -> state)
const adminStates = new Map<number, AdminState>();

// === Вспомогательные функции ===
const isAdmin = async (ctx: Context): Promise<boolean> => {
    if (!ctx.from) return false;
    // 1. Проверка по hardcoded ID (работает всегда, даже в привате)
    if (ADMIN_IDS.includes(ctx.from.id)) return true;

    // 2. Проверка по статусу в группе (только если сообщение из группы)
    if (ctx.chat && ctx.chat.type !== 'private') {
        try {
            const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
            return ['creator', 'administrator'].includes(member.status);
        } catch (e) {
            return false;
        }
    }

    return false;
};

const resetState = (userId: number) => adminStates.set(userId, { step: 'IDLE' });

// === Логика рассылки ===

/**
 * Рассылает сообщение пользователям из базы.
 * @param ctx Контекст для копирования сообщения
 * @param sourceChatId Где находится оригинал сообщения
 * @param sourceMsgId ID оригинала сообщения
 * @param testMode Если true, шлет только автору
 */
async function performBroadcast(
    ctx: Context,
    sourceChatId: number,
    sourceMsgId: number,
    testMode: boolean
) {
    const adminId = ctx.from!.id;

    if (testMode) {
        try {
            await ctx.api.copyMessage(adminId, sourceChatId, sourceMsgId, { disable_notification: true });
            await ctx.reply(MESSAGES.BROADCAST.TEST_SUCCESS);
        } catch (error) {
            await ctx.reply(MESSAGES.BROADCAST.TEST_FAIL(error));
        }
        return;
    }

    // Режим массовой рассылки
    await ctx.reply(MESSAGES.BROADCAST.STARTING);

    let success = 0;
    let fail = 0;
    let total = 0;

    try {
        // Получаем общее количество юзеров (эффективно, без скачивания документов)
        const countSnapshot = await db.collection('users').count().get();
        total = countSnapshot.data().count;

        // Используем stream для экономии памяти (читает по одному, а не все сразу)
        const stream = db.collection('users').stream();

        for await (const doc of stream) {
            const userId = (doc as any).id; // stream возвращает внутренние объекты с полем .id
            try {
                // copyMessage возвращает MessageId, который нам тут не нужен, но мы ждем завершения
                await ctx.api.copyMessage(userId, sourceChatId, sourceMsgId);
                success++;
            } catch (e) {
                fail++;
            }

            // Rate limit: 50ms (~20 msgs/sec) - безопасно для лимитов Telegram (30/sec)
            await new Promise(r => setTimeout(r, 50));
        }

        await ctx.reply(MESSAGES.BROADCAST.SUMMARY(total, success, fail));

    } catch (error) {
        console.error('Ошибка рассылки:', error);
        await ctx.reply(MESSAGES.BROADCAST.ERROR_CRITICAL);
    }
}

// === Обработчики ===

export function registerBroadcast(bot: Bot) {

    // Команды старта
    bot.command(['testpost', 'allpost'], async (ctx) => {
        if (!ctx.from) return;
        // Работаем только в ЛС
        if (ctx.chat?.type !== 'private') return;

        if (!(await isAdmin(ctx))) {
            await ctx.reply(MESSAGES.ERRORS.NOT_ADMIN);
            return;
        }

        const type = ctx.message?.text?.includes('testpost') ? 'test' : 'all';
        const label = type === 'test' ? 'ТЕСТ (только себе)' : 'МАССОВАЯ (всем юзерам)';

        adminStates.set(ctx.from.id, { step: 'WAITING_FOR_CONTENT', type });

        await ctx.reply(
            MESSAGES.BROADCAST.START_PREFIX(label) +
            MESSAGES.BROADCAST.START_SUFFIX,
            { parse_mode: 'Markdown' }
        );
    });

    // Отмена
    bot.command('cancel', async (ctx) => {
        if (!ctx.from) return;
        if (adminStates.get(ctx.from.id)?.step !== 'IDLE') {
            resetState(ctx.from.id);
            await ctx.reply(MESSAGES.BROADCAST.CANCELLED);
        }
    });

    // Обработка контента и подтверждение (Message Interceptor)
    bot.on('message', async (ctx, next) => {
        const userId = ctx.from?.id;
        if (!userId) return next();

        const state = adminStates.get(userId);
        if (!state || state.step === 'IDLE') return next();

        // 1. Получение контента
        if (state.step === 'WAITING_FOR_CONTENT') {
            // Игнорируем команды, если они случайно попали (кроме cancel, который обработается своим хендлером)
            if (ctx.message.text?.startsWith('/')) return next();

            adminStates.set(userId, {
                step: 'WAITING_FOR_CONFIRM',
                type: state.type,
                messageId: ctx.message.message_id,
                chatId: ctx.chat!.id
            });

            const target = state.type === 'test' ? MESSAGES.BROADCAST.TARGET_TEST : MESSAGES.BROADCAST.TARGET_ALL;

            await ctx.api.copyMessage(ctx.chat!.id, ctx.chat!.id, ctx.message.message_id);
            await ctx.reply(
                MESSAGES.BROADCAST.PREVIEW_HEADER +
                MESSAGES.BROADCAST.TARGET(target) +
                MESSAGES.BROADCAST.CONFIRM_PROMPT
            );
            return; // Остановка распространения
        }

        // 2. Подтверждение
        if (state.step === 'WAITING_FOR_CONFIRM') {
            const text = ctx.message.text?.toLowerCase().trim();

            if (text && MESSAGES.BROADCAST.BTN_YES.includes(text)) {
                const { type, chatId, messageId } = state;
                resetState(userId); // Reset before executing to avoid double click issues

                if (type === 'test') {
                    await performBroadcast(ctx, chatId, messageId, true);
                } else {
                    // Запускаем в фоне для массовой рассылки, чтобы не блочить ответ
                    performBroadcast(ctx, chatId, messageId, false).catch(e => {
                        console.error('Ошибка фоновой рассылки:', e);
                    });
                }
            } else if (text && MESSAGES.BROADCAST.BTN_NO.includes(text)) {
                resetState(userId);
                await ctx.reply(MESSAGES.BROADCAST.CANCELLED);
            } else {
                await ctx.reply(MESSAGES.BROADCAST.INVALID_INPUT);
            }
            return; // Остановка распространения
        }

        return next();
    });
}
