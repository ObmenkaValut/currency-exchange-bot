import { BotError, Context } from 'grammy';

export async function errorHandler(err: BotError, ctx: Context) {
  console.error('❌ Bot error:', err.message);
  console.error('Error:', err.error);
  if (err.stack) console.error('Stack:', err.stack);

  try {
    const uid = ctx.from?.id;
    const chat = ctx.chat?.id;
    const type = Object.keys(ctx.update || {}).filter((k) => k !== 'update_id')[0] || '?';
    console.error(`👤 User: ${uid}, Chat: ${chat}, Type: ${type}`);

    if (ctx.chat) {
      const opts = ctx.message?.message_id ? { reply_to_message_id: ctx.message.message_id } : undefined;
      await ctx.reply('❌ Ошибка. Попробуй снова', opts);
    }
  } catch (e) {
    console.error('❌ Reply failed:', e);
  }
}
