import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { webhookCallback } from 'grammy';
import { bot } from './bot';
import { userBalanceService } from './services/premium';
import { handleGroupMessage } from './handlers/messages';
import { registerCommands } from './handlers/commands';
import { registerPayments } from './handlers/payments';
import { createWebhookRouter } from './handlers/webhook';
import { loggerMiddleware } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { MAX_MESSAGE_AGE } from './config/constants';

// === Config ===
const PORT = parseInt(process.env.PORT || '3000', 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const IS_PROD = process.env.NODE_ENV === 'production';
const CRYPTO_TOKEN = process.env.CRYPTO_BOT_TOKEN || '';

// === Validation ===
if (!CRYPTO_TOKEN) console.warn('⚠️ CRYPTO_BOT_TOKEN не встановлено');
if (IS_PROD && !WEBHOOK_URL) throw new Error('❌ WEBHOOK_URL required for production');
if (IS_PROD && WEBHOOK_URL && !WEBHOOK_URL.startsWith('https://')) {
  throw new Error('❌ WEBHOOK_URL must start with https://');
}

async function start() {
  console.log(`🚀 Starting... Mode: ${IS_PROD ? 'WEBHOOK' : 'POLLING'}`);

  await userBalanceService.loadAllBalances();
  await bot.api.setMyCommands([{ command: 'start', description: 'Перезапуск бота' }]);

  // === Middleware ===

  // 1. Фільтр старих повідомлень
  bot.use(async (ctx, next) => {
    if (ctx.message?.date) {
      const age = Date.now() / 1000 - ctx.message.date;
      if (age > MAX_MESSAGE_AGE) {
        console.log(`⏭️ Skip old msg (${Math.floor(age / 60)}m)`);
        return;
      }
    }
    return next();
  });

  // 2. Автоматичне додавання юзера в БД при будь-якій активності
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId && ctx.chat?.type === 'private') {
      await userBalanceService.ensureUserExists(userId.toString());
    }
    return next();
  });

  bot.use(loggerMiddleware);
  bot.catch((err) => errorHandler(err, err.ctx));

  // === Handlers ===
  registerCommands(bot);
  registerPayments(bot);

  bot
    .on('message:text')
    .filter((ctx) => ['supergroup', 'group'].includes(ctx.chat?.type || ''), handleGroupMessage);

  // === Express ===
  const app = express();
  app.use(express.json());
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
      bot.start();
      console.log('🔄 Polling mode');
    }
  });

  console.log('✅ Bot started!');
}

start().catch((err) => {
  console.error('❌ Startup error:', err);
  process.exit(1);
});
