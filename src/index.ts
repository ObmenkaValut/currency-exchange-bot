import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { bot } from './bot';
import { userBalanceService } from './services/premium';
import { handleGroupMessage } from './handlers/messages';
import { registerCommands } from './handlers/commands';
import { registerPayments } from './handlers/payments';
import { createWebhookRouter } from './handlers/webhook';
import { loggerMiddleware } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';

const CRYPTO_BOT_TOKEN = process.env.CRYPTO_BOT_TOKEN || '';
const PORT = process.env.PORT || 3000;

async function start() {
  console.log('🚀 Запуск бота...');

  // Завантажуємо баланси
  await userBalanceService.loadAllBalances();

  // Команди бота
  await bot.api.setMyCommands([
    { command: 'start', description: 'Перезапуск бота' },
  ]);

  // Middleware
  bot.use(loggerMiddleware);
  bot.catch((err) => errorHandler(err, err.ctx));

  // Реєструємо handlers
  registerCommands(bot);
  registerPayments(bot);

  // Фільтри по типу чату
  bot.on('message:text').filter(
    (ctx) => ctx.chat?.type === 'supergroup' || ctx.chat?.type === 'group',
    handleGroupMessage
  );

  // Express сервер для webhooks
  const app = express();
  app.use(express.json());
  app.use('/webhook', createWebhookRouter(CRYPTO_BOT_TOKEN));

  app.get('/health', (_, res) => res.json({ status: 'ok' }));

  app.listen(PORT, () => {
    console.log(`🌐 Express на порту ${PORT}`);
    console.log(`📡 Webhook: http://localhost:${PORT}/webhook/cryptobot`);
  });

  // Запускаємо бота
  await bot.start();
  console.log('✅ Бот запущено!');
}

start().catch((error) => {
  console.error('❌ Помилка запуску:', error);
  process.exit(1);
});
