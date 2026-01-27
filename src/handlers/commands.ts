import { Context } from 'grammy';
import { limiterService } from '../services/limiter';
import { userBalanceService } from '../services/premium';

// Зберігаємо стан користувача
const userStates = new Map<number, {
  step: 'awaiting_payment' | 'awaiting_text';
  paid?: boolean;
  packageCount?: number;
}>();

// Reply Keyboard (постійні кнопки знизу)
const mainKeyboard = {
  keyboard: [
    [{ text: '💰 Купити пост' }, { text: '📊 Статистика' }],
    [{ text: 'ℹ️ Допомога' }],
  ],
  resize_keyboard: true,  // Компактний розмір
  is_persistent: true,    // Не ховається після натискання
};

export function registerCommands(bot: any) {
  // /start - привітання з клавіатурою
  bot.command('start', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (userId) {
      await userBalanceService.ensureUserExists(userId.toString());
    }

    await ctx.reply(
      `👋 Привіт!\n\n` +
      `Я бот для покупки постів у групі обміну валют.\n\n` +
      `💰 Купуй пости через кнопку нижче\n` +
      `📊 Переглядай свій баланс\n\n` +
      `👇 Використовуй кнопки:`,
      { reply_markup: mainKeyboard }
    );
  });

  // Кнопка "ℹ️ Допомога"
  bot.hears('ℹ️ Допомога', async (ctx: Context) => {
    await ctx.reply(
      `ℹ️ Довідка\n\n` +
      `🎯 Що я роблю:\n` +
      `Допомагаю купувати пости для групи обміну валют\n\n` +
      `💰 Як купити:\n` +
      `• Натисни «💰 Купити пост»\n` +
      `• Обери спосіб оплати (Stars або CryptoBot)\n` +
      `• Обери пакет\n` +
      `• Оплати\n\n` +
      `📊 Баланс зберігається і показується в статистиці`
    );
  });

  // Кнопка "📊 Статистика"
  bot.hears('📊 Статистика', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const freeCount = limiterService.getCount(userId.toString());
    const paidBalance = await userBalanceService.getPaidBalance(userId.toString());

    const status = `📊 Твоя статистика:\n\n` +
      `📝 Безкоштовних постів сьогодні: ${freeCount}/3\n` +
      `💎 Платних постів на балансі: ${paidBalance}`;

    await ctx.reply(status + (paidBalance === 0 ? `\n\n💡 Купи пости через «💰 Купити пост»` : ''));
  });

  // Кнопка "💰 Купити пост"
  bot.hears('💰 Купити пост', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    await ctx.reply(
      '💰 Обери спосіб оплати:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⭐ Telegram Stars', callback_data: 'method_stars' }],
            [{ text: '💎 CryptoBot (USDT/TON/BTC)', callback_data: 'method_crypto' }],
          ]
        }
      }
    );
  });

  // /reset - для адмінів групи (прихована команда)
  bot.command('reset', async (ctx: Context) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) return;

    try {
      const member = await ctx.getChatMember(userId);

      if (!['creator', 'administrator'].includes(member.status)) {
        await ctx.reply('❌ Ця команда доступна тільки адмінам групи');
        return;
      }

      const args = ctx.message?.text?.split(' ');
      const targetId = args && args[1] ? args[1] : userId.toString();

      limiterService.reset(targetId);
      userStates.delete(Number(targetId));

      if (targetId === userId.toString()) {
        await ctx.reply('✅ Твій ліміт скинуто!');
      } else {
        await ctx.reply(`✅ Ліміт скинуто для користувача ${targetId}`);
      }

      console.log(`🔄 Адмін ${userId} скинув ліміт для ${targetId}`);
    } catch (error) {
      console.error('❌ Помилка reset:', error);
      await ctx.reply('❌ Помилка. Ця команда працює тільки в групі.');
    }
  });
}

// Експортуємо для використання в payments
export { userStates };
