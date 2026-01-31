import { db } from '../config/firebase';

interface UserBalance {
  userId: string;
  username?: string;
  firstName?: string;
  paidMessages: number;
  totalSpent: number;
  totalPaidPosts: number;
  lastPostDate?: Date;
  createdAt: Date;
  lastUpdate: Date;
  totalPayStars: number;
  totalPayCrypto: number;
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

/** Helper safely converts Firestore Timestamp / Date / String to Date */
const toDate = (val: any): Date => {
  if (!val) return new Date();
  if (typeof val.toDate === 'function') return val.toDate(); // Firestore Timestamp
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  return new Date();
};

/** Конвертирует Firestore doc в UserBalance */
const toBalance = (id: string, data: FirebaseFirestore.DocumentData): UserBalance => ({
  userId: id,
  username: data.username,
  firstName: data.firstName,
  paidMessages: data.paidMessages || 0,
  totalSpent: data.totalSpent || 0,
  totalPaidPosts: data.totalPaidPosts || 0,
  lastPostDate: data.lastPostDate ? toDate(data.lastPostDate) : undefined,
  createdAt: toDate(data.createdAt),
  lastUpdate: toDate(data.lastUpdate),
  totalPayStars: data.totalPayStars || 0,
  totalPayCrypto: data.totalPayCrypto || 0,
});

export const userBalanceService = {
  /** Загрузить все балансы при старте */
  async loadAllBalances(): Promise<void> {
    try {
      const snapshot = await db.collection('users').get();
      snapshot.forEach((doc) => cache.set(doc.id, toBalance(doc.id, doc.data())));
      console.log(`✅ Загружено ${cache.size} пользователей`);
    } catch (error) {
      console.error('❌ Load error:', error);
    }
  },

  /** Получить полный профиль */
  async getUserProfile(userId: string): Promise<UserBalance> {
    // Try to ensure cache is populated first via getPaidBalance logic or similar
    // But for simplicity, we'll try cache then DB directly
    const cached = cache.get(userId);
    if (cached) return cached;

    try {
      const doc = await db.collection('users').doc(userId).get();
      if (doc.exists) {
        const balance = toBalance(userId, doc.data()!);
        cache.set(userId, balance);
        return balance;
      }
    } catch (error) {
      console.error('❌ Get profile:', error);
    }

    // Return default if not found
    return {
      userId,
      paidMessages: 0,
      totalSpent: 0,
      totalPaidPosts: 0,
      totalPayStars: 0,
      totalPayCrypto: 0,
      createdAt: new Date(),
      lastUpdate: new Date(),
    };
  },

  /** Получить баланс */
  async getPaidBalance(userId: string): Promise<number> {
    const profile = await this.getUserProfile(userId);
    return profile.paidMessages;
  },



  /** Добавить посты (атомарно с логированием) */
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

      const currentStars = data.totalPayStars || 0;
      const currentCrypto = data.totalPayCrypto || 0;

      let newStars = currentStars;
      let newCrypto = currentCrypto;

      if (source === 'stars') newStars += count;
      if (source === 'cryptobot') newCrypto += count;

      // Update User
      t.set(
        userRef,
        {
          userId,
          ...(info?.username && { username: info.username }),
          ...(info?.firstName && { firstName: info.firstName }),

          paidMessages: newBalance,
          // Requirement: общее количество купленных постов за всех время которое суммирует 1 и 2 пункт
          totalSpent: newStars + newCrypto,
          totalPaidPosts: data.totalPaidPosts || 0,
          totalPayStars: newStars,
          totalPayCrypto: newCrypto,
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

  /** Использовать 1 пост (атомарно с логированием) */
  async usePaidMessage(userId: string, info?: UserInfo): Promise<{ success: boolean; remaining: number }> {
    const userRef = db.collection('users').doc(userId);
    const txRef = db.collection('transactions').doc();
    let remaining = -1;

    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        if (!doc.exists) throw new Error('User not found');

        const data = doc.data()!;
        if ((data.paidMessages || 0) <= 0) throw new Error('No balance');

        const newBalance = data.paidMessages - 1;
        remaining = newBalance;

        const updateData: any = {
          paidMessages: newBalance,
          totalPaidPosts: (data.totalPaidPosts || 0) + 1,
          lastPostDate: new Date(),
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

      return { success: true, remaining };
    } catch (error) {
      if (error instanceof Error && error.message === 'No balance') return { success: false, remaining: 0 };
      console.error('❌ Use post:', error);
      return { success: false, remaining: 0 };
    }
  },



  /** Проверить существование пользователя и создать при необходимости */
  async ensureUser(userId: string, info?: UserInfo, forceCheck = false): Promise<void> {
    if (!userId) return;

    // 1. Проверяем кэш (если не forceCheck)
    if (!forceCheck && cache.has(userId)) {
      const cached = cache.get(userId)!;
      // Если данные изменились, обновляем (но в профиле это НЕ меняет lastPostDate)
      if (
        (info?.username && cached.username !== info.username) ||
        (info?.firstName && cached.firstName !== info.firstName)
      ) {
        // Update cache immediately
        cached.username = info.username || cached.username;
        cached.firstName = info.firstName || cached.firstName;
        // Background update to DB
        const updateData: any = { lastUpdate: new Date() };
        if (info.username !== undefined) updateData.username = info.username;
        if (info.firstName !== undefined) updateData.firstName = info.firstName;

        db.collection('users').doc(userId).set(updateData, { merge: true })
          .catch(err => console.error('❌ Background update error:', err));
      }
      return;
    }

    // Если forceCheck и юзер был в кэше, удалим временно, чтобы логика ниже отработала "честно"
    // Но осторожно: если мы просто удалим, а в БД он есть, мы его не пересоздадим (см. ниже логику !doc.exists)
    // Поэтому просто идем дальше к чтению из БД.

    const userRef = db.collection('users').doc(userId);

    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);

        if (!doc.exists) {
          // Создаем нового
          const newUser: UserBalance = {
            userId,
            username: info?.username,
            firstName: info?.firstName,
            paidMessages: 0,
            totalSpent: 0,
            totalPaidPosts: 0,
            totalPayStars: 0,
            totalPayCrypto: 0,
            createdAt: new Date(),
            lastUpdate: new Date(),
            // lastPostDate НЕ ставим, чтобы в профиле было "—"
          };

          // Remove undefined keys no longer needed because ignoreUndefinedProperties: true
          // JSON.parse(JSON.stringify(newUser)) was causing Date to string conversion issue!
          t.set(userRef, newUser);
          console.log(`👤 New User Created: ${userId}`);
        } else {
          // Если существует (но нет в кэше) - добавляем в кэш + обновляем инфо
          const data = doc.data()!;
          if (
            (info?.username && data.username !== info.username) ||
            (info?.firstName && data.firstName !== info.firstName)
          ) {
            t.set(userRef, {
              username: info?.username || data.username,
              firstName: info?.firstName || data.firstName,
              lastUpdate: new Date()
            }, { merge: true });
          }
        }
      });

      // Refresh cache
      const finalDoc = await userRef.get();
      if (finalDoc.exists) {
        cache.set(userId, toBalance(userId, finalDoc.data()!));
      }

    } catch (error) {
      console.error('❌ ensureUser error:', error);
    }
  },

  /** Удалить старые транзакции (старше N дней) */
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
