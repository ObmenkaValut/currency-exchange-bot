import { UserLimit } from '../types/user';
import { getTodayDate } from '../utils/helpers';

// In-memory кеш лімітів
const dailyLimits = new Map<string, UserLimit>();

export const limiterService = {
  // Перевірка чи можна постити
  checkLimit(userId: string): boolean {
    const today = getTodayDate();
    const userKey = userId.toString();
    const userLimit = dailyLimits.get(userKey);

    if (!userLimit || userLimit.date !== today) {
      // Новий день або перший месседж
      dailyLimits.set(userKey, { count: 1, date: today });
      return true;
    }

    if (userLimit.count >= 3) {
      return false; // Ліміт перевищено
    }

    // Інкрементуємо
    userLimit.count++;
    return true;
  },

  // Отримати поточну кількість
  getCount(userId: string): number {
    const today = getTodayDate();
    const userLimit = dailyLimits.get(userId.toString());

    if (!userLimit || userLimit.date !== today) {
      return 0;
    }

    return userLimit.count;
  },

  // Скинути ліміт
  reset(userId: string): void {
    dailyLimits.delete(userId.toString());
  },
};
