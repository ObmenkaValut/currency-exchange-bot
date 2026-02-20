/**
 * Централизованный конфиг для всего проекта
 */

// === Telegram Bot ===
export const BOT_USERNAME = 'currExchange_robot';
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;
export const ADMIN_IDS: number[] = [300608298, 130552908, 5257577172]; // ID админов для доступа к /broadcast в привате
export const ALLOWED_GROUP_IDS: number[] = [-1003735325551, -1001513641809, -1003787423599]; // Верифицированные группы

// === Лимиты ===
export const MAX_POSTS_PER_PURCHASE = 100;
export const FREE_DAILY_LIMIT = 1;
export const MAX_LENGTH_FREE = 120;
export const MAX_LENGTH_PAID = 360;
export const MAX_LOG_MESSAGE_LENGTH = 3000; // Макс. длина текста нарушения в логе

// === AI ===
export const GEMINI_MODEL = 'gemini-2.5-flash-lite';
export const AI_RATE_WINDOW = 60 * 1000; // 1 мин
export const AI_PROMPT_TEMPLATE = `Канал обмена валют/крипты/финансовых операций разных типов. Пропускай ТОЛЬКО если текст явно про покупку/продажу/обмен валют (USD, EUR, UAH, BTC, USDT и т.д.), финансовые операции (банковские карты, счета, верификация, электронные кошельки), займы, котировки, переводы, бизнес услуги. 

Игнорируй декоративные символы Юникода (круги, блоки, флаги, буквы в рамках, эмодзи) — считай их просто оформлением. Текст внутри или рядом с ними является приоритетом для анализа.

Блокируй всё остальное: спам, мат, продажу курсов, нерелевантное. Под "бессмысленными символами" понимай только наборы случайных букв или массовый поток знаков БЕЗ какого-либо финансового контекста.

"{TEXT}"

Верни JSON. Причина - МАКСИМУМ 3 СЛОВА. (Примеры: "не про обмен" / "нецензурная лексика")
{"allowed":true/false,"reason":"макс 3 слова"}`

export const LOG_CHANNEL_ID = -1003787423599; // Канал для логов (бот не обрабатывает сообщения)

// === Таймеры ===
export const MAX_MESSAGE_AGE = 5 * 60; // 5 мин (сек)
export const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 час (мс)
export const INVOICE_TTL = 24 * 60 * 60 * 1000; // 24 часа (мс)
export const WELCOME_MESSAGE_TTL = 60 * 1000; // 60 сек (мс) - автоудаление приветствия
export const WARNING_EDIT_WINDOW = 10 * 1000; // 10 сек (мс) - окно для редактирования предупреждения вместо пересоздания
export const WARNING_DELETE_DELAY = 3 * 1000; // 3 сек (мс) - задержка удаления старого предупреждения

// === Транзакции ===
export const TRANSACTION_RETENTION_DAYS = 30; // 30 дней
export const TRANSACTION_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Проверять раз в 1 сутки

// === Кэш ===
export const MAX_CACHE_SIZE = 10000;

// === Плановые сообщения ===
export const SCHEDULED_MESSAGE_INTERVAL_HOURS = 3; // Периодичность в часах
export const TARGET_CHAT_ID = process.env.TARGET_GROUP_ID; // ID чата, куда отправлять.
export const SCHEDULED_MESSAGE_TEXT = '⚠️ *ВНИМАНИЕ. АДМИНИСТРАЦИЯ ЧАТА НЕ НЕСЕТ ОТВЕТСТВЕННОСТИ ЗА УЧАСТНИКОВ СДЕЛКИ.*';

// === Вспомогательные функции ===
export const getPostWord = (n: number): string => {
  if (n === 1) return 'пост';
  if (n < 5) return 'поста';
  return 'постов';
};

// === Таблицы цен (редактируй здесь для изменения цен) ===
// Telegram Stars: количество постов -> цена в Stars
export const PRICE_TABLE_STARS: Record<number, number> = {
  1: 10,
  3: 30,
  5: 50,
  10: 90,
  20: 170,
  30: 240,
  50: 325,
  100: 500,
};

