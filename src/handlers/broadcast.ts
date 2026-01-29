import { Context, Bot } from 'grammy';
import { db } from '../config/firebase';

// === State Management ===
type AdminState =
    | { step: 'IDLE' }
    | { step: 'WAITING_FOR_CONTENT'; type: 'test' | 'all' }
    | { step: 'WAITING_FOR_CONFIRM'; type: 'test' | 'all'; messageId: number; chatId: number };

// Зберігаємо стан в пам'яті (adminId -> state)
const adminStates = new Map<number, AdminState>();

// === Helpers ===

import { ADMIN_IDS } from '../config/constants';

// ...

const isAdmin = async (ctx: Context): Promise<boolean> => {
    if (!ctx.from) return false;
    // 1. Перевірка по hardcoded ID (працює завжди, навіть в приват)
    if (ADMIN_IDS.includes(ctx.from.id)) return true;

    // 2. Перевірка по статусу в групі (тільки якщо повідомлення з групи)
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

// === Broadcast Logic ===

/**
 * Розсилає повідомлення користувачам з бази.
 * @param ctx Контекст для копіювання повідомлення
 * @param sourceChatId Де знаходиться оригінал повідомлення
 * @param sourceMsgId ID оригіналу повідомлення
 * @param testMode Якщо true, шле тільки автору
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
            await ctx.reply('✅ Тест успішний! Повідомлення надіслано в твій приват (без звуку).');
        } catch (error) {
            await ctx.reply(`❌ Помилка тесту: ${error}`);
        }
        return;
    }

    // ALL Post Mode
    await ctx.reply('🚀 Починаю розсилку... Це може зайняти час.');

    let success = 0;
    let fail = 0;
    let total = 0;

    try {
        // Отримуємо загальну кількість юзерів (ефективно, без скачування документів)
        const countSnapshot = await db.collection('users').count().get();
        total = countSnapshot.data().count;

        // Використовуємо stream для економії пам'яті (читає по одному, а не всі разом)
        const stream = db.collection('users').stream();

        for await (const doc of stream) {
            const userId = (doc as any).id; // stream returns internal objects that have .id
            try {
                // copyMessage повертає MessageId, який нам тут не треба, але ми чекаємо завершення
                await ctx.api.copyMessage(userId, sourceChatId, sourceMsgId);
                success++;
            } catch (e) {
                fail++;
                // console.warn(`Failed to send to ${userId}:`, e);
            }

            // Rate limit: 50ms (~20 msgs/sec) - безпечно для лімітів Telegram (30/sec)
            await new Promise(r => setTimeout(r, 50));
        }

        await ctx.reply(`✅ Розсилка завершена!\n\nОхоплення: ${total}\nУспішно: ${success}\nПомилок: ${fail} (блокували бота або видалились)`);

    } catch (error) {
        console.error('Broadcast error:', error);
        await ctx.reply('❌ Критична помилка під час розсилки.');
    }
}

// === Handlers ===

export function registerBroadcast(bot: Bot) {

    // Команди старту
    bot.command(['testPost', 'allPost'], async (ctx) => {
        if (!ctx.from) return;
        if (!(await isAdmin(ctx))) return; // Silent ignore for non-admins

        const type = ctx.message?.text?.includes('testPost') ? 'test' : 'all';
        const label = type === 'test' ? 'ТЕСТОВИЙ (тільки адміну)' : 'МАСОВИЙ (всім юзерам)';

        adminStates.set(ctx.from.id, { step: 'WAITING_FOR_CONTENT', type });

        await ctx.reply(
            `📝 Ти почав створення розсилки: **${label}**\n\n` +
            `Надішли сюди повідомлення (текст, фото, відео), яке хочеш відправити.\n` +
            `Або напиши /cancel для скасування.`,
            { parse_mode: 'Markdown' }
        );
    });

    // Скасування
    bot.command('cancel', async (ctx) => {
        if (!ctx.from) return;
        if (adminStates.get(ctx.from.id)?.step !== 'IDLE') {
            resetState(ctx.from.id);
            await ctx.reply('❌ Операція скасована.');
        }
    });

    // Обробка контенту і підтвердження (Message Interceptor)
    bot.on('message', async (ctx, next) => {
        const userId = ctx.from?.id;
        if (!userId) return next();

        const state = adminStates.get(userId);
        if (!state || state.step === 'IDLE') return next();

        // 1. Отримання контенту
        if (state.step === 'WAITING_FOR_CONTENT') {
            // Ігноруємо команди, якщо вони випадково потрапили (крім cancel, який обробиться своїм хендлером)
            if (ctx.message.text?.startsWith('/')) return next();

            adminStates.set(userId, {
                step: 'WAITING_FOR_CONFIRM',
                type: state.type,
                messageId: ctx.message.message_id,
                chatId: ctx.chat!.id
            });

            const target = state.type === 'test' ? 'Тільки ТОБІ (тихо)' : 'ВСІМ користувачам (зі звуком)';

            await ctx.api.copyMessage(ctx.chat!.id, ctx.chat!.id, ctx.message.message_id);
            await ctx.reply(
                `👆 Ось як це буде виглядати.\n\n` +
                `🎯 Куди: **${target}**\n` +
                `Відправляти? (напиши **так** або **ні**)`
            );
            return; // Stop propagation
        }

        // 2. Підтвердження
        if (state.step === 'WAITING_FOR_CONFIRM') {
            const text = ctx.message.text?.toLowerCase().trim();

            if (text === 'так' || text === '+') {
                const { type, chatId, messageId } = state;
                resetState(userId); // Reset before executing to avoid double click issues

                if (type === 'test') {
                    await performBroadcast(ctx, chatId, messageId, true);
                } else {
                    // Запускаємо у фоні для масової розсилки, щоб не блокити відповідь
                    performBroadcast(ctx, chatId, messageId, false).catch(e => {
                        console.error('Background broadcast error:', e);
                    });
                }
            } else if (text === 'ні' || text === '-') {
                resetState(userId);
                await ctx.reply('❌ Скасовано. Можеш почати заново через команду.');
            } else {
                await ctx.reply('Напиши "так" або "ні" (або /cancel).');
            }
            return; // Stop propagation
        }

        return next();
    });
}
