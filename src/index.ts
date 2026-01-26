import { bot } from './bot';
import { userBalanceService } from './services/premium';
import { handleGroupMessage } from './handlers/messages';
import { registerCommands } from './handlers/commands';
import { registerPayments, handlePrivateMessage } from './handlers/payments';
import { loggerMiddleware } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';

async function start() {
  console.log('🚀 Запуск бота...');

  // Завантажуємо баланси користувачів з Firestore
  await userBalanceService.loadAllBalances();

  // Встановлюємо список команд для меню
  await bot.api.setMyCommands([
    { command: 'start', description: 'Почати роботу' },
    { command: 'help', description: 'Допомога' },
    { command: 'mystats', description: 'Моя статистика' },
    { command: 'buy', description: 'Купити платний пост' },
  ]);
  console.log('✅ Команди оновлено');

  // Middleware
  bot.use(loggerMiddleware);
  bot.catch((err) => errorHandler(err, err.ctx));


  // Реєструємо команди
  registerCommands(bot);

  // Реєструємо платіжні callback'и
  registerPayments(bot);

  // Обробка повідомлень з ФІЛЬТРАМИ по типу чату
  console.log('📝 Реєструємо handler для повідомлень');

  // Тільки для ГРУП/СУПЕРГРУП
  bot.on('message:text').filter(
    (ctx) => ctx.chat?.type === 'supergroup' || ctx.chat?.type === 'group',
    handleGroupMessage
  );

  // Тільки для ПРИВАТНИХ чатів
  bot.on('message:text').filter(
    (ctx) => ctx.chat?.type === 'private',
    handlePrivateMessage
  );

  await bot.start();
  console.log('✅ Бот запущено!');
  console.log('📝 Додай бота в групу як адміна (Delete messages)');
  console.log('💬 У приватному чаті пиши /buy для публікації');
}

start().catch((error) => {
  console.error('❌ Помилка запуску:', error);
  process.exit(1);
});
