import { Context, NextFunction } from 'grammy';

export async function loggerMiddleware(ctx: Context, next: NextFunction) {
  const start = Date.now();

  // Інформація про запит
  const userId = ctx.from?.id || 'unknown';
  const username = ctx.from?.username || 'no_username';
  const chatType = ctx.chat?.type || 'unknown';
  const messageType = ctx.message ? 'message' : ctx.callbackQuery ? 'callback' : 'other';

  console.log(`⬇️ [${messageType}] від @${username} (${userId}) в ${chatType}`);

  // Виконуємо наступний handler
  await next();

  // Час виконання
  const duration = Date.now() - start;
  console.log(`⬆️ Оброблено за ${duration}ms`);
}
