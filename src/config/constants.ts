/**
 * Централізований конфіг для всього проекту
 * Змінюй значення тут - вони застосуються скрізь
 */

// Telegram Bot
export const BOT_USERNAME = 'currExchange_robot';
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;

// Pricing
export const PRICE_PER_POST = 0.01;  // USD за пост

// Limits
export const MAX_POSTS_PER_PURCHASE = 1000; // ???????
export const FREE_POSTS_LIMIT = 3; // ???????

// Package options (кількість постів)
export const PACKAGE_OPTIONS = [1, 3, 5, 10, 20, 50, 100] as const; // ???????

/**
 * Отримати правильне слово "пост/пости/постів"
 */
export function getPostWord(count: number): string {
    if (count === 1) return 'пост';
    if (count < 5) return 'пости';
    return 'постів';
}

/**
 * Розрахувати суму в USD
 */
export function calculateAmount(count: number): string {
    return (count * PRICE_PER_POST).toFixed(2);
}

/**
 * Форматувати ціну для відображення
 */
export function formatPrice(count: number): string {
    return `$${calculateAmount(count)}`;
}
