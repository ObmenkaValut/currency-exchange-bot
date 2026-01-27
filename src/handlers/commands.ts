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
      `Я бот для публікації оголошень у групі.\n\n` +
      `📝 Як працює:\n` +
      `• Кожен може писати 3 повідомлення/день безкоштовно\n` +
      `• Хочеш більше? Натисни «💰 Купити пост»\n` +
      `• Емодзі заборонені (або купи платний пост)\n\n` +
      `👇 Використовуй кнопки нижче:`,
      { reply_markup: mainKeyboard }
    );
  });

  // Кнопка "ℹ️ Допомога"
  bot.hears('ℹ️ Допомога', async (ctx: Context) => {
    await ctx.reply(
      `ℹ️ Довідка\n\n` +
      `🎯 Що я роблю:\n` +
      `Модерую групу і даю можливість публікувати платні пости\n\n` +
      `📋 Правила групи:\n` +
      `• 3 безкоштовні пості/день на людину\n` +
      `• Емодзі заборонені в безкоштовних постах\n` +
      `• Тільки теми про обмін валют/крипти\n\n` +
      `💰 Платні пости:\n` +
      `• Натисни «💰 Купити пост»\n` +
      `• 1 ⭐ = 1 пост\n` +
      `• Емодзі дозволені\n` +
      `• Модерація через AI`
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
      `💎 Платних постів: ${paidBalance}\n` +
      `📅 Безкоштовні оновляться завтра`;

    // Якщо є платні пости - показуємо кнопку "Написати пост"
    if (paidBalance > 0) {
      await ctx.reply(status, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✍️ Написати пост', callback_data: 'write_post' }]
          ]
        }
      });
    } else {
      await ctx.reply(status + `\n\n💡 Хочеш більше? Натисни «💰 Купити пост»`);
    }
  });

  // Кнопка "💰 Купити пост"
  bot.hears('💰 Купити пост', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

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