// Crypto (USD): количество постов -> цена в долларах
export const PRICE_TABLE_CRYPTO: Record<number, number> = {
  1: 0.20,
  3: 0.60,
  5: 1.00,
  10: 1.80,
  20: 3.40,
  30: 4.80,
  50: 6.50,
  100: 10.00,
};

// Получить цену в Stars (с fallback на 1 пост)
export const getPriceStars = (n: number): number => PRICE_TABLE_STARS[n] ?? PRICE_TABLE_STARS[1];

// Получить цену в долларах (с fallback на 1 пост)
export const getPriceCrypto = (n: number): number => PRICE_TABLE_CRYPTO[n] ?? PRICE_TABLE_CRYPTO[1];

export const formatPrice = (n: number): string =>
  `$${getPriceCrypto(n).toFixed(2)}`;

// === Клавиатуры ===
export const BUTTONS = {
  BUY: 'Купить',
  PROFILE: 'Профиль',
  HELP: 'Лимиты',
  ADMIN: 'Админ',
};

// Сетка 2x2
export const MAIN_KEYBOARD = [
  [BUTTONS.BUY, BUTTONS.PROFILE],
  [BUTTONS.HELP, BUTTONS.ADMIN],
];

export const PAYMENT_KEYBOARD = {
  inline_keyboard: [
    [{ text: '⭐ Telegram Stars', callback_data: 'method_stars' }],
    [{ text: '💎 CryptoBot (USDT/TON/BTC)', callback_data: 'method_crypto' }],
  ],
};

