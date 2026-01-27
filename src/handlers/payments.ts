import { Context } from 'grammy';
import { moderationService } from '../services/moderation';
import { userBalanceService } from '../services/premium';
import { userStates } from './commands';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.GROUP_ID) {
  throw new Error('❌ GROUP_ID не знайдено в .env');
}
const GROUP_ID = process.env.GROUP_ID;

// Текст правил для посту (використовується двічі)
const POST_RULES = `📋 ПРАВИЛА ДЛЯ ПОСТУ:

1️⃣ Тільки про обмін валют/криптовалюти
2️⃣ ОБОВ'ЯЗКОВО вкажи контакт:
   • @username (Telegram)
   • Номер телефону
   • Email або інший спосіб зв'язку

❌ Без контактів пост НЕ ПРОЙДЕ модерацію!

📝 Надішли текст свого оголошення:`;

export function registerPayments(bot: any) {
  // Пакети постів
  const packages = [
    { count: 1, callback: 'buy_1' },
    { count: 3, callback: 'buy_3' },
    { count: 5, callback: 'buy_5' },
    { count: 10, callback: 'buy_10' },
    { count: 20, callback: 'buy_20' },
    { count: 50, callback: 'buy_50' },
    { count: 100, callback: 'buy_100' },
  ];

  // Реєструємо callback для кожного пакету
  packages.forEach(({ count, callback }) => {
    bot.callbackQuery(callback, async (ctx: Context) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from?.id;
      if (!userId) return;

      // Встановлюємо стан з інфо про пакет
      userStates.set(userId, {
        step: 'awaiting_payment',
        packageCount: count
      });

      // Створюємо інвойс
      try {
        await ctx.replyWithInvoice(
          `Пакет: ${count} ${count === 1 ? 'пост' : count < 5 ? 'пости' : 'постів'}`,
          `Платні пости у групу (з емодзі та модерацією)`,
          JSON.stringify({ userId, count }),
          'XTR',
          [{ label: `${count} ${count === 1 ? 'пост' : 'постів'}`, amount: count }]
        );
      } catch (error) {
        console.error('❌ Помилка інвойсу:', error);
        await ctx.reply('❌ Помилка створення інвойсу. Спробуй /buy знову');
        userStates.delete(userId);
      }
    });
  });

  // Callback: "Написати пост" (коли є баланс платних постів)
  bot.callbackQuery('write_post', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (!userId) return;

    // Перевіряємо баланс
    const balance = await userBalanceService.getPaidBalance(userId.toString());

    if (balance <= 0) {
      await ctx.reply('❌ У тебе немає платних постів. Використай /buy');
      return;
    }

    // Встановлюємо стан - чекаємо текст
    userStates.set(userId, { step: 'awaiting_text', paid: true });

    await ctx.reply(POST_RULES);

    console.log(`✍️ User ${userId} почав писати платний пост`);
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

    // Встановлюємо стан - чекаємо текст
    userStates.set(userId, { step: 'awaiting_text', paid: true });

    const postWord = count === 1 ? 'пост' : count < 5 ? 'пости' : 'постів';
    await ctx.reply(`✅ Оплата успішна! Додано ${count} ${postWord}!\n\n${POST_RULES}`);

    console.log(`✅ Стан для ${userId}:`, userStates.get(userId));
  });
}

// Обробка текстових повідомлень в ПРИВАТНОМУ чаті
export async function handlePrivateMessage(ctx: Context) {
  if (ctx.chat?.type !== 'private') return; // Тільки приватні
  if (ctx.message?.text?.startsWith('/')) return; // Ігноруємо команди

  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message?.text;
  console.log(`📨 Private message від ${userId}: "${text}"`);

  const state = userStates.get(userId);
  console.log(`📊 State:`, state);

  // Якщо юзер оплатив і чекаємо текст
  if (state?.step === 'awaiting_text' && state.paid) {
    if (!text) return;

    // СПОЧАТКУ перевіряємо баланс (захист від race condition)
    const balance = await userBalanceService.getPaidBalance(userId.toString());
    if (balance <= 0) {
      await ctx.reply('❌ У тебе немає платних постів. Використай /buy');
      userStates.delete(userId);
      return;
    }

    // Модерація
    await ctx.reply('🔍 Перевіряю текст через AI...');
    const modResult = await moderationService.moderateText(text);

    if (!modResult.allowed) {
      await ctx.reply(
        `❌ Текст не пройшов модерацію\n\n` +
        `Причина: ${modResult.reason}\n\n` +
        `💡 Переписуй і надсилай заново`
      );
      return; // Стан залишається - юзер може переписати
    }

    // СПОЧАТКУ списуємо баланс, ПОТІМ публікуємо (захист від спаму)
    const used = await userBalanceService.usePaidMessage(userId.toString());
    if (!used) {
      await ctx.reply('❌ Не вдалось використати платний пост. Спробуй /buy');
      userStates.delete(userId);
      return;
    }

    // Текст OK — публікуємо
    try {
      await ctx.api.sendMessage(GROUP_ID, text);
      await ctx.reply('✅ Опубліковано в групі!');
      userStates.delete(userId);
      console.log(`📤 Пост від ${userId} опубліковано`);
    } catch (error) {
      console.error('❌ Помилка публікації:', error);
      // Повертаємо баланс якщо публікація не вдалась
      await userBalanceService.addPaidMessages(userId.toString(), 1);
      await ctx.reply('❌ Помилка публікації. Баланс повернуто. Спробуй ще.');
    }

    return;
  }

  // Якщо юзер пише без /buy
  console.log(`⚠️ User ${userId} пише без /buy або не оплатив`);
  await ctx.reply(
    '👋 Привіт!\n\n' +
    'Щоб опублікувати платний пост, використай команду /buy'
  );
}
