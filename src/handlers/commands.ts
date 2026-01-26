import { Context } from 'grammy';
import { limiterService } from '../services/limiter';

// Зберігаємо стан користувача
const userStates = new Map<number, {
  step: 'awaiting_payment' | 'awaiting_text';
  paid?: boolean;
  packageCount?: number;
}>();

export function registerCommands(bot: any) {
  // /start - привітання
  bot.command('start', async (ctx: Context) => {
    await ctx.reply(
      `👋 Привіт!\n\n` +
      `Я бот для публікації оголошень у групі.\n\n` +
      `📝 Як працює:\n` +
      `• Кожен може писати 3 повідомлення/день безкоштовно\n` +
      `• Хочеш більше? Використай /buy\n` +
      `• Емодзі заборонені (або купи через /buy)\n\n` +
      `Команди: /help /mystats /buy`
    );
  });

  // /help - пояснення
  bot.command('help', async (ctx: Context) => {
    await ctx.reply(
      `ℹ️ Довідка\n\n` +
      `🎯 Що я роблю:\n` +
      `Модерую групу і даю можливість публікувати платні пости\n\n` +
      `📋 Правила групи:\n` +
      `• 3 безкоштовні пості/день на людину\n` +
      `• Емодзі заборонені в безкоштовних постах\n` +
      `• Тільки теми про обмін валют/крипти\n\n` +
      `💰 Платні пости:\n` +
      `• /buy - купити платний пост (1 ⭐ = 1 пост)\n` +
      `• Емодзі дозволені\n` +
      `• Без ліміту\n` +
      `• Модерація через AI\n\n` +
      `📊 /mystats - твоя статистика`
    );
  });

  // /mystats - статистика
  bot.command('mystats', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const freeCount = limiterService.getCount(userId.toString());

    // Імпортуємо userBalanceService
    const { userBalanceService } = await import('../services/premium');
    const paidBalance = await userBalanceService.getPaidBalance(userId.toString());

    const status = `📊 Твоя статистика:\n\n` +
      `📝 Безкоштовних постів сьогодні: ${freeCount}/3\n` +
      `💎 Платних постів: ${paidBalance}\n` +
      `📅 Безкоштовні оновляться завтра\n\n` +
      `💡 Хочеш більше? Використай /buy (1 ⭐ = 1 пост)`;

    // Якщо є платні пости - показуємо кнопку
    if (paidBalance > 0) {
      await ctx.reply(status, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✍️ Написати пост', callback_data: 'write_post' }]
          ]
        }
      });
    } else {
      await ctx.reply(status);
    }
  });

  // /buy - купити платний пост
  bot.command('buy', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Показуємо меню пакетів
    await ctx.reply(
      '💰 Обери пакет платних постів:\n\n' +
      '1 ⭐ = 1 пост',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '1 пост — 1 ⭐', callback_data: 'buy_1' }],
            [{ text: '3 пости — 3 ⭐', callback_data: 'buy_3' }],
            [{ text: '5 постів — 5 ⭐', callback_data: 'buy_5' }],
            [{ text: '10 постів — 10 ⭐', callback_data: 'buy_10' }],
            [{ text: '20 постів — 20 ⭐', callback_data: 'buy_20' }],
            [{ text: '50 постів — 50 ⭐', callback_data: 'buy_50' }],
            [{ text: '100 постів — 100 ⭐', callback_data: 'buy_100' }],
          ]
        }
      }
    );
  });

  // /reset (для тестів)
  bot.command('reset', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    limiterService.reset(userId.toString());
    userStates.delete(userId);
    await ctx.reply('✅ Ліміт та стан скинуто!');
  });
}

// Експортуємо для використання в payments
export { userStates };
