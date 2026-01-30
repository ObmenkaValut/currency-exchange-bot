import { UserLimit } from '../types/user';
import { getTodayDate, enforceMapLimit } from '../utils/helpers';
import {
  AI_RATE_WINDOW,
  CLEANUP_INTERVAL,
  MAX_CACHE_SIZE,
} from '../config/constants';

// === In-memory кэши ===
const dailyLimits = new Map<string, UserLimit>();
const aiRateLimits = new Map<string, { count: number; resetAt: number }>();
// Spam Protection
const spamLog = new Map<string, number[]>(); // userId -> [timestamp1, timestamp2...]
const bannedUsers = new Map<string, number>(); // userId -> banExpiresAt

// === Cleanup каждый час ===
setInterval(() => {
  const today = getTodayDate();
  const now = Date.now();

  dailyLimits.forEach((v, k) => v.date !== today && dailyLimits.delete(k));
  aiRateLimits.forEach((v, k) => v.resetAt < now && aiRateLimits.delete(k));

  enforceMapLimit(dailyLimits, MAX_CACHE_SIZE);
  enforceMapLimit(aiRateLimits, MAX_CACHE_SIZE);
  // Optional: spamLog cleans itself on access, bannedUsers cleans on access.
  // But we can limit size to avoid memory leak if many users spam
  if (spamLog.size > MAX_CACHE_SIZE) spamLog.clear();
  if (bannedUsers.size > MAX_CACHE_SIZE) bannedUsers.clear();

  console.log(`🧹 Cleanup: daily=${dailyLimits.size}, ai=${aiRateLimits.size}`);
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

    limit.count++;
    return true;
  },

  checkSpam(userId: string): { isBanned: boolean; banExpiresAt?: number } {
    const now = Date.now();

    // 1. Check if already banned
    const banExpires = bannedUsers.get(userId);
    if (banExpires) {
      if (banExpires > now) {
        return { isBanned: true, banExpiresAt: banExpires };
      } else {
        bannedUsers.delete(userId); // Ban expired
      }
    }

    // 2. Update spam logs
    let logs = spamLog.get(userId) || [];
    // Clean old logs (> 10 sec)
    logs = logs.filter(time => now - time < 10000);
    logs.push(now);

    // 3. Check for spam: > 10 messages in 10 seconds
    if (logs.length > 10) {
      // Ban for 3 minutes
      const banTime = now + 3 * 60 * 1000;
      bannedUsers.set(userId, banTime);
      spamLog.delete(userId); // Reset logs
      return { isBanned: true, banExpiresAt: banTime };
    }

    spamLog.set(userId, logs);
    return { isBanned: false };
  },
};
