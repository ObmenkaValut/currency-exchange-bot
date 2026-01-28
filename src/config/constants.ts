/**
 * Централізований конфіг для всього проекту
 */

// === Telegram Bot ===
export const BOT_USERNAME = 'currExchange_robot';
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;

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
