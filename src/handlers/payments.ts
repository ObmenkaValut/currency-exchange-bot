import { Context, Bot } from 'grammy';
import { userBalanceService } from '../services/premium';
import { cryptoBotService } from '../services/cryptoBot';
import { getPostWord, formatPrice, MAX_POSTS_PER_PURCHASE, MESSAGES, PAYMENT_KEYBOARD, getPriceStars } from '../config/constants';

// === Типы ===
interface PaymentPayload {
  userId: number;
  count: number;
}

// === Пакеты ===
const STARS_PACKAGES = [1, 3, 5, 10, 20, 30, 50, 100];
const CRYPTO_PACKAGES = [1, 3, 5, 10, 20, 30, 50, 100];

/** Создает сетку кнопок для оплаты */
const createGrid = (packages: number[], prefix: string) => {
  const buttons = packages.map((n) => {
    const priceText = prefix === 'stars' ? `${getPriceStars(n)}⭐` : formatPrice(n);
    return {
      text: `${n} шт. — ${priceText}`,
      callback_data: `${prefix}_${n}`,
    };
  });

  // Сетка 2x4 + кнопка "Назад"
  const grid = [
    buttons.slice(0, 2),  // 1, 3
    buttons.slice(2, 4),  // 5, 10
    buttons.slice(4, 6),  // 20, 30
    buttons.slice(6, 8),  // 50, 100
    [{ text: MESSAGES.PAYMENT.BTN_BACK, callback_data: 'payment_back' }],
  ];

  return grid;
};

const starsButtons = createGrid(STARS_PACKAGES, 'stars');
const cryptoButtons = createGrid(CRYPTO_PACKAGES, 'crypto');

/** Извлекает количество постов из callback_data */
const parseCount = (data: string | undefined, prefix: string): number | null => {
  const match = data?.match(new RegExp(`^${prefix}_(\\d+)$`));
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isInteger(n) && n > 0 && n <= MAX_POSTS_PER_PURCHASE ? n : null;
};

/** Валидация количества постов */
const validateCount = (count: number | undefined, userId: number): count is number => {
  if (!count || !Number.isInteger(count) || count <= 0 || count > MAX_POSTS_PER_PURCHASE) {
    console.error(`🚨 Некорректное количество: ${count} от пользователя ${userId}`);
    return false;
  }
  return true;
};

export function registerPayments(bot: Bot) {
  // === Кнопка "Назад" ===
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
      if (!userId) {
        console.warn('⚠️ Stars callback без userId');
        return;
      }

      const count = parseCount(ctx.callbackQuery?.data, 'stars');
      if (!count) {
        await ctx.reply(`❌ Некорректное количество (1-${MAX_POSTS_PER_PURCHASE})`);
        return;
      }

      const word = getPostWord(count);
      const price = getPriceStars(count);

      console.log(`💫 Создание Stars инвойса: user=${userId}, count=${count}, price=${price}⭐`);

      await ctx.replyWithInvoice(
        MESSAGES.PAYMENT.INVOICE_TITLE(count, word),
        MESSAGES.PAYMENT.INVOICE_DESC,
        JSON.stringify({ userId, count } as PaymentPayload),
        'XTR',
        [{ label: `${count} ${word}`, amount: price }]
      );
    } catch (error) {
      console.error('❌ Ошибка создания Stars инвойса:', error instanceof Error ? error.message : error);
      await ctx.reply(MESSAGES.ERRORS.GENERIC);
    }
  });

  // === CryptoBot оплата ===
  bot.callbackQuery(/^crypto_(\d+)$/, async (ctx: Context) => {
    try {
      await ctx.answerCallbackQuery();
      const userId = ctx.from?.id;
      if (!userId) {
        console.warn('⚠️ Crypto callback без userId');
        return;
      }

      const count = parseCount(ctx.callbackQuery?.data, 'crypto');
      if (!count) {
        await ctx.reply(`❌ Некорректное количество (1-${MAX_POSTS_PER_PURCHASE})`);
        return;
      }

      await ctx.reply(MESSAGES.PAYMENT.CREATING_INVOICE);

      console.log(`💎 Создание Crypto инвойса: user=${userId}, count=${count}`);
      const payUrl = await cryptoBotService.createInvoice(userId, count);

      if (payUrl) {
        const word = getPostWord(count);
        await ctx.reply(
          MESSAGES.PAYMENT.CRYPTO_INVOICE_CAPTION(count, word, formatPrice(count)),
          { reply_markup: { inline_keyboard: [[{ text: MESSAGES.PAYMENT.BTN_PAY, url: payUrl }]] } }
        );
      } else {
        console.error(`❌ CryptoBot не вернул URL для user=${userId}`);
        await ctx.reply(MESSAGES.PAYMENT.FALLBACK_TRY_STARS);
      }
    } catch (error) {
      console.error('❌ Ошибка создания Crypto инвойса:', error instanceof Error ? error.message : error);
      await ctx.reply(MESSAGES.PAYMENT.FALLBACK_TRY_STARS);
    }
  });

  // === Pre-checkout проверка ===
  bot.on('pre_checkout_query', async (ctx) => {
    const userId = ctx.from?.id;
    const amount = ctx.preCheckoutQuery?.total_amount;
    console.log(`🔍 Pre-checkout: user=${userId}, amount=${amount}`);
    await ctx.answerPreCheckoutQuery(true);
  });

  // === Успешная оплата Stars ===
  bot.on('message:successful_payment', async (ctx: Context) => {
    const userId = ctx.from?.id;

    try {
      if (!userId) {
        console.error('❌ Платеж без userId');
        return;
      }

      // Парсинг payload
      const payloadStr = ctx.message?.successful_payment?.invoice_payload || '{}';
      let payload: Partial<PaymentPayload>;

      try {
        payload = JSON.parse(payloadStr);
      } catch (parseError) {
        console.error(`❌ Ошибка парсинга payload для user=${userId}:`, parseError);
        await ctx.reply(MESSAGES.ERRORS.CONTACT_SUPPORT);
        return;
      }

      const count = payload.count;
      if (!validateCount(count, userId)) {
        await ctx.reply(MESSAGES.ERRORS.CONTACT_SUPPORT);
        return;
      }

      // Начисление баланса
      await userBalanceService.addPaidMessages(
        userId.toString(),
        count,
        'stars',
        { username: ctx.from?.username, firstName: ctx.from?.first_name }
      );

      const word = getPostWord(count);
      await ctx.reply(MESSAGES.PAYMENT.SUCCESS(count, word));

      console.log(`✅ Платеж успешен: user=${userId}, count=${count}, source=stars`);
    } catch (error) {
      console.error(`❌ Ошибка обработки платежа для user=${userId}:`, error instanceof Error ? error.message : error);
      await ctx.reply(MESSAGES.ERRORS.CONTACT_SUPPORT);
    }
  });
}
