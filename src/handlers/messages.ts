import { Context } from 'grammy';
import emojiRegex from 'emoji-regex';
import { limiterService } from '../services/limiter';
import { userBalanceService } from '../services/premium';
import { moderationService } from '../services/moderation';
import {
  BOT_USERNAME,
  MAX_LENGTH_FREE,
  MAX_LENGTH_PAID,
  FREE_DAILY_LIMIT,
} from '../config/constants';

const emojiPattern = emojiRegex();
const botLink = `@${BOT_USERNAME}`;

type From = { username?: string; first_name?: string; id: number };

const getMention = (from: From): string =>
  from.username ? `@${from.username}` : from.first_name || `User ${from.id}`;

const deleteAndReply = async (ctx: Context, chatId: number, msgId: number, text: string) => {
  await ctx.api.deleteMessage(chatId, msgId);
  await ctx.reply(text, { disable_notification: true }).catch(() => { });
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
    // 1. Адміни без обмежень
    const member = await ctx.getChatMember(userId);
    if (['creator', 'administrator'].includes(member.status)) return;

    // 2. Ігноруємо ботів
    if (is_bot) return;

    // 3. Перевірка балансу
    const paidBalance = await userBalanceService.getPaidBalance(userId.toString());
    const isPaid = paidBalance > 0;
    const maxLen = isPaid ? MAX_LENGTH_PAID : MAX_LENGTH_FREE;

    // 4. Довжина
    if (text.length > maxLen) {
      const hint = isPaid ? '' : `\nХочеш більше? Іди в ${botLink}`;
      await deleteAndReply(ctx, chatId, msgId, `${mention}, занадто довге! 📏\nМакс: ${maxLen}${hint}`);
      console.log(`🚫 Довжина ${text.length}>${maxLen} від ${userId}`);
      return;
    }

    // 5. Емодзі (free only)
    if (!isPaid && emojiPattern.test(text)) {
      await deleteAndReply(ctx, chatId, msgId, `${mention}, емодзі заборонені 🚫\nХочеш? Іди в ${botLink}`);
      console.log(`🚫 Емодзі від ${userId}`);
      return;
    }

    // 6. Ліміт (free only)
    if (!isPaid && limiterService.getCount(userId.toString()) >= FREE_DAILY_LIMIT) {
      await deleteAndReply(ctx, chatId, msgId, `${mention}, ліміт вичерпано 📝\nХочеш більше? Іди в ${botLink}`);
      console.log(`🚫 Ліміт ${userId}`);
      return;
    }

    // 7. AI rate limit
    if (!limiterService.checkAiRateLimit(userId.toString())) {
      await deleteAndReply(ctx, chatId, msgId, `${mention}, зачекай хвилину 🕐`);
      console.log(`🚫 AI rate ${userId}`);
      return;
    }

    // 8. AI модерація
    const mod = await moderationService.moderateText(text);
    if (!mod.allowed) {
      await deleteAndReply(ctx, chatId, msgId, `${mention}, видалено 🚫\nПричина: ${mod.reason}`);
      console.log(`🚫 AI: ${mod.reason} від ${userId}`);
      return;
    }

    // 9. Списуємо баланс
    if (isPaid) {
      await userBalanceService.usePaidMessage(userId.toString());
      console.log(`✅ Платний від ${userId}`);
    } else {
      limiterService.increment(userId.toString());
      const cnt = limiterService.getCount(userId.toString());
      console.log(`✅ Free від ${userId} (${cnt}/${FREE_DAILY_LIMIT})`);
    }
  } catch (error) {
    console.error('❌ Помилка:', error);
  }
}
