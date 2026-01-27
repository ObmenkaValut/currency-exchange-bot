import { db } from '../config/firebase';

interface UserBalance {
  userId: string;
  paidMessages: number;
  totalSpent: number;      // Всього витрачено ⭐
  totalPaidPosts: number;  // Всього опублікованих платних постів
  createdAt: Date;
  lastUpdate: Date;
}

// In-memory кеш для швидкого доступу
const balanceCache = new Map<string, UserBalance>();

export const userBalanceService = {
  // Завантажити всі баланси при старті
  async loadAllBalances(): Promise<void> {
    try {
      const snapshot = await db.collection('users').get();

      snapshot.forEach((doc) => {
        const data = doc.data();
        balanceCache.set(doc.id, {
          userId: doc.id,
          paidMessages: data.paidMessages || 0,
          totalSpent: data.totalSpent || 0,
          totalPaidPosts: data.totalPaidPosts || 0,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastUpdate: data.lastUpdate?.toDate() || new Date(),
        });
      });

      console.log(`✅ Завантажено ${balanceCache.size} користувачів`);
    } catch (error) {
      console.error('❌ Помилка завантаження:', error);
    }
  },

  // Отримати баланс платних постів
  async getPaidBalance(userId: string): Promise<number> {
    const cached = balanceCache.get(userId);
    if (cached) {
      return cached.paidMessages;
    }

    try {
      const doc = await db.collection('users').doc(userId).get();
      if (doc.exists) {
        const data = doc.data();
        balanceCache.set(userId, {
          userId,
          paidMessages: data?.paidMessages || 0,
          totalSpent: data?.totalSpent || 0,
          totalPaidPosts: data?.totalPaidPosts || 0,
          createdAt: data?.createdAt?.toDate() || new Date(),
          lastUpdate: data?.lastUpdate?.toDate() || new Date(),
        });
        return data?.paidMessages || 0;
      }
    } catch (error) {
      console.error('❌ Помилка отримання балансу:', error);
    }

    return 0;
  },

  // Додати платні пости (АТОМАРНА ОПЕРАЦІЯ)
  async addPaidMessages(userId: string, count: number): Promise<void> {
    const userRef = db.collection('users').doc(userId);

    try {
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);
        const data = doc.data() || {};

        const current = data.paidMessages || 0;
        const currentSpent = data.totalSpent || 0;
        const createdAt = data.createdAt || new Date();
        const newBalance = current + count;

        transaction.set(userRef, {
          userId,
          paidMessages: newBalance,
          totalSpent: currentSpent + count,
          totalPaidPosts: data.totalPaidPosts || 0,
          createdAt,
          lastUpdate: new Date(),
        });

        // Оновлюємо кеш
        balanceCache.set(userId, {
          userId,
          paidMessages: newBalance,
          totalSpent: currentSpent + count,
          totalPaidPosts: data.totalPaidPosts || 0,
          createdAt: createdAt instanceof Date ? createdAt : createdAt.toDate(),
          lastUpdate: new Date(),
        });
      });

      console.log(`💰 User ${userId}: +${count} постів`);
    } catch (error) {
      console.error('❌ Помилка додавання:', error);
      throw error;
    }
  },

  // Використати 1 платний пост (АТОМАРНА ОПЕРАЦІЯ)
  async usePaidMessage(userId: string): Promise<boolean> {
    const userRef = db.collection('users').doc(userId);

    try {
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);

        if (!doc.exists) {
          throw new Error('User not found');
        }

        const data = doc.data()!;
        const current = data.paidMessages || 0;
        const currentPosts = data.totalPaidPosts || 0;

        if (current <= 0) {
          throw new Error('No balance');
        }

        transaction.update(userRef, {
          paidMessages: current - 1,
          totalPaidPosts: currentPosts + 1,
          lastUpdate: new Date(),
        });

        // Оновлюємо кеш
        const cached = balanceCache.get(userId);
        if (cached) {
          cached.paidMessages = current - 1;
          cached.totalPaidPosts = currentPosts + 1;
          cached.lastUpdate = new Date();
        }
      });

      console.log(`📤 User ${userId}: використано пост`);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'No balance') {
        return false;
      }
      console.error('❌ Помилка:', error);
      return false;
    }
  },

  // Створити користувача якщо немає
  async ensureUserExists(userId: string): Promise<void> {
    if (balanceCache.has(userId)) {
      return;
    }

    const userRef = db.collection('users').doc(userId);

    try {
      const doc = await userRef.get();

      if (doc.exists) {
        // Юзер є - завантажуємо в кеш
        const data = doc.data()!;
        balanceCache.set(userId, {
          userId,
          paidMessages: data.paidMessages || 0,
          totalSpent: data.totalSpent || 0,
          totalPaidPosts: data.totalPaidPosts || 0,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastUpdate: data.lastUpdate?.toDate() || new Date(),
        });
      } else {
        // Юзера немає - створюємо нового
        const now = new Date();
        await userRef.set({
          userId,
          paidMessages: 0,
          totalSpent: 0,
          totalPaidPosts: 0,
          createdAt: now,
          lastUpdate: now,
        });
        balanceCache.set(userId, {
          userId,
          paidMessages: 0,
          totalSpent: 0,
          totalPaidPosts: 0,
          createdAt: now,
          lastUpdate: now,
        });
        console.log(`🆕 User ${userId} створено`);
      }
    } catch (error) {
      console.error('❌ Помилка:', error);
    }
  },
};
