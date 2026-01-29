/**
 * Централізований конфіг для всього проекту
 */

// === Telegram Bot ===
export const BOT_USERNAME = 'currExchange_robot';
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;
export const ADMIN_IDS: number[] = [300608298]; // ID адмінів для доступу до /broadcast в приваті

// === Pricing ===
export const PRICE_PER_POST = 0.01; // USD

// === Limits ===
export const MAX_POSTS_PER_PURCHASE = 101;
export const FREE_DAILY_LIMIT = 3;
export const MAX_LENGTH_FREE = 70;
export const MAX_LENGTH_PAID = 200;

// === AI ===
export const GEMINI_MODEL = 'gemini-2.5-flash-lite';
export const AI_RATE_LIMIT = 10;
export const AI_RATE_WINDOW = 60 * 1000; // 1 хв

// === Timers ===
export const MAX_MESSAGE_AGE = 5 * 60; // 5 хв (сек)
export const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 год (мс)
export const INVOICE_TTL = 24 * 60 * 60 * 1000; // 24 год (мс)

// === Transactions ===
export const TRANSACTION_RETENTION_DAYS = 30; // 30 днів
export const TRANSACTION_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Перевіряти раз на 1 добу

// === Cache ===
export const MAX_CACHE_SIZE = 10000;

// === Helpers ===
export const getPostWord = (n: number): string =>
    n === 1 ? 'пост' : n < 5 ? 'пости' : 'постів';

export const calculateAmount = (n: number): string =>
    (n * PRICE_PER_POST).toFixed(2);

export const formatPrice = (n: number): string =>
    `$${calculateAmount(n)}`;

// === Keyboard ===
export const BUTTONS = {
    BUY: '💰 Купити пост',
    PROFILE: '👤 Профіль',
    HELP: 'ℹ️ Довідка',
    ADMIN: '👨‍💻 Адмін',
};

// 2x2 Grid Layout
export const MAIN_KEYBOARD = [
    [BUTTONS.BUY, BUTTONS.PROFILE],
    [BUTTONS.HELP, BUTTONS.ADMIN],
];

// === Messages ===
export const MESSAGES = {
    HELP: `
🤖 **Довідка**

Я допомагаю безпечно обмінюватися валютою.
• Пиши оголошення в чат
• Використовуй /start для меню
• Платні пости довші та помітніші
    `,
    ADMIN: `
👨‍💻 **Адміністратор**

З питань реклами, співпраці або проблем з ботом:
@admin_placeholder (змінити в налаштуваннях)
    `,
};
