import { Context, Bot } from 'grammy';
import { userBalanceService } from '../services/premium';
import { cryptoBotService } from '../services/cryptoBot';
import { getPostWord, formatPrice, MAX_POSTS_PER_PURCHASE, MESSAGES, PAYMENT_KEYBOARD, getPriceStars } from '../config/constants';

// === Пакеты ===
const STARS_PACKAGES = [1, 3, 5, 10, 20, 30, 50, 100];
const CRYPTO_PACKAGES = [1, 3, 5, 10, 20, 30, 50, 100];

// Helper to create grid
const createGrid = (packages: number[], prefix: string) => {
  const buttons = packages.map((n) => {
    let priceText = '';
    if (prefix === 'stars') {
      priceText = `${getPriceStars(n)}⭐`;
    } else {
      priceText = formatPrice(n);
    }
    return {
      text: `${n} шт. — ${priceText}`,
      callback_data: `${prefix}_${n}`,
    };
  });

  const grid = [];
  // Row 1: 1, 3
  grid.push(buttons.slice(0, 2));
  // Row 2: 5, 10
  grid.push(buttons.slice(2, 4));
  // Row 3: 20, 30
  grid.push(buttons.slice(4, 6));
  // Row 4: 50, 100
  grid.push(buttons.slice(6, 8));

  // Row 5: Back
  grid.push([{ text: MESSAGES.PAYMENT.BTN_BACK, callback_data: 'payment_back' }]);

  return grid;
};

const starsButtons = createGrid(STARS_PACKAGES, 'stars');
const cryptoButtons = createGrid(CRYPTO_PACKAGES, 'crypto');

/** Извлекает count из callback_data */
const parseCount = (data: string | undefined, prefix: string): number | null => {
  const match = data?.match(new RegExp(`^${prefix}_(\\d+)$`));
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isInteger(n) && n > 0 && n <= MAX_POSTS_PER_PURCHASE ? n : null;
};

export function registerPayments(bot: Bot) {
  // === Back button ===
  bot.callbackQuery('payment_back', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(MESSAGES.PAYMENT.SELECT_METHOD, {
      reply_markup: PAYMENT_KEYBOARD,
    });
  });

  // === Stars меню ===
  bot.callbackQuery('method_stars', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(MESSAGES.PAYMENT.METHOD_STARS, {
      reply_markup: { inline_keyboard: starsButtons },
    });
  });

  // === CryptoBot меню ===
  bot.callbackQuery('method_crypto', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(MESSAGES.PAYMENT.METHOD_CRYPTO, {
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
        await ctx.reply(`❌ Некорректное количество (1-${MAX_POSTS_PER_PURCHASE})`);
        return;
      }

      const word = getPostWord(count);
      const price = getPriceStars(count);
      await ctx.replyWithInvoice(
        MESSAGES.PAYMENT.INVOICE_TITLE(count, word),
        MESSAGES.PAYMENT.INVOICE_DESC,
        JSON.stringify({ userId, count }),
        'XTR',
        [{ label: `${count} ${word}`, amount: price }]
      );
    } catch (error) {
      console.error('❌ Stars:', error);
      await ctx.reply(MESSAGES.ERRORS.GENERIC);
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
        await ctx.reply(`❌ Некорректное количество (1-${MAX_POSTS_PER_PURCHASE})`);
        return;
      }

      await ctx.reply(MESSAGES.PAYMENT.CREATING_INVOICE);
      const payUrl = await cryptoBotService.createInvoice(userId, count);

      if (payUrl) {
        const word = getPostWord(count);
        await ctx.reply(
          MESSAGES.PAYMENT.CRYPTO_INVOICE_CAPTION(count, word, formatPrice(count)),
          { reply_markup: { inline_keyboard: [[{ text: MESSAGES.PAYMENT.BTN_PAY, url: payUrl }]] } }
        );
      } else {
        await ctx.reply(MESSAGES.PAYMENT.FALLBACK_TRY_STARS);
      }
    } catch (error) {
      console.error('❌ CryptoBot:', error);
      await ctx.reply(MESSAGES.PAYMENT.FALLBACK_TRY_STARS);
    }
  });

  // === Pre-checkout ===
  bot.on('pre_checkout_query', async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  // === Успешная оплата ===
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
        await ctx.reply(MESSAGES.ERRORS.CONTACT_SUPPORT);
        return;
      }

      const count = payload.count || 1;
      if (!Number.isInteger(count) || count <= 0 || count > MAX_POSTS_PER_PURCHASE) {
        console.error(`🚨 Invalid count: ${count} от ${userId}`);
        await ctx.reply("❌ Ошибка валидации. Свяжись с поддержкой");
        return;
      }

      await userBalanceService.addPaidMessages(
        userId.toString(),
        count,
        'stars',
        { username: ctx.from?.username, firstName: ctx.from?.first_name }
      );

      const word = getPostWord(count);
      await ctx.reply(MESSAGES.PAYMENT.SUCCESS(count, word));
      console.log(`✅ Payment: ${userId} +${count}`);
    } catch (error) {
      console.error('❌ Payment:', error);
      await ctx.reply(MESSAGES.ERRORS.CONTACT_SUPPORT);
    }
  });
}
