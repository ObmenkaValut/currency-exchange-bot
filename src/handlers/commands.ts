import { Context, Bot } from 'grammy';
import { limiterService } from '../services/limiter';
import { userBalanceService } from '../services/premium';
import { FREE_DAILY_LIMIT, BUTTONS, MAIN_KEYBOARD, MESSAGES } from '../config/constants';

const mainKeyboard = {
  keyboard: MAIN_KEYBOARD.map(row => row.map(text => ({ text }))),
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

  // Довідка
  bot.hears(BUTTONS.HELP, async (ctx: Context) => {
    try {
      await ctx.reply(MESSAGES.HELP);
    } catch (error) {
      console.error('❌ Довідка:', error);
    }
  });

  // Профіль
  bot.hears(BUTTONS.PROFILE, async (ctx: Context) => {
    try {
      const userId = ctx.from?.id;
      if (!userId) return;

      const free = limiterService.getCount(userId.toString());
      const paid = await userBalanceService.getPaidBalance(userId.toString());

      let msg = `👤 **Мій профіль**\n\n📝 Безкоштовних сьогодні: ${free}/${FREE_DAILY_LIMIT}\n💎 Платних постів: ${paid}`;
      if (paid === 0) msg += `\n\n💡 Натисни «${BUTTONS.BUY}» щоб купити`;

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('❌ Профіль:', error);
      await ctx.reply('❌ Помилка отримання профілю');
    }
  });

  // Адмін
  bot.hears(BUTTONS.ADMIN, async (ctx: Context) => {
    try {
      await ctx.reply(MESSAGES.ADMIN);
    } catch (error) {
      console.error('❌ Адмін:', error);
    }
  });

  // Купити пост
  bot.hears(BUTTONS.BUY, async (ctx: Context) => {
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
