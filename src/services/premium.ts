import { db } from '../config/firebase';

interface UserBalance {
  userId: string;
  username?: string;
  firstName?: string;
  paidMessages: number;
  totalSpent: number;
  totalPaidPosts: number;
  createdAt: Date;
  lastUpdate: Date;
}

interface Transaction {
  userId: string;
  username?: string;
  firstName?: string;
  type: 'purchase' | 'use' | 'admin_add' | 'admin_reset';
  amount: number;
  source: 'stars' | 'cryptobot' | 'message' | 'admin';
  invoiceId?: number;
  createdAt: Date;
  balanceSnapshot: number;
}

interface UserInfo {
  username?: string;
  firstName?: string;
}

const cache = new Map<string, UserBalance>();

/** Конвертує Firestore doc в UserBalance */
const toBalance = (id: string, data: FirebaseFirestore.DocumentData): UserBalance => ({
  userId: id,
  username: data.username,
  firstName: data.firstName,
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

  /** Додати пости (атомарно з логуванням) */
  async addPaidMessages(
    userId: string,
    count: number,
    source: Transaction['source'] = 'admin',
    info?: UserInfo,
    invoiceId?: number
  ): Promise<void> {
    if (!userId?.trim()) throw new Error('Invalid userId');
    if (!Number.isInteger(count) || count <= 0) throw new Error('Invalid count');

    const userRef = db.collection('users').doc(userId);
    const txRef = db.collection('transactions').doc();

    await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);
      const data = doc.data() || {};
      const newBalance = (data.paidMessages || 0) + count;

      // Update User
      t.set(
        userRef,
        {
          userId,
          ...(info?.username && { username: info.username }),
          ...(info?.firstName && { firstName: info.firstName }),
          paidMessages: newBalance,
          totalSpent: (data.totalSpent || 0) + count,
          totalPaidPosts: data.totalPaidPosts || 0,
          createdAt: data.createdAt || new Date(),
          lastUpdate: new Date(),
        },
        { merge: true }
      );

      // Log Transaction
      const txData: Transaction = {
        userId,
        username: info?.username || data.username,
        firstName: info?.firstName || data.firstName,
        type: 'purchase',
        amount: count,
        source,
        invoiceId,
        createdAt: new Date(),
        balanceSnapshot: newBalance,
      };
      t.set(txRef, txData);
    });

    // Sync cache
    const doc = await userRef.get();
    if (doc.exists) cache.set(userId, toBalance(userId, doc.data()!));
    console.log(`💰 User ${userId}: +${count} (Logged)`);
  },

  /** Використати 1 пост (атомарно з логуванням) */
  async usePaidMessage(userId: string, info?: UserInfo): Promise<boolean> {
    const userRef = db.collection('users').doc(userId);
    const txRef = db.collection('transactions').doc();

    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        if (!doc.exists) throw new Error('User not found');

        const data = doc.data()!;
        if ((data.paidMessages || 0) <= 0) throw new Error('No balance');

        const newBalance = data.paidMessages - 1;

        // Update User (тільки якщо передали нові дані)
        if (info?.username || info?.firstName) {
          t.set(
            userRef,
            {
              ...(info?.username && { username: info.username }),
              ...(info?.firstName && { firstName: info.firstName }),
              lastUpdate: new Date(),
            },
            { merge: true }
          );
        } else {
          t.update(userRef, {
            paidMessages: newBalance,
            totalPaidPosts: (data.totalPaidPosts || 0) + 1,
            lastUpdate: new Date(),
          });
        }

        // Fix: t.update вище вже оновило, але треба ще раз для paidMessages якщо ми в if зайшли? 
        // Ні, краще одним викликом. Перепишу логіку оновлення.

        const updateData: any = {
          paidMessages: newBalance,
          totalPaidPosts: (data.totalPaidPosts || 0) + 1,
          lastUpdate: new Date(),
        };

        if (info?.username) updateData.username = info.username;
        if (info?.firstName) updateData.firstName = info.firstName;

        t.set(userRef, updateData, { merge: true });

        // Log Transaction
        const txData: Transaction = {
          userId,
          username: info?.username || data.username,
          firstName: info?.firstName || data.firstName,
          type: 'use',
          amount: 1,
          source: 'message',
          createdAt: new Date(),
          balanceSnapshot: newBalance,
        };
        t.set(txRef, txData);
      });

      // Sync cache
      const doc = await userRef.get();
      if (doc.exists) cache.set(userId, toBalance(userId, doc.data()!));
      console.log(`📤 User ${userId}: used 1 post (Logged)`);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'No balance') return false;
      console.error('❌ Use post:', error);
      return false;
    }
  },

  /** Створити/Оновити юзера */
  async ensureUserExists(userId: string, info?: UserInfo): Promise<void> {
    const userRef = db.collection('users').doc(userId);

    try {
      // Якщо юзер вже є в кеші і дані не змінились - скіпаємо
      const cached = cache.get(userId);
      if (cached && cached.username === info?.username && cached.firstName === info?.firstName) {
        return;
      }

      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);

        if (!doc.exists) {
          const now = new Date();
          const newUser: UserBalance = {
            userId,
            username: info?.username,
            firstName: info?.firstName,
            paidMessages: 0,
            totalSpent: 0,
            totalPaidPosts: 0,
            createdAt: now,
            lastUpdate: now,
          };
          t.set(userRef, newUser);
        } else if (info) {
          // Оновлюємо актуальні дані (нікнейм міг змінитись)
          t.set(userRef, { ...info, lastUpdate: new Date() }, { merge: true });
        }
      });

      // Sync cache
      const doc = await userRef.get();
      if (doc.exists) cache.set(userId, toBalance(userId, doc.data()!));
    } catch (error) {
      console.error('❌ Ensure user:', error);
    }
  },

  /** Видалити старі транзакції (старші N днів) */
  async deleteOldTransactions(days: number): Promise<void> {
    const limitDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      const snapshot = await db
        .collection('transactions')
        .where('createdAt', '<', limitDate)
        .limit(500) // Batch limit
        .get();

      if (snapshot.empty) {
        return;
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      console.log(`🧹 Deleted ${snapshot.size} old transactions (> ${days} days)`);
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  },
};
