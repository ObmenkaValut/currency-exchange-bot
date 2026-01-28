import { Context, Bot } from 'grammy';
import { limiterService } from '../services/limiter';
import { userBalanceService } from '../services/premium';
import { FREE_DAILY_LIMIT } from '../config/constants';

const mainKeyboard = {
  keyboard: [
    [{ text: '💰 Купити пост' }, { text: '📊 Статистика' }],
    [{ text: 'ℹ️ Допомога' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

const paymentKeyboard = {
  inline_keyboard: [
    [{ text: '⭐ Telegram Stars', callback_data: 'method_stars' }],
    [{ text: '💎 CryptoBot (USDT/TON/BTC)', callback_data: 'method_crypto' }],
  ],
};

export function registerCommands(bot: Bot) {
  // /start
  bot.command('start', async (ctx: Context) => {
    try {
      await ctx.reply(
        '👋 Привіт!\n\n' +
        'Я бот для покупки постів у групі обміну валют.\n\n' +
        '💰 Купуй пости через кнопку нижче\n' +
        '📊 Переглядай свій баланс\n\n' +
        '👇 Використовуй кнопки:',
        { reply_markup: mainKeyboard }
      );
    } catch (error) {
      console.error('❌ /start:', error);
      await ctx.reply('❌ Помилка. Спробуй знову.');
    }
  });

  // Допомога
  bot.hears('ℹ️ Допомога', async (ctx: Context) => {
    try {
      await ctx.reply(
        'ℹ️ Довідка\n\n' +
        '🎯 Допомагаю купувати пости для групи обміну валют\n\n' +
        '💰 Як купити:\n' +
        '• Натисни «💰 Купити пост»\n' +
        '• Обери спосіб оплати\n' +
        '• Обери пакет → Оплати\n\n' +
        '📊 Баланс зберігається і показується в статистиці'
      );
    } catch (error) {
      console.error('❌ Допомога:', error);
    }
  });

  // Статистика
  bot.hears('📊 Статистика', async (ctx: Context) => {
    try {
      const userId = ctx.from?.id;
      if (!userId) return;

      const free = limiterService.getCount(userId.toString());
      const paid = await userBalanceService.getPaidBalance(userId.toString());

      let msg = `📊 Твоя статистика:\n\n📝 Безкоштовних: ${free}/${FREE_DAILY_LIMIT}\n💎 Платних: ${paid}`;
      if (paid === 0) msg += '\n\n💡 Купи через «💰 Купити пост»';

      await ctx.reply(msg);
    } catch (error) {
      console.error('❌ Статистика:', error);
      await ctx.reply('❌ Помилка отримання статистики');
    }
  });

  // Купити пост
  bot.hears('💰 Купити пост', async (ctx: Context) => {
    try {
      if (!ctx.from?.id) return;
      await ctx.reply('💰 Обери спосіб оплати:', { reply_markup: paymentKeyboard });
    } catch (error) {
      console.error('❌ Купити:', error);
      await ctx.reply('❌ Помилка. Спробуй знову.');
    }
  });

  // /reset (адмін)
  bot.command('reset', async (ctx: Context) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return;

    try {
      const member = await ctx.getChatMember(userId);
      if (!['creator', 'administrator'].includes(member.status)) {
        await ctx.reply('❌ Тільки для адмінів');
        return;
      }

      const args = ctx.message?.text?.split(' ');
      const targetId = args?.[1] || userId.toString();

      limiterService.reset(targetId);
      await ctx.reply(targetId === userId.toString() ? '✅ Твій ліміт скинуто!' : `✅ Ліміт скинуто для ${targetId}`);
      console.log(`🔄 Адмін ${userId} → reset ${targetId}`);
    } catch (error) {
      console.error('❌ Reset:', error);
      await ctx.reply('❌ Помилка. Працює тільки в групі.');
    }
  });
}
