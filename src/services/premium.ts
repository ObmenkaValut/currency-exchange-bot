import { db } from '../config/firebase';

interface UserBalance {
  userId: string;
  paidMessages: number;
  totalSpent: number;
  totalPaidPosts: number;
  createdAt: Date;
  lastUpdate: Date;
}

const cache = new Map<string, UserBalance>();

/** Конвертує Firestore doc в UserBalance */
const toBalance = (id: string, data: FirebaseFirestore.DocumentData): UserBalance => ({
  userId: id,
  paidMessages: data.paidMessages || 0,
  totalSpent: data.totalSpent || 0,
  totalPaidPosts: data.totalPaidPosts || 0,
  createdAt: data.createdAt?.toDate() || new Date(),
  lastUpdate: data.lastUpdate?.toDate() || new Date(),
});

export const userBalanceService = {
  /** Завантажити всі баланси при старті */
  async loadAllBalances(): Promise<void> {
    try {
      const snapshot = await db.collection('users').get();
      snapshot.forEach((doc) => cache.set(doc.id, toBalance(doc.id, doc.data())));
      console.log(`✅ Завантажено ${cache.size} користувачів`);
    } catch (error) {
      console.error('❌ Load error:', error);
    }
  },

  /** Отримати баланс */
  async getPaidBalance(userId: string): Promise<number> {
    const cached = cache.get(userId);
    if (cached) return cached.paidMessages;

    try {
      const doc = await db.collection('users').doc(userId).get();
      if (doc.exists) {
        const balance = toBalance(userId, doc.data()!);
        cache.set(userId, balance);
        return balance.paidMessages;
      }
    } catch (error) {
      console.error('❌ Get balance:', error);
    }
    return 0;
  },

  /** Додати пости (атомарно) */
  async addPaidMessages(userId: string, count: number): Promise<void> {
    if (!userId?.trim()) throw new Error('Invalid userId');
    if (!Number.isInteger(count) || count <= 0) throw new Error('Invalid count');

    const ref = db.collection('users').doc(userId);

    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const data = doc.data() || {};

      tx.set(ref, {
        userId,
        paidMessages: (data.paidMessages || 0) + count,
        totalSpent: (data.totalSpent || 0) + count,
        totalPaidPosts: data.totalPaidPosts || 0,
        createdAt: data.createdAt || new Date(),
        lastUpdate: new Date(),
      });
    });

    // Sync cache
    const doc = await ref.get();
    if (doc.exists) cache.set(userId, toBalance(userId, doc.data()!));
    console.log(`💰 User ${userId}: +${count}`);
  },

  /** Використати 1 пост (атомарно) */
  async usePaidMessage(userId: string): Promise<boolean> {
    const ref = db.collection('users').doc(userId);

    try {
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        if (!doc.exists) throw new Error('User not found');

        const data = doc.data()!;
        if ((data.paidMessages || 0) <= 0) throw new Error('No balance');

        tx.update(ref, {
          paidMessages: data.paidMessages - 1,
          totalPaidPosts: (data.totalPaidPosts || 0) + 1,
          lastUpdate: new Date(),
        });
      });

      // Sync cache
      const doc = await ref.get();
      if (doc.exists) cache.set(userId, toBalance(userId, doc.data()!));
      console.log(`📤 User ${userId}: used 1 post`);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'No balance') return false;
      console.error('❌ Use post:', error);
      return false;
    }
  },

  /** Створити юзера якщо немає */
  async ensureUserExists(userId: string): Promise<void> {
    if (cache.has(userId)) return;

    const ref = db.collection('users').doc(userId);

    try {
      const doc = await ref.get();

      if (doc.exists) {
        cache.set(userId, toBalance(userId, doc.data()!));
      } else {
        const now = new Date();
        const newUser: UserBalance = {
          userId,
          paidMessages: 0,
          totalSpent: 0,
          totalPaidPosts: 0,
          createdAt: now,
          lastUpdate: now,
        };
        await ref.set(newUser);
        cache.set(userId, newUser);
        console.log(`🆕 User ${userId} created`);
      }
    } catch (error) {
      console.error('❌ Ensure user:', error);
    }
  },
};
