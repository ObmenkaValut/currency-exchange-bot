import { BotError, Context } from 'grammy';

export async function errorHandler(err: BotError, ctx: Context) {
  console.error('❌ Помилка в боті:');
  console.error(err.error);

  try {
    // Інформація про контекст помилки
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    console.error(`👤 User: ${userId}, Chat: ${chatId}`);

    // Намагаємось повідомити користувача
    if (ctx.chat) {
      await ctx.reply(
        '❌ Виникла помилка. Спробуй ще раз або звернись до @your_support',
        { reply_to_message_id: ctx.message?.message_id }
      );
    }
  } catch (e) {
    console.error('❌ Не вдалось відправити повідомлення про помилку:', e);
  }
}
