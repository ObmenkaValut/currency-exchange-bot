import { Context, NextFunction } from 'grammy';
import { BUTTONS } from '../config/constants';

const BUTTON_VALUES = Object.values(BUTTONS);

/**
 * Определяет тип события для логирования
 * @param ctx - Контекст Grammy
 * @returns Строка с типом события (cmd, btn, msg, cb и т.д.)
 */
const getType = (ctx: Context): string => {
  const text = ctx.message?.text;

  // Команда
  if (text?.startsWith('/')) {
    return `команда: ${text.split(' ')[0]}`;
  }

  // Кнопка главного меню
  if (text && BUTTON_VALUES.includes(text)) {
    return `кнопка: ${text}`;
  }

  // Обычное сообщение
  if (ctx.message) {
    return 'сообщение';
  }

  // Callback query
  if (ctx.callbackQuery) {
    return `callback: ${ctx.callbackQuery.data}`;
  }

  // Другие типы обновлений
  const keys = Object.keys(ctx.update || {}).filter((k) => k !== 'update_id');
  return keys[0] || 'неизвестный тип';
};

/**
 * Middleware для логирования входящих запросов и времени их обработки
 */
export async function loggerMiddleware(ctx: Context, next: NextFunction) {
  const start = Date.now();

  // Формирование информации о пользователе
  const user = ctx.from?.username
    ? `@${ctx.from.username}`
    : ctx.from?.first_name || 'неизвестный';
  const uid = ctx.from?.id || 'нет ID';
  const chat = ctx.chat?.type || 'неизвестный чат';

  console.log(`⬇️ [${getType(ctx)}] ${user} (${uid}) в ${chat}`);

  await next();

  const duration = Date.now() - start;
  console.log(`⬆️ Обработано за ${duration}мс`);
}

