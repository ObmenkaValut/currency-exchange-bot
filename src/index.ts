import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { session } from 'grammy';
import { bot } from './bot';
import { userBalanceService } from './services/premium';
import { limiterService } from './services/limiter';
import { handleGroupMessage } from './handlers/messages';
import { handleNewMember } from './handlers/events';
import { registerCommands } from './handlers/commands';
import { registerPayments } from './handlers/payments';
import { registerBroadcast } from './handlers/broadcast';
import { createWebhookRouter } from './handlers/webhook';
import { loggerMiddleware } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { MAX_MESSAGE_AGE, TRANSACTION_RETENTION_DAYS, TRANSACTION_CLEANUP_INTERVAL, MESSAGES, SCHEDULED_MESSAGE_INTERVAL_HOURS, TARGET_CHAT_ID, SCHEDULED_MESSAGE_TEXT, ALLOWED_GROUP_IDS } from './config/constants';

// === Конфигурация ===
const PORT = parseInt(process.env.PORT || '3000', 10);
const CRYPTO_TOKEN = process.env.CRYPTO_BOT_TOKEN || '';

// === Валидация переменных окружения ===
if (!CRYPTO_TOKEN) console.warn('⚠️ CRYPTO_BOT_TOKEN не установлен');

import { autoRetry } from '@grammyjs/auto-retry';

