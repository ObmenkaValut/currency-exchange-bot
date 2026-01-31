import { Context, Bot } from 'grammy';
import { limiterService } from '../services/limiter';
import { userBalanceService } from '../services/premium';
import { FREE_DAILY_LIMIT, BUTTONS, MAIN_KEYBOARD, MESSAGES, PAYMENT_KEYBOARD, ADMIN_IDS } from '../config/constants';

const mainKeyboard = {
  keyboard: MAIN_KEYBOARD.map(row => row.map(text => ({ text }))),
  resize_keyboard: true,
  is_persistent: true,
};

// Main keyboard defined elsewhere or above

export function registerCommands(bot: Bot) {
  // /start
  bot.command('start', async (ctx: Context) => {
    // Игнорируем в группах
    if (ctx.chat?.type !== 'private') return;

    try {
      // Create user if not exists or update info
      await userBalanceService.ensureUser(ctx.from?.id.toString()!, {
        username: ctx.from?.username,
        firstName: ctx.from?.first_name
      }, true); // forceCheck: проверять БД реально, на случай ручного удаления

      await ctx.reply(MESSAGES.START, { reply_markup: mainKeyboard });
    } catch (error) {
      console.error('❌ /start:', error);
      await ctx.reply(MESSAGES.ERRORS.GENERIC);
    }
  });

  // Справка
  bot.hears(BUTTONS.HELP, async (ctx: Context) => {
    try {
      await ctx.reply(MESSAGES.HELP);
    } catch (error) {
      console.error('❌ Справка:', error);
    }
  });

  // Профиль
  bot.hears(BUTTONS.PROFILE, async (ctx: Context) => {
    try {
      const userId = ctx.from?.id;
      if (!userId) return;

      const free = limiterService.getCount(userId.toString());
      const profile = await userBalanceService.getUserProfile(userId.toString());

      // Format: 14:20 | 29.01
      let dateStr = '—';
      if (profile.lastPostDate) {
        const d = profile.lastPostDate;
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        const mo = (d.getMonth() + 1).toString().padStart(2, '0');
        dateStr = `${hh}:${mm} | ${dd}.${mo}`;
      }

      let msg = `${MESSAGES.PROFILE.SECTION_AVAILABLE}\n` +
        `${MESSAGES.PROFILE.FREE_K(free, FREE_DAILY_LIMIT)}\n` +
        `${MESSAGES.PROFILE.PAID_K(profile.paidMessages)}\n` +
        `${MESSAGES.PROFILE.SECTION_ACTIVITY}\n` +
        `${MESSAGES.PROFILE.TOTAL_K(profile.totalPaidPosts)}\n` +
        `${MESSAGES.PROFILE.LAST_K(dateStr)}\n` +
        `${MESSAGES.PROFILE.PS()}\n`
        ;


      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('❌ Профиль:', error);
      await ctx.reply(MESSAGES.PROFILE.ERROR);
    }
  });

  // Админ
  bot.hears(BUTTONS.ADMIN, async (ctx: Context) => {
    try {
      // @ts-ignore - explicitly disable parsing to avoid errors with underscores
      await ctx.reply(MESSAGES.ADMIN_CONTACT, { parse_mode: undefined });
    } catch (error) {
      console.error('❌ Админ:', error);
    }
  });

  // Купить пост
  bot.hears(BUTTONS.BUY, async (ctx: Context) => {
    try {
      if (!ctx.from?.id) return;
      await ctx.reply(MESSAGES.PAYMENT.SELECT_METHOD, { reply_markup: PAYMENT_KEYBOARD });
    } catch (error) {
      console.error('❌ Купить:', error);
      await ctx.reply(MESSAGES.ERRORS.GENERIC);
    }
  });

  // /reset (админ)
  bot.command('reset', async (ctx: Context) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return;

    try {
      const member = await ctx.getChatMember(userId);
      const isChatAdmin = ['creator', 'administrator'].includes(member.status);
      const isBotAdmin = ADMIN_IDS.includes(userId);

      if (!isChatAdmin && !isBotAdmin) {
        await ctx.reply(MESSAGES.ERRORS.NOT_ADMIN);
        return;
      }

      const args = ctx.message?.text?.split(' ');
      const targetId = args?.[1] || userId.toString();

      limiterService.reset(targetId);
      await ctx.reply(targetId === userId.toString() ? MESSAGES.RESET_SUCCESS_ME : MESSAGES.RESET_SUCCESS_OTHER(targetId));
      console.log(`🔄 Админ ${userId} → reset ${targetId}`);
    } catch (error) {
      console.error('❌ Reset:', error);
      await ctx.reply(MESSAGES.ERRORS.IN_GROUP_ONLY);
    }
  });

  // /getMyID
  bot.command('getmyid', async (ctx: Context) => {
    // Только в ЛС
    if (ctx.chat?.type !== 'private') return;

    const userId = ctx.from?.id;
    if (userId) {
      await ctx.reply(`Твой ID: \`${userId}\``, { parse_mode: 'Markdown' });
    }
  });
}
