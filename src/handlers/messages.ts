import { Context } from 'grammy';
import emojiRegex from 'emoji-regex';
import { limiterService } from '../services/limiter';
import { userBalanceService } from '../services/premium';
import { moderationService } from '../services/moderation';
import { sendWarning } from '../utils/warning';
import {
  BOT_USERNAME,
  MAX_LENGTH_FREE,
  MAX_LENGTH_PAID,
  FREE_DAILY_LIMIT,
  MESSAGES,
  LOG_CHANNEL_ID,
  MAX_LOG_MESSAGE_LENGTH,
  ADMIN_IDS,
} from '../config/constants';

// Хелпер: проверка наличия эмодзи (без stateful regex)
const hasEmoji = (text: string): boolean => emojiRegex().test(text);

// Хелпер: экранирование спецсимволов Markdown
const escapeMarkdown = (text: string) => text.replace(/([_*\[`])/g, '\\$1');

const botLink = escapeMarkdown(`@${BOT_USERNAME}`);

type From = { username?: string; first_name?: string; id: number };

const getMention = (from: From): string => {
  const name = escapeMarkdown(from.first_name || 'User');
  return `[${name}](tg://user?id=${from.id})`;
};

// Хелпер: является ли участник админом чата (при ошибке — нет)
const isChatAdmin = async (ctx: Context, chatId: number, userId: number): Promise<boolean> => {
  try {
    const member = await ctx.api.getChatMember(chatId, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch {
    return false;
  }
};

// Хелпер: удалить сообщение юзера и отправить предупреждение
const deleteAndWarn = async (ctx: Context, chatId: number, msgId: number, text: string) => {
  // КРИТИЧНО: Ждём удаления (с auto-retry если 429)
  try {
    await ctx.api.deleteMessage(chatId, msgId);
    console.log(`🗑️ Удалено: msgId=${msgId}, chat=${chatId}`);
  } catch (err) {
    console.error(`❌ НЕ УДАЛОСЬ удалить msgId=${msgId}, chat=${chatId}:`, err instanceof Error ? err.message : String(err));
  }

  // НЕ КРИТИЧНО: Предупреждение отправляем в фоне
  sendWarning(ctx, text).catch((err) => {
    console.error(`❌ sendWarning failed (chat=${chatId}, msgId=${msgId}):`, err instanceof Error ? err.message : String(err));
  });
};

export async function handleGroupMessage(ctx: Context) {
  if (!ctx.chat || ctx.chat.type === 'private') {
    // console.log(`⏭️ handleGroupMessage: пропуск (private/no chat)`);
    return;
  }
  if (!ctx.message?.text || !ctx.from) {
    console.log(`⏭️ handleGroupMessage: пропуск (нет текста или from), chat=${ctx.chat.id}`);
    return;
  }

  // Игнорируем лог-канал (бот там только отправляет, не обрабатывает)
  if (ctx.chat.id === LOG_CHANNEL_ID) return;

  const { id: userId, is_bot } = ctx.from;
  const { message_id: msgId } = ctx.message;
  const { id: chatId } = ctx.chat;
  const text = ctx.message.text;
  const mention = getMention(ctx.from);
  const userLog = `${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ''} [${userId}]`;

  console.log(`🔍 handleGroupMessage: ${userLog}, msgId=${msgId}, len=${text.length}`);

  try {
    // 1. Админы без ограничений (мгновенная проверка по массиву)
    if (ADMIN_IDS.includes(userId)) {
      console.log(`👑 Админ ${userLog}, пропускаем`);
      return;
    }

    // 2. Боты: пропускаем анонимных админов/посты от имени канала и ботов-админов чата,
    //    остальных (спам-боты, гостевые боты) удаляем молча
    if (is_bot) {
      if (ctx.message.sender_chat) {
        console.log(`🤖 Бот ${userLog} от имени чата ${ctx.message.sender_chat.id}, пропускаем`);
        return;
      }
      if (await isChatAdmin(ctx, chatId, userId)) {
        console.log(`🤖 Бот-админ ${userLog}, пропускаем`);
        return;
      }
      try {
        await ctx.api.deleteMessage(chatId, msgId);
        console.log(`🗑️ Удалено сообщение бота ${userLog}, msgId=${msgId}`);
      } catch (err) {
        console.error(`❌ НЕ УДАЛОСЬ удалить сообщение бота ${userLog}, msgId=${msgId}:`, err instanceof Error ? err.message : String(err));
      }
      return;
    }

    // 3. Проверка баланса
    const t1 = Date.now();
    const paidBalance = await userBalanceService.getPaidBalance(userId.toString());
    console.log(`⏱️ getPaidBalance: ${Date.now() - t1}ms`);
    const isPaid = paidBalance > 0;
    const maxLen = isPaid ? MAX_LENGTH_PAID : MAX_LENGTH_FREE;

    // 4. ЛИМИТ (free only) - проверяем ПЕРВЫМ, чтобы сообщение было корректным
    if (!isPaid && limiterService.getCount(userId.toString()) >= FREE_DAILY_LIMIT) {
      await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.LIMIT(botLink)}`);
      console.log(`🚫 Лимит ${userLog}`);
      return;
    }

    // 5. Длина
    if (text.length > maxLen) {
      const hint = isPaid ? '' : MESSAGES.WARNINGS.LENGTH_HINT_FREE(botLink);
      await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.LENGTH(maxLen, hint)}`);
      console.log(`🚫 Длина ${text.length}>${maxLen} от ${userLog}`);
      return;
    }

    // 6. Эмодзи (free only)
    if (!isPaid && hasEmoji(text)) {
      await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.EMOJI(botLink)}`);
      console.log(`🚫 Эмодзи от ${userLog}`);
      return;
    }

    // 7. Ссылки и контакты (только для бесплатных)
    const entities = ctx.message.entities || ctx.message.caption_entities || [];
    const hasLink = entities.some(e => ['url', 'text_link', 'mention', 'email'].includes(e.type));
    const hasTme = text.includes('t.me'); // Дополнительная проверка на t.me без http

    if (!isPaid && (hasLink || hasTme)) {
      await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.LINKS(botLink)}`);
      console.log(`🚫 Ссылка/Контакт от ${userLog}`);
      return;
    }

    // 7. & 8. AI проверки (только для бесплатных)
    if (!isPaid) {
      // 7. AI rate limit
      if (!limiterService.checkAiRateLimit(userId.toString())) {
        await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.AI_RATE}`);
        console.log(`🚫 AI rate ${userLog}`);
        return;
      }

      // 8. AI модерация
      const mod = await moderationService.moderateText(text);
      if (!mod.allowed) {
        // Причину от AI то же нужно экранировать
        const safeReason = escapeMarkdown(mod.reason);
        await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.AI_MODERATION(safeReason)}`);
        console.log(`🚫 AI: ${mod.reason} от ${userLog}`);

        // === LOGGING TO CHANNEL ===
        if (LOG_CHANNEL_ID) {
          try {
            // 1. Отправляем отчет
            await ctx.api.sendMessage(
              LOG_CHANNEL_ID,
              `⚠️ <b>Нарушение</b>\nUser: <a href="tg://user?id=${userId}">${escapeMarkdown(ctx.from.first_name)}</a> (@${ctx.from.username || 'no_user'})\nID: <code>${userId}</code>\nПричина: ${safeReason}\n\nТекст:\n${escapeMarkdown(text).substring(0, MAX_LOG_MESSAGE_LENGTH)}`,
              { parse_mode: 'HTML' }
            );

            // 2. Пересылка оригинального сообщения (если возможно/еще не удалено)
            // Примечание: мы вызвали deleteAndWarn выше, поэтому отправка текста безопаснее
          } catch (err) {
            console.error('❌ Ошибка логирования нарушения:', err instanceof Error ? err.message : err);
          }
        }

        return;
      }
    }

    // 9. Списываем баланс после успешной модерации
    if (isPaid) {
      const result = await userBalanceService.usePaidMessage(userId.toString(), {
        username: ctx.from.username,
        firstName: ctx.from.first_name,
      });

      console.log(`✅ Платный от ${userLog} (Left: ${result.remaining})`);

      // Оповещение об окончании баланса (в приват)
      if (result.success && result.remaining === 0) {
        try {
          await ctx.api.sendMessage(
            userId,
            MESSAGES.WARNINGS.PAID_EXPIRED
          );
        } catch (e) {
          // Юзер мог заблокировать бота или не стартовать его
          console.log(`⚠️ Не удалось отправить оповещение юзеру ${userLog}`);
        }
      }
    } else {
      limiterService.increment(userId.toString());
      const cnt = limiterService.getCount(userId.toString());
      console.log(`✅ Free от ${userLog} (${cnt}/${FREE_DAILY_LIMIT})`);
    }
  } catch (error) {
    console.error(`❌ Ошибка обработки сообщения (${userId}):`, error instanceof Error ? error.message : error);
  }
}
