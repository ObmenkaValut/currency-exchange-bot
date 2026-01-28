import { UserLimit } from '../types/user';
import { getTodayDate } from '../utils/helpers';
import {
  AI_RATE_LIMIT,
  AI_RATE_WINDOW,
  CLEANUP_INTERVAL,
  FREE_DAILY_LIMIT,
  MAX_CACHE_SIZE,
} from '../config/constants';

// === In-memory кеші ===
const dailyLimits = new Map<string, UserLimit>();
const aiRateLimits = new Map<string, { count: number; resetAt: number }>();

/** Видаляє найстаріші записи якщо перевищено ліміт */
const enforceLimit = <T>(map: Map<string, T>, max: number): void => {
  if (map.size <= max) return;
  const toDelete = Array.from(map.keys()).slice(0, map.size - max);
  toDelete.forEach((k) => map.delete(k));
  console.log(`🧹 Cache overflow: видалено ${toDelete.length} записів`);
};

// === Cleanup кожну годину ===
setInterval(() => {
  const today = getTodayDate();
  const now = Date.now();

  dailyLimits.forEach((v, k) => v.date !== today && dailyLimits.delete(k));
  aiRateLimits.forEach((v, k) => v.resetAt < now && aiRateLimits.delete(k));

  enforceLimit(dailyLimits, MAX_CACHE_SIZE);
  enforceLimit(aiRateLimits, MAX_CACHE_SIZE);

  console.log(`🧹 Cleanup: daily=${dailyLimits.size}, ai=${aiRateLimits.size}`);
}, CLEANUP_INTERVAL);

// === Service ===
export const limiterService = {
  checkLimit(userId: string): boolean {
    const today = getTodayDate();
    const limit = dailyLimits.get(userId);
    return !limit || limit.date !== today || limit.count < FREE_DAILY_LIMIT;
  },

  getCount(userId: string): number {
    const today = getTodayDate();
    const limit = dailyLimits.get(userId);
    return limit?.date === today ? limit.count : 0;
  },

  reset(userId: string): void {
    dailyLimits.delete(userId);
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

    if (!limit || limit.resetAt < now) {
      aiRateLimits.set(userId, { count: 1, resetAt: now + AI_RATE_WINDOW });
      return true;
    }

    if (limit.count >= AI_RATE_LIMIT) return false;
    limit.count++;
    return true;
  },
};
