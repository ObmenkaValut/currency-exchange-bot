import { BotError, Context } from 'grammy';

/**
 * Глобальный обработчик ошибок бота
 * Логирует детали ошибки и пытается уведомить пользователя
 */
export async function errorHandler(err: BotError, ctx: Context) {
  // Логирование основной ошибки
  console.error('❌ Ошибка бота:', err.message);
  console.error('Детали ошибки:', err.error);

  if (err.stack) {
    console.error('Stack trace:', err.stack);
  }

  // Логирование контекста ошибки
  try {
    const uid = ctx.from?.id || 'неизвестно';
    const chat = ctx.chat?.id || 'неизвестно';
    const username = ctx.from?.username ? `@${ctx.from.username}` : 'нет username';
    const type = Object.keys(ctx.update || {}).filter((k) => k !== 'update_id')[0] || 'неизвестный тип';

    console.error(`👤 Пользователь: ${uid} (${username}), Чат: ${chat}, Тип: ${type}`);

    // Попытка уведомить пользователя
    if (ctx.chat) {
      const opts = ctx.message?.message_id
        ? { reply_to_message_id: ctx.message.message_id }
        : undefined;

      await ctx.reply('❌ Ошибка. Попробуй снова', opts);
    }
  } catch (replyError) {
    console.error('❌ Не удалось отправить ответ пользователю:', replyError instanceof Error ? replyError.message : replyError);
  }
}

