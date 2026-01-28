import { Context, Bot } from 'grammy';
import { userBalanceService } from '../services/premium';
import { cryptoBotService } from '../services/cryptoBot';
import { getPostWord, formatPrice, MAX_POSTS_PER_PURCHASE } from '../config/constants';

// === Пакети ===
const STARS_PACKAGES = [1, 3, 5, 10, 20, 50, 100];
const CRYPTO_PACKAGES = [1, 3, 5, 10, 20, 50, 100];

const starsButtons = STARS_PACKAGES.map((n) => [
  { text: `${n} ${getPostWord(n)} — ${n} ⭐`, callback_data: `stars_${n}` },
]);

const cryptoButtons = CRYPTO_PACKAGES.map((n) => [
  { text: `${n} ${getPostWord(n)} — ${formatPrice(n)}`, callback_data: `crypto_${n}` },
]);

/** Витягує count з callback_data */
const parseCount = (data: string | undefined, prefix: string): number | null => {
  const match = data?.match(new RegExp(`^${prefix}_(\\d+)$`));
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isInteger(n) && n > 0 && n <= MAX_POSTS_PER_PURCHASE ? n : null;
};

export function registerPayments(bot: Bot) {
  // === Stars меню ===
  bot.callbackQuery('method_stars', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('⭐ Telegram Stars\n\nОбери пакет:', {
      reply_markup: { inline_keyboard: starsButtons },
    });
  });

  // === CryptoBot меню ===
  bot.callbackQuery('method_crypto', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('💎 CryptoBot (USDT/TON/BTC)\n\nОбери пакет:', {
      reply_markup: { inline_keyboard: cryptoButtons },
    });
  });

  // === Stars оплата ===
  bot.callbackQuery(/^stars_(\d+)$/, async (ctx: Context) => {
    try {
      await ctx.answerCallbackQuery();
      const userId = ctx.from?.id;
      if (!userId) return;

      const count = parseCount(ctx.callbackQuery?.data, 'stars');
      if (!count) {
        await ctx.reply(`❌ Некоректна кількість (1-${MAX_POSTS_PER_PURCHASE})`);
        return;
      }

      const word = getPostWord(count);
      await ctx.replyWithInvoice(
        `Пакет: ${count} ${word}`,
        'Платні пости у групу (з емодзі та модерацією)',
        JSON.stringify({ userId, count }),
        'XTR',
        [{ label: `${count} ${word}`, amount: count }]
      );
    } catch (error) {
      console.error('❌ Stars:', error);
      await ctx.reply('❌ Помилка. Спробуй ще раз');
    }
  });

  // === CryptoBot оплата ===
  bot.callbackQuery(/^crypto_(\d+)$/, async (ctx: Context) => {
    try {
      await ctx.answerCallbackQuery();
      const userId = ctx.from?.id;
      if (!userId) return;

      const count = parseCount(ctx.callbackQuery?.data, 'crypto');
      if (!count) {
        await ctx.reply(`❌ Некоректна кількість (1-${MAX_POSTS_PER_PURCHASE})`);
        return;
      }

      await ctx.reply('💎 Створюю інвойс...');
      const payUrl = await cryptoBotService.createInvoice(userId, count);

      if (payUrl) {
        const word = getPostWord(count);
        await ctx.reply(
          `💎 Інвойс створено!\n\n📦 ${count} ${word}\n💰 ${formatPrice(count)}\n\nНатисни для оплати:`,
          { reply_markup: { inline_keyboard: [[{ text: '💳 Оплатити', url: payUrl }]] } }
        );
      } else {
        await ctx.reply('❌ Помилка. Спробуй Stars');
      }
    } catch (error) {
      console.error('❌ CryptoBot:', error);
      await ctx.reply('❌ Помилка. Спробуй Stars');
    }
  });

  // === Pre-checkout ===
  bot.on('pre_checkout_query', async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  // === Успішна оплата ===
  bot.on('message:successful_payment', async (ctx: Context) => {
    try {
      const userId = ctx.from?.id;
      if (!userId) return;

      // Парсинг payload
      let payload: { userId?: number; count?: number } = {};
      try {
        payload = JSON.parse(ctx.message?.successful_payment?.invoice_payload || '{}');
      } catch {
        console.error('❌ Payload parse error');
        await ctx.reply("❌ Помилка. Зв'яжись з підтримкою");
        return;
      }

      const count = payload.count || 1;
      if (!Number.isInteger(count) || count <= 0 || count > MAX_POSTS_PER_PURCHASE) {
        console.error(`🚨 Invalid count: ${count} від ${userId}`);
        await ctx.reply("❌ Помилка валідації. Зв'яжись з підтримкою");
        return;
      }

      await userBalanceService.addPaidMessages(userId.toString(), count);

      const word = getPostWord(count);
      await ctx.reply(`✅ Оплата успішна!\n\nДодано ${count} ${word}!\n\n📊 Перевір: /start`);
      console.log(`✅ Payment: ${userId} +${count}`);
    } catch (error) {
      console.error('❌ Payment:', error);
      await ctx.reply("❌ Помилка. Зв'яжись з підтримкою");
    }
  });
}