// === Сообщения ===
export const MESSAGES = {
  // Общие
  ERRORS: {
    GENERIC: '❌ Ошибка. Попробуй снова.',
    NOT_ADMIN: '❌ Только для админов',
    IN_GROUP_ONLY: '❌ Ошибка. Работает только в группе.',
    INVALID_COUNT: '❌ Некорректное количество',
    PARSE_ERROR: '❌ Ошибка обработки данных',
    CONTACT_SUPPORT: '❌ Ошибка. Свяжись с поддержкой',
  },

  // Команды
  START: `Привет.

*💵Хочешь выделиться?💵*

Разблокируй возможность писать с форматированием и увеличенным лимитом, *чтобы получить максимальный охват*.

Выбери нужную кнопку ↓`,

  HELP: `*Как это работает?*

Купи посты здесь. 
Пиши в чат как обычно. 
Всё. 

*Бот сам расширит лимиты:* 
📈 *Объем:* ${MAX_LENGTH_PAID} символов (вместо ${MAX_LENGTH_FREE}).
😱️ *Эмодзи:* без запретов. 
🔗 *Ссылки:* разрешены любые.
🔢 *Количество*: без ограничений.

Нажми кнопку "Купить", чтобы посмотреть цены ↓`,

  ADMIN_CONTACT: `Есть вопросы или ошибки? 
Напиши: @mmn_rus`,

  RESET_SUCCESS_ME: '✅ Твой лимит сброшен.',
  RESET_SUCCESS_OTHER: (id: string) => `✅ Лимит сброшен для ${id}`,

  PROFILE: {
    SECTION_AVAILABLE: '*ДОСТУПНО:*',
    FREE_K: (used: number, total: number) => `📉Бесплатных постов: ${used}/${total}`,
    PAID_K: (bal: number) => `📈Платных постов: ${bal}`,

    SECTION_ACTIVITY: '\n*АКТИВНОСТЬ:*',
    TOTAL_K: (n: number) => `📊 Всего опубликовано: ${n}`,
    LAST_K: (dateStr: string) => `🕔 Последний: ${dateStr} UTC`,

    PS: '\n*P.S.* _Бесплатные посты обновляются в 00:00 UTC._',
    ERROR: '❌ Ошибка получения профиля',
  },

  // Предупреждения в чате
  WARNINGS: {
    LENGTH: (max: number, hint: string) => `, текст не влез.\nМаксимальная длина: ${max} 🔐${hint}`,
    LENGTH_HINT_FREE: (link: string) => `\n\n*Увеличь объем до ${MAX_LENGTH_PAID} символов.*\nПереходи → ${link}`,
    EMOJI: (link: string) => `, эмодзи запрещены 🚫\n\n*Сделай сообщение заметным.*\nРазблокируй эмодзи в боте.\nПереходи → ${link}`,
    LINKS: (link: string) => `, ссылки запрещены 🚫\n\n*Не теряй клиентов.*\nРазблокируй доступ в боте.\nПереходи → ${link}`,
    LIMIT: (link: string) => `, бесплатные посты всё.\n📝 Лимит: ${FREE_DAILY_LIMIT}шт/день.\n\n*Хочешь больше?*\nПереходи → ${link}`,
    SPAM_BAN: (min: number) => `⛔️ Ты заблокирован на 3 минуты за спам.\nОсталось: ${min} мин.`,
    AI_RATE: ', ты пишешь слишком часто, подожди минуту 🕐',
    AI_MODERATION: (reason: string) => `, сообщение удалено 🚫\nПричина: ${reason}`,
    PAID_EXPIRED:
      '⚠️*Твои платные посты закончились.* \n\nПриобрети заново, чтобы продолжить публикацию без ограничений.',
    WELCOME: (name: string) => `Привет, ${name}! 👋
Добро пожаловать в чат.

*⚠️ У нас есть правила:*
• ${FREE_DAILY_LIMIT} пост/день (${MAX_LENGTH_FREE} симв). 
• Эмодзи недоступны. 
• Ссылки запрещены.

*Хочешь снять все ограничения?* 
Переходи → @currExchange\\_robot`,
  },

  // Оплата
  PAYMENT: {
    SELECT_METHOD: '💰*Цена поста:* $0.20 / 10⭐️\n\nВыбери способ оплаты, чтобы посмотреть все цены ↓',
    METHOD_STARS: '*Оптом — дешевле.* \n\nВыбери количество постов:',
    METHOD_CRYPTO: '*Оптом — дешевле.* \n\nВыбери количество постов:',
    INVOICE_TITLE: (count: number, word: string) => `Пакет: ${count} ${word}`,
    INVOICE_DESC: 'Платные посты в чат "Обмен валют"',
    CREATING_INVOICE: '_Загрузка..._',
    CRYPTO_INVOICE_CAPTION: (count: number, word: string, price: string) =>
      `Ты покупаешь: ${count} ${word} / ${price}`,
    BTN_PAY: '💳 Оплатить',
    BTN_BACK: '« Назад',
    SUCCESS: (count: number, word: string) =>
      `Ты успешно оплатил(а) ${count} ${word} ✅ \n\nНажми кнопку "Профиль", чтобы проверить баланс ↓`,
    FALLBACK_TRY_STARS: '❌ Ошибка. Попробуй Stars',
  },

  // Рассылка (Admin)
  BROADCAST: {
    START_PREFIX: (label: string) => `📝 Ты начал создание рассылки: *${label}*\n\n`,
    START_SUFFIX: 'Пришли сюда сообщение (текст, фото, видео), которое хочешь отправить.\n\nИли напиши /cancel для отмены.',

    CANCELLED: '❌ Операция отменена.',
    PREVIEW_HEADER: '👆 Вот как это будет выглядеть.\n\n',
    TARGET: (target: string) => `Куда: ${target}\n`,
    CONFIRM_PROMPT: 'Отправлять? (напиши *да* или *нет*)',
    TARGET_TEST: 'Только ТЕБЕ (тихо)',
    TARGET_ALL: 'ВСЕМ пользователям (со звуком)',
    TEST_SUCCESS: '✅ Тест успешен! Сообщение отправлено тебе в личку (без звука).',
    TEST_FAIL: (err: any) => `❌ Ошибка теста: ${err}`,
    STARTING: '🚀 Начинаю рассылку... Это может занять время.',
    SUMMARY: (total: number, success: number, fail: number) =>
      `✅ Рассылка завершена!\n\nОхват: ${total}\nУспешно: ${success}\nОшибок: ${fail} (блокировали бота или удалились)`,
    ERROR_CRITICAL: '❌ Критическая ошибка при рассылке.',
    BTN_YES: ['да', '+'],
    BTN_NO: ['нет', '-'],
    INVALID_INPUT: 'Напиши "да" или "нет" (или /cancel).',
  },
};