async function start() {
  console.log('🚀 Запуск бота (long polling)...');

  // === Auto-Retry для обработки Rate Limits ===
  // С long polling нет таймаута webhook (10с), поэтому retry можно делать агрессивнее
  bot.api.config.use(autoRetry({
    maxRetryAttempts: 3,   // 3 попытки при 429
    maxDelaySeconds: 5,    // ждём до 5с между попытками
  }));

  // Загрузка всех балансов пользователей в кэш
  await userBalanceService.loadAllBalances();

  // === Автоматическая очистка старых транзакций ===
  console.log(`🧹 Настроена очистка: хранение ${TRANSACTION_RETENTION_DAYS} дней, проверка каждые ${TRANSACTION_CLEANUP_INTERVAL / 1000 / 60} мин`);

  // Первая очистка при старте
  await userBalanceService.deleteOldTransactions(TRANSACTION_RETENTION_DAYS);

  // Периодическая очистка
  setInterval(async () => {
    console.log('🧹 Запуск ежедневной очистки транзакций...');
    await userBalanceService.deleteOldTransactions(TRANSACTION_RETENTION_DAYS);
  }, TRANSACTION_CLEANUP_INTERVAL);

  // === Плановые сообщения (закомментировано) ===
  console.log(`⏰ Плановые сообщения: каждые ${SCHEDULED_MESSAGE_INTERVAL_HOURS}ч в чат ${TARGET_CHAT_ID}`);
  setInterval(async () => {
    try {
      if (!TARGET_CHAT_ID) return; // Пропускаем, если не настроено
      const linkPreview = { is_disabled: true };
      await bot.api.sendMessage(TARGET_CHAT_ID, SCHEDULED_MESSAGE_TEXT, { parse_mode: 'Markdown', link_preview_options: linkPreview });
      console.log('✅ Плановое сообщение отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки планового сообщения:', error);
    }
  }, SCHEDULED_MESSAGE_INTERVAL_HOURS * 60 * 60 * 1000);

  await bot.api.setMyCommands([{ command: 'start', description: 'Перезапуск бота' }]);

  // === Глобальное форматирование сообщений ===
  // Устанавливаем Markdown как стандарт и автоматически обрезаем пробелы
  bot.api.config.use(async (prev, method, payload, signal) => {
    if (payload && typeof payload === 'object') {
      // Автоматическое удаление лишних пробелов/отступов
      if ('text' in payload && typeof (payload as any).text === 'string') {
        (payload as any).text = (payload as any).text.trim();
      }
      if ('caption' in payload && typeof (payload as any).caption === 'string') {
        (payload as any).caption = (payload as any).caption.trim();
      }

      // Markdown по умолчанию для всех сообщений
      if (!('parse_mode' in payload)) {
        (payload as any).parse_mode = 'Markdown';
      }
    }
    return prev(method, payload, signal);
  });

  // === Middleware ===

  // Логирование ПЕРВЫМ — чтобы видеть ВСЕ update'ы без исключений
  bot.use(loggerMiddleware);
  bot.catch((err) => errorHandler(err, err.ctx));

  // === Whitelist групп ===
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    const chatType = ctx.chat?.type;

    // Пропускаем личные сообщения (бот должен работать в ЛС)
    if (chatType === 'private') return next();

    // Проверяем whitelist для групп и каналов
    if (chatType === 'supergroup' || chatType === 'group' || chatType === 'channel') {
      if (!ALLOWED_GROUP_IDS.includes(chatId!)) {
        console.log(`⛔ Неразрешенная группа/канал: ${chatId}. Покидаю...`);
        try {
          await ctx.leaveChat();
          console.log(`✅ Успешно покинул чат ${chatId}`);
        } catch (error) {
          console.error(`❌ Ошибка при попытке покинуть чат ${chatId}:`, error instanceof Error ? error.message : error);
        }
        return; // Прерываем обработку
      }
    }

    return next();
  });



  // === Антиспам защита (только для личных сообщений) ===
  bot.use(async (ctx, next) => {
    // Проверяем только в личных чатах
    if (ctx.chat?.type === 'private' && ctx.from?.id) {
      const spamCheck = limiterService.checkSpam(ctx.from.id.toString());

      if (spamCheck.isBanned) {
        // Вычисляем оставшееся время бана (в минутах, округляем вверх)
        const minutesLeft = Math.ceil((spamCheck.banExpiresAt! - Date.now()) / 1000 / 60);
        console.log(`⛔ Спам-бан: userId=${ctx.from.id}, осталось ${minutesLeft} мин`);

        // Уведомляем пользователя о бане
        await ctx.reply(MESSAGES.WARNINGS.SPAM_BAN(minutesLeft));

        return; // Прерываем обработку
      }
    }
    return next();
  });

  // Сессии для хранения состояния пользователей
  // @ts-ignore
  bot.use(session({ initial: () => ({ step: 'idle' }) }));

  // Фильтр старых сообщений (защита от обработки сообщений после перезапуска)
  bot.use(async (ctx, next) => {
    if (ctx.message?.date) {
      const age = Date.now() / 1000 - ctx.message.date;
      if (age > MAX_MESSAGE_AGE) {
        console.log(`⏭️ Пропущено старое сообщение (возраст: ${Math.floor(age)}с, от userId=${ctx.from?.id})`);
        return;
      }
    }
    return next();
  });

  // === Регистрация обработчиков ===
  registerCommands(bot);
  registerPayments(bot);
  registerBroadcast(bot);

  // Обработка текстовых сообщений в группах
  bot
    .on('message:text')
    .filter((ctx) => ['supergroup', 'group'].includes(ctx.chat?.type || ''), handleGroupMessage);

  // Fallback: ловим ВСЕ сообщения, которые НЕ попали в handler выше
  bot.on('message', (ctx) => {
    const who = ctx.from?.first_name || '?';
    const uid = ctx.from?.id || '?';
    const chatType = ctx.chat?.type || '?';
    const hasText = !!ctx.message?.text;
    console.log(`⚠️ Необработанное сообщение: ${who} [${uid}], chat=${chatType}, hasText=${hasText}, keys=${Object.keys(ctx.message || {}).join(',')}`);
  });

  // Обработка новых участников группы (работает и в супергруппах)
  bot.on('chat_member', handleNewMember);

  // === Express сервер ===
  const app = express();

  // Middleware для обработки JSON с сохранением raw body (нужно для верификации подписи CryptoBot)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));

  // Роутеры
  app.use('/webhook', createWebhookRouter(CRYPTO_TOKEN));
  app.get('/health', (_, res) => res.json({ status: 'ok' }));

  // Запуск Express сервера (нужен для CryptoBot webhook и health check)
  app.listen(PORT, async () => {
    console.log(`🌐 Express сервер запущен на порту ${PORT}`);
  });

  // === Long Polling — надёжный приём update'ов ===
  // Бот сам запрашивает update'ы у Telegram, ничего не теряется.
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  console.log('📡 Webhook удалён, переходим на long polling...');
  bot.start({
    allowed_updates: ['message', 'chat_member', 'callback_query', 'pre_checkout_query', 'my_chat_member'],
    onStart: () => console.log('🔄 Long polling активирован. Бот получает update\'ы напрямую от Telegram.'),
  });

  console.log('✅ Бот успешно запущен!');
}

// Запуск приложения с обработкой ошибок
start().catch((err) => {
  console.error('❌ Критическая ошибка при запуске:', err);
  process.exit(1);
});
