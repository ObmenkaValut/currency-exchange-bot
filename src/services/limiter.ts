import { UserLimit } from '../types/user';
import { getTodayDate, enforceMapLimit } from '../utils/helpers';
import {
  AI_RATE_WINDOW,
  CLEANUP_INTERVAL,
  MAX_CACHE_SIZE,
} from '../config/constants';

// === Константы для антиспам защиты ===
const SPAM_WINDOW_MS = 10 * 1000; // 10 секунд
const SPAM_MESSAGE_THRESHOLD = 10; // Максимум сообщений в окне
const SPAM_BAN_DURATION_MS = 3 * 60 * 1000; // Бан на 3 минуты
const AI_MAX_REQUESTS_PER_WINDOW = 1; // 1 запрос к AI в окне

// === In-memory кэши ===
const dailyLimits = new Map<string, UserLimit>();
const aiRateLimits = new Map<string, { count: number; resetAt: number }>();
// Антиспам защита
const spamLog = new Map<string, number[]>(); // userId -> [timestamp1, timestamp2...]
const bannedUsers = new Map<string, number>(); // userId -> banExpiresAt

// === Автоматическая очистка каждый час ===
setInterval(() => {
  const today = getTodayDate();
  const now = Date.now();

  // Удаляем устаревшие записи
  dailyLimits.forEach((v, k) => v.date !== today && dailyLimits.delete(k));
  aiRateLimits.forEach((v, k) => v.resetAt < now && aiRateLimits.delete(k));

  // Применяем лимит размера кэша
  enforceMapLimit(dailyLimits, MAX_CACHE_SIZE);
  enforceMapLimit(aiRateLimits, MAX_CACHE_SIZE);

  // Защита от утечек памяти при массовом спаме
  if (spamLog.size > MAX_CACHE_SIZE) spamLog.clear();
  if (bannedUsers.size > MAX_CACHE_SIZE) bannedUsers.clear();

  console.log(`📊 Статус кэша (после проверки): daily=${dailyLimits.size}, ai=${aiRateLimits.size}`);
}, CLEANUP_INTERVAL);

// === Service ===
export const limiterService = {
  getCount(userId: string): number {
    const today = getTodayDate();
    const limit = dailyLimits.get(userId);
    return limit?.date === today ? limit.count : 0;
  },

  reset(userId: string): void {
    dailyLimits.delete(userId);
  },

  resetAll(): void {
    const count = dailyLimits.size;
    dailyLimits.clear();
    console.log(`🔄 Принудительный сброс всех лимитов: ${count} пользователей`);
  },

  increment(userId: string): void {
    const today = getTodayDate();
    const limit = dailyLimits.get(userId);

    if (!limit || limit.date !== today) {
      dailyLimits.set(userId, { count: 1, date: today });
    } else {
      limit.count++;
    }
  },

  checkAiRateLimit(userId: string): boolean {
    const now = Date.now();
    const limit = aiRateLimits.get(userId);

    // Если нет записи или окно истекло - разрешаем
    if (!limit || limit.resetAt < now) {
      aiRateLimits.set(userId, { count: 1, resetAt: now + AI_RATE_WINDOW });
      return true;
    }

    // ИСПРАВЛЕНИЕ: проверяем лимит запросов
    if (limit.count >= AI_MAX_REQUESTS_PER_WINDOW) {
      return false; // Превышен лимит
    }

    limit.count++;
    return true;
  },

  checkSpam(userId: string): { isBanned: boolean; banExpiresAt?: number } {
    const now = Date.now();

    // 1. Проверяем, не забанен ли пользователь
    const banExpires = bannedUsers.get(userId);
    if (banExpires) {
      if (banExpires > now) {
        return { isBanned: true, banExpiresAt: banExpires };
      }
      // Бан истек - удаляем
      bannedUsers.delete(userId);
    }

    // 2. Обновляем историю сообщений
    let logs = spamLog.get(userId) || [];
    // Удаляем старые записи (за пределами окна)
    logs = logs.filter(time => now - time < SPAM_WINDOW_MS);
    logs.push(now);

    // 3. Проверяем на спам
    if (logs.length > SPAM_MESSAGE_THRESHOLD) {
      const banTime = now + SPAM_BAN_DURATION_MS;
      bannedUsers.set(userId, banTime);
      spamLog.delete(userId); // Очищаем историю
      return { isBanned: true, banExpiresAt: banTime };
    }

    spamLog.set(userId, logs);
    return { isBanned: false };
  },
};
