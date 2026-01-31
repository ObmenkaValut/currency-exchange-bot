import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { webhookCallback, session } from 'grammy';
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
import { MAX_MESSAGE_AGE, TRANSACTION_RETENTION_DAYS, TRANSACTION_CLEANUP_INTERVAL, MESSAGES, SCHEDULED_MESSAGE_INTERVAL_HOURS, TARGET_CHAT_ID, SCHEDULED_MESSAGE_TEXT } from './config/constants';

// === Config ===
const PORT = parseInt(process.env.PORT || '3000', 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const IS_PROD = process.env.NODE_ENV === 'production';
const CRYPTO_TOKEN = process.env.CRYPTO_BOT_TOKEN || '';

// === Validation ===
if (!CRYPTO_TOKEN) console.warn('⚠️ CRYPTO_BOT_TOKEN не установлен');
if (IS_PROD && !WEBHOOK_URL) throw new Error('❌ WEBHOOK_URL required for production');
if (IS_PROD && WEBHOOK_URL && !WEBHOOK_URL.startsWith('https://')) {
  throw new Error('❌ WEBHOOK_URL must start with https://');
}

async function start() {
  console.log(`🚀 Starting...Mode: ${IS_PROD ? 'WEBHOOK' : 'POLLING'} `);

  await userBalanceService.loadAllBalances();


  // Автоматическая очистка старых транзакций
  console.log(`🧹 Cleanup configured: keep ${TRANSACTION_RETENTION_DAYS} days, check every ${TRANSACTION_CLEANUP_INTERVAL / 1000 / 60} min`);

  await userBalanceService.deleteOldTransactions(TRANSACTION_RETENTION_DAYS);
  setInterval(() => {
    console.log('🧹 Daily cleanup started...');
  }, TRANSACTION_CLEANUP_INTERVAL);

  // === Scheduled Message ===
  console.log(`⏰ Scheduled message: every ${SCHEDULED_MESSAGE_INTERVAL_HOURS}h to chat ${TARGET_CHAT_ID}`);
  setInterval(async () => {
    try {
      if (!TARGET_CHAT_ID) return; // Skip if not configured
      const linkPreview = { is_disabled: true };
      await bot.api.sendMessage(TARGET_CHAT_ID, SCHEDULED_MESSAGE_TEXT, { parse_mode: 'Markdown', link_preview_options: linkPreview });
      console.log('✅ Scheduled message sent');
    } catch (error) {
      console.error('❌ Scheduled message failed:', error);
    }
  }, SCHEDULED_MESSAGE_INTERVAL_HOURS * 60 * 60 * 1000);

  await bot.api.setMyCommands([{ command: 'start', description: 'Перезапуск бота' }]);

  // === Global Formatting ===
  // Устанавливаем Markdown как стандарт для всех сообщений
  bot.api.config.use(async (prev, method, payload, signal) => {
    if (payload && typeof payload === 'object') {
      // Global Trim: удаляем лишние пробелы/отступы из текста сообщений
      if ('text' in payload && typeof (payload as any).text === 'string') {
        (payload as any).text = (payload as any).text.trim();
      }
      if ('caption' in payload && typeof (payload as any).caption === 'string') {
        (payload as any).caption = (payload as any).caption.trim();
      }

      // Default Parse Mode
      if (!('parse_mode' in payload)) {
        (payload as any).parse_mode = 'Markdown';
      }
    }
    return prev(method, payload, signal);
  });

  // === Middleware ===

  // === Anti-Spam Middleware (Private DM Only) ===
  bot.use(async (ctx, next) => {
    // Работаем только в ЛС (Private) и если есть юзер
    if (ctx.chat?.type === 'private' && ctx.from?.id) {
      const spamCheck = limiterService.checkSpam(ctx.from.id.toString());

      if (spamCheck.isBanned) {
        // Вычисляем сколько осталось (в минутах, округляем вверх)
        const minutesLeft = Math.ceil((spamCheck.banExpiresAt! - Date.now()) / 1000 / 60);

        // Отвечаем юзеру (чтобы он знал)
        await ctx.reply(MESSAGES.WARNINGS.SPAM_BAN(minutesLeft));

        return; // Стоп, дальше не обрабатываем
      }
    }
    return next();
  });

  // @ts-ignore
  bot.use(session({ initial: () => ({ step: 'idle' }) }));

  // 1. Фильтр старых сообщений
  bot.use(async (ctx, next) => {
    if (ctx.message?.date) {
      const age = Date.now() / 1000 - ctx.message.date;
      if (age > MAX_MESSAGE_AGE) {
        console.log(`⏭️ Skip old msg(${Math.floor(age / 60)}m)`);
        return;
      }
    }
    return next();
  });




  bot.use(loggerMiddleware);
  bot.catch((err) => errorHandler(err, err.ctx));

  // === Handlers ===
  registerCommands(bot);
  registerPayments(bot);
  registerBroadcast(bot);

  bot
    .on('message:text')
    .filter((ctx) => ['supergroup', 'group'].includes(ctx.chat?.type || ''), handleGroupMessage);

  bot.on('message:new_chat_members', handleNewMember);

  // === Express ===
  const app = express();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use('/webhook', createWebhookRouter(CRYPTO_TOKEN));
  app.get('/health', (_, res) => res.json({ status: 'ok' }));

  if (IS_PROD && WEBHOOK_URL) {
    app.post('/telegram', webhookCallback(bot, 'express'));
    await bot.api.setWebhook(`${WEBHOOK_URL}/telegram`, { drop_pending_updates: true });
    console.log(`📡 Webhook: ${WEBHOOK_URL}/telegram`);
  }

  app.listen(PORT, async () => {
    console.log(`🌐 Express :${PORT}`);
    if (!IS_PROD) {
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      await bot.start();
      console.log('🔄 Polling mode');
    }
  });

  console.log('✅ Bot started!');
}

start().catch((err) => {
  console.error('❌ Startup error:', err);
  process.exit(1);
});
