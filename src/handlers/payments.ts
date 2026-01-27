import { Context } from 'grammy';
import { userBalanceService } from '../services/premium';
import { cryptoBotService } from '../services/cryptoBot';
import { userStates } from './commands';
import { getPostWord, formatPrice } from '../config/constants';

export function registerPayments(bot: any) {
  // Callback: Вибір Stars - показуємо пакети для Stars
  bot.callbackQuery('method_stars', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '⭐ Telegram Stars\n\n' +
      'Обери пакет:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '1 пост — 1 ⭐', callback_data: 'stars_1' }],
            [{ text: '3 пости — 3 ⭐', callback_data: 'stars_3' }],
            [{ text: '5 постів — 5 ⭐', callback_data: 'stars_5' }],
            [{ text: '10 постів — 10 ⭐', callback_data: 'stars_10' }],
            [{ text: '20 постів — 20 ⭐', callback_data: 'stars_20' }],
            [{ text: '50 постів — 50 ⭐', callback_data: 'stars_50' }],
            [{ text: '100 постів — 100 ⭐', callback_data: 'stars_100' }],
          ]
        }
      }
    );
  });

  // Callback: Вибір CryptoBot - показуємо пакети для CryptoBot
  bot.callbackQuery('method_crypto', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '💎 CryptoBot (USDT/TON/BTC)\n\n' +
      'Обери пакет:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '1 пост — $0.01', callback_data: 'crypto_1' }],
            [{ text: '3 пости — $0.03', callback_data: 'crypto_3' }],
            [{ text: '5 постів — $0.05', callback_data: 'crypto_5' }],
            [{ text: '10 постів — $0.10', callback_data: 'crypto_10' }],
            [{ text: '20 постів — $0.20', callback_data: 'crypto_20' }],
            [{ text: '50 постів — $0.50', callback_data: 'crypto_50' }],
            [{ text: '100 постів — $1.00', callback_data: 'crypto_100' }],
          ]
        }
      }
    );
  });

  // Callback: Оплата через Telegram Stars
  bot.callbackQuery(/^stars_(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (!userId) return;

    const match = ctx.callbackQuery?.data?.match(/^stars_(\d+)$/);
    const count = match ? parseInt(match[1], 10) : 1;

    // Встановлюємо стан
    userStates.set(userId, {
      step: 'awaiting_payment',
      packageCount: count
    });

    // Створюємо Telegram Stars інвойс
    try {
      const postWord = getPostWord(count);
      await ctx.replyWithInvoice(
        `Пакет: ${count} ${postWord}`,
        `Платні пости у групу (з емодзі та модерацією)`,
        JSON.stringify({ userId, count }),
        'XTR',
        [{ label: `${count} ${postWord}`, amount: count }]
      );
    } catch (error) {
      console.error('❌ Помилка Stars інвойсу:', error);
      await ctx.reply('❌ Помилка створення інвойсу. Спробуй ще раз');
      userStates.delete(userId);
    }
  });

  // Callback: Оплата через CryptoBot
  bot.callbackQuery(/^crypto_(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (!userId) return;

    const match = ctx.callbackQuery?.data?.match(/^crypto_(\d+)$/);
    const count = match ? parseInt(match[1], 10) : 1;

    await ctx.reply('💎 Створюю інвойс CryptoBot...');

    // Створюємо CryptoBot інвойс
    const payUrl = await cryptoBotService.createInvoice(userId, count);

    if (payUrl) {
      const postWord = getPostWord(count);
      await ctx.reply(
        `💎 Інвойс створено!\n\n` +
        `📦 Пакет: ${count} ${postWord}\n` +
        `💰 Сума: ${formatPrice(count)}\n\n` +
        `Натисни кнопку нижче для оплати:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💳 Оплатити через CryptoBot', url: payUrl }]
            ]
          }
        }
      );
    } else {
      await ctx.reply('❌ Помилка створення інвойсу. Спробуй ще раз або обери Telegram Stars');
    }
  });



  // Pre-checkout
  bot.on('pre_checkout_query', async (ctx: Context) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  // Успішна оплата
  bot.on('message:successful_payment', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Отримуємо кількість постів з payload
    const payload = JSON.parse(ctx.message?.successful_payment?.invoice_payload || '{}');
    const count = payload.count || 1;

    console.log(`💰 Оплата від ${userId} - додаємо +${count} платних постів`);

    // Додаємо платні пости до балансу
    await userBalanceService.addPaidMessages(userId.toString(), count);

    const postWord = getPostWord(count);
    await ctx.reply(
      `✅ Оплата успішна!\n\n` +
      `Додано ${count} ${postWord} до балансу!\n\n` +
      `📊 Перевір статистику /start`
    );

    console.log(`✅ Баланс ${userId}: +${count} постів`);
  });
}
