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
} from '../config/constants';

const emojiPattern = emojiRegex();

// Helper: Escape Markdown special chars
const escapeMarkdown = (text: string) => text.replace(/([_*\[`])/g, '\\$1');

const botLink = escapeMarkdown(`@${BOT_USERNAME}`);

type From = { username?: string; first_name?: string; id: number };

const getMention = (from: From): string => {
  const name = escapeMarkdown(from.first_name || 'User');
  return `[${name}](tg://user?id=${from.id})`;
};

// Helper: удалить сообщение юзера и отправить "одиночное" предупреждение
const deleteAndWarn = async (ctx: Context, chatId: number, msgId: number, text: string) => {
  await ctx.api.deleteMessage(chatId, msgId).catch(() => { });
  await sendWarning(ctx, text);
};

export async function handleGroupMessage(ctx: Context) {
  if (!ctx.chat || ctx.chat.type === 'private') return;
  if (!ctx.message?.text || !ctx.from) return;

  const { id: userId, is_bot } = ctx.from;
  const { message_id: msgId } = ctx.message;
  const { id: chatId } = ctx.chat;
  const text = ctx.message.text;
  const mention = getMention(ctx.from);

  try {
    // 1. Админы без ограничений
    /* const member = await ctx.getChatMember(userId);
    if (['creator', 'administrator'].includes(member.status)) return; */

    // 2. Игнорируем ботов
    if (is_bot) return;

    // 3. Проверка баланса
    const paidBalance = await userBalanceService.getPaidBalance(userId.toString());
    const isPaid = paidBalance > 0;
    const maxLen = isPaid ? MAX_LENGTH_PAID : MAX_LENGTH_FREE;

    // 4. Длина
    // if (text.length > maxLen) {
    //   const hint = isPaid ? '' : MESSAGES.WARNINGS.LENGTH_HINT_FREE(botLink);
    //   await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.LENGTH(maxLen, hint)}`);
    //   console.log(`🚫 Длина ${text.length}>${maxLen} от ${userId}`);
    //   return;
    // }

    // 5. Эмодзи (free only)
    // if (!isPaid && emojiPattern.test(text)) {
    //   await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.EMOJI(botLink)}`);
    //   console.log(`🚫 Эмодзи от ${userId}`);
    //   return;
    // }

    // 5.1 Ссылки и контакты (free only)
    const entities = ctx.message.entities || ctx.message.caption_entities || [];
    const hasLink = entities.some(e => ['url', 'text_link', 'mention', 'email'].includes(e.type));
    const hasTme = text.includes('t.me'); // Доп. проверка на t.me без http

    // if (!isPaid && (hasLink || hasTme)) {
    //   await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.LINKS(botLink)}`);
    //   console.log(`🚫 Ссылка/Контакт от ${userId}`);
    //   return;
    // }

    // 6. Лимит (free only)
    // if (!isPaid && limiterService.getCount(userId.toString()) >= FREE_DAILY_LIMIT) {
    //   await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.LIMIT(botLink)}`);
    //   console.log(`🚫 Лимит ${userId}`);
    //   return;
    // }

    // 7. & 8. AI проверки (только для бесплатных)
    if (!isPaid) {
      // 7. AI rate limit
      // if (!limiterService.checkAiRateLimit(userId.toString())) {
      //   await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.AI_RATE}`);
      //   console.log(`🚫 AI rate ${userId}`);
      //   return;
      // }

      // 8. AI модерация
      const mod = await moderationService.moderateText(text);
      if (!mod.allowed) {
        // Reason с AI тоже лучше эскейпить на всякий случай
        const safeReason = escapeMarkdown(mod.reason);
        // await deleteAndWarn(ctx, chatId, msgId, `${mention}${MESSAGES.WARNINGS.AI_MODERATION(safeReason)}`);
        console.log(`🚫 AI: ${mod.reason} от ${userId}`);

        // === LOGGING TO CHANNEL ===
        if (LOG_CHANNEL_ID) {
          try {
            // 1. Send report
            await ctx.api.sendMessage(
              LOG_CHANNEL_ID,
              `⚠️ <b>Нарушение</b>\nUser: <a href="tg://user?id=${userId}">${escapeMarkdown(ctx.from.first_name)}</a> (@${ctx.from.username || 'no_user'})\nID: <code>${userId}</code>\nПричина: ${safeReason}\n\nТекст:\n${escapeMarkdown(text).substring(0, 3000)}`,
              { parse_mode: 'HTML' }
            );

            // 2. Forward original message (if possible/not deleted yet)
            // Note: we just deleted it properly, but we can try to copy or forward if delete was slow,
            // OR we forward BEFORE delete?
            // Actually we already called deleteAndWarn above.
            // Sending text copy (above) is safer since message is deleted.
          } catch (err) {
            console.error('❌ Failed to log violation:', err);
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

      console.log(`✅ Платный от ${userId} (Left: ${result.remaining})`);

      // Оповещение об окончании баланса (в приват)
      if (result.success && result.remaining === 0) {
        try {
          await ctx.api.sendMessage(
            userId,
            MESSAGES.WARNINGS.PAID_EXPIRED
          );
        } catch (e) {
          // Юзер мог заблокировать бота или не стартовать его
          console.log(`⚠️ Не удалось отправить оповещение юзеру ${userId}`);
        }
      }
    } else {
      limiterService.increment(userId.toString());
      const cnt = limiterService.getCount(userId.toString());
      console.log(`✅ Free от ${userId} (${cnt}/${FREE_DAILY_LIMIT})`);
    }
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}
