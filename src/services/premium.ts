import { db } from '../config/firebase';

interface UserBalance {
  userId: string;
  paidMessages: number;
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
          createdAt: data.createdAt?.toDate() || new Date(),
          lastUpdate: data.lastUpdate?.toDate() || new Date(),
        });
      });

      console.log(`✅ Завантажено ${balanceCache.size} користувачів з балансами`);
    } catch (error) {
      console.error('❌ Помилка завантаження балансів:', error);
    }
  },

  // Отримати баланс платних постів
  async getPaidBalance(userId: string): Promise<number> {
    // Спочатку з кешу
    const cached = balanceCache.get(userId);
    if (cached) {
      return cached.paidMessages;
    }

    // Якщо немає в кеші - з Firestore
    try {
      const doc = await db.collection('users').doc(userId).get();
      if (doc.exists) {
        const data = doc.data();
        const balance: UserBalance = {
          userId,
          paidMessages: data?.paidMessages || 0,
          createdAt: data?.createdAt?.toDate() || new Date(),
          lastUpdate: data?.lastUpdate?.toDate() || new Date(),
        };
        balanceCache.set(userId, balance);
        return balance.paidMessages;
      }
    } catch (error) {
      console.error('❌ Помилка отримання балансу:', error);
    }

    return 0;
  },

  // Додати платні пости (після оплати)
  async addPaidMessages(userId: string, count: number): Promise<void> {
    try {
      const current = await this.getPaidBalance(userId);
      const newBalance = current + count;

      await db.collection('users').doc(userId).set({
        userId,
        paidMessages: newBalance,
        lastUpdate: new Date(),
        createdAt: balanceCache.get(userId)?.createdAt || new Date(),
      });

      // Оновлюємо кеш
      balanceCache.set(userId, {
        userId,
        paidMessages: newBalance,
        createdAt: balanceCache.get(userId)?.createdAt || new Date(),
        lastUpdate: new Date(),
      });

      console.log(`💰 User ${userId}: +${count} платних постів (всього: ${newBalance})`);
    } catch (error) {
      console.error('❌ Помилка додавання балансу:', error);
      throw error;
    }
  },

  // Використати 1 платний пост
  async usePaidMessage(userId: string): Promise<boolean> {
    const current = await this.getPaidBalance(userId);

    if (current <= 0) {
      return false; // Немає платних постів
    }

    try {
      const newBalance = current - 1;

      await db.collection('users').doc(userId).set({
        userId,
        paidMessages: newBalance,
        lastUpdate: new Date(),
        createdAt: balanceCache.get(userId)?.createdAt || new Date(),
      });

      // Оновлюємо кеш
      balanceCache.set(userId, {
        userId,
        paidMessages: newBalance,
        createdAt: balanceCache.get(userId)?.createdAt || new Date(),
        lastUpdate: new Date(),
      });

      console.log(`📤 User ${userId}: використано платний пост (залишилось: ${newBalance})`);
      return true;
    } catch (error) {
      console.error('❌ Помилка використання балансу:', error);
      return false;
    }
  },
};
