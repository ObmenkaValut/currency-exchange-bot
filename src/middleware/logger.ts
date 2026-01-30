import { Context, NextFunction } from 'grammy';
import { BUTTONS } from '../config/constants';

const BUTTON_VALUES = Object.values(BUTTONS);

const getType = (ctx: Context): string => {
  const text = ctx.message?.text;
  if (text?.startsWith('/')) return `cmd: ${text.split(' ')[0]}`;
  if (text && BUTTON_VALUES.includes(text)) return `btn: ${text}`;
  if (ctx.message) return 'msg';
  if (ctx.callbackQuery) return `cb: ${ctx.callbackQuery.data}`;
  const keys = Object.keys(ctx.update || {}).filter((k) => k !== 'update_id');
  return keys[0] || 'unknown';
};

export async function loggerMiddleware(ctx: Context, next: NextFunction) {
  const start = Date.now();

  const user = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || 'unknown';
  const uid = ctx.from?.id || '?';
  const chat = ctx.chat?.type || 'unknown';

  console.log(`⬇️ [${getType(ctx)}] ${user} (${uid}) in ${chat}`);

  await next();

  console.log(`⬆️ ${Date.now() - start}ms`);
}
