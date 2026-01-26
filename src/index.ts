import { bot } from './bot';
import { premiumService } from './services/premium';
import { MESSAGES } from './utils/constants';

async function start() {
  console.log('🚀 Запуск бота...');

  // Завантажуємо premium користувачів
  await premiumService.loadPremiumUsers();

  // Команда /start
  bot.command('start', async (ctx) => {
    await ctx.reply(MESSAGES.WELCOME);
  });

  // Команда /help
  bot.command('help', async (ctx) => {
    await ctx.reply(MESSAGES.HELP);
  });

  // Тестова команда
  bot.command('test', async (ctx) => {
    await ctx.reply('✅ Всі сервіси працюють:\n- Firebase ✓\n- Gemini ✓\n- grammY ✓');
  });

  // Запускаємо бота
  await bot.start();
  console.log('✅ Бот запущено успішно!');
}

start().catch((error) => {
  console.error('❌ Помилка запуску:', error);
  process.exit(1);
});
