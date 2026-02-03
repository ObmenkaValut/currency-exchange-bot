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

// === Константы ===
const TRANSACTION_BATCH_LIMIT = 500; // Максимум транзакций для удаления за раз

// === In-memory кэш пользователей ===
const cache = new Map<string, UserBalance>();

/** Безопасно конвертирует Firestore Timestamp / Date / String в Date */
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
  /** Загрузить все балансы пользователей при старте */
  async loadAllBalances(): Promise<void> {
    try {
      const snapshot = await db.collection('users').get();
      snapshot.forEach((doc) => cache.set(doc.id, toBalance(doc.id, doc.data())));
      console.log(`✅ Загружено ${cache.size} пользователей`);
    } catch (error) {
      console.error('❌ Ошибка загрузки пользователей:', error instanceof Error ? error.message : error);
    }
  },

  /** Получить полный профиль пользователя */
  async getUserProfile(userId: string): Promise<UserBalance> {
    // Сначала проверяем кэш
    const cached = cache.get(userId);
    if (cached) return cached;

    // Если нет в кэше - читаем из БД
    try {
      const doc = await db.collection('users').doc(userId).get();
      if (doc.exists) {
        const balance = toBalance(userId, doc.data()!);
        cache.set(userId, balance);
        return balance;
      }
    } catch (error) {
      console.error('❌ Ошибка получения профиля:', error instanceof Error ? error.message : error);
    }

    // Возвращаем дефолтный профиль если пользователь не найден
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



  /** Добавить посты пользователю (атомарно с логированием транзакции) */
  async addPaidMessages(
    userId: string,
    count: number,
    source: Transaction['source'] = 'admin',
    info?: UserInfo,
    invoiceId?: number
  ): Promise<void> {
    if (!userId?.trim()) throw new Error('Некорректный userId');
    if (!Number.isInteger(count) || count <= 0) throw new Error('Некорректное количество постов');

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

      // Обновляем данные пользователя
      t.set(
        userRef,
        {
          userId,
          ...(info?.username && { username: info.username }),
          ...(info?.firstName && { firstName: info.firstName }),

          paidMessages: newBalance,
          totalSpent: newStars + newCrypto, // Общее количество купленных постов за все время
          totalPaidPosts: data.totalPaidPosts || 0,
          totalPayStars: newStars,
          totalPayCrypto: newCrypto,
          createdAt: data.createdAt || new Date(),
          lastUpdate: new Date(),
        },
        { merge: true }
      );

      // Логируем транзакцию
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

    // Синхронизируем кэш
    const doc = await userRef.get();
    if (doc.exists) cache.set(userId, toBalance(userId, doc.data()!));
    console.log(`💰 Пользователь ${userId}: +${count} постов (залогировано)`);
  },

  /** Использовать 1 платный пост (атомарно с логированием транзакции) */
  async usePaidMessage(userId: string, info?: UserInfo): Promise<{ success: boolean; remaining: number }> {
    const userRef = db.collection('users').doc(userId);
    const txRef = db.collection('transactions').doc();
    let remaining = -1;

    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        if (!doc.exists) throw new Error('Пользователь не найден');

        const data = doc.data()!;
        if ((data.paidMessages || 0) <= 0) throw new Error('Нет баланса');

        const newBalance = data.paidMessages - 1;
        remaining = newBalance;

        const updateData: Partial<UserBalance> & { lastUpdate: Date } = {
          paidMessages: newBalance,
          totalPaidPosts: (data.totalPaidPosts || 0) + 1,
          lastPostDate: new Date(),
          lastUpdate: new Date(),
        };

        if (info?.username) updateData.username = info.username;
        if (info?.firstName) updateData.firstName = info.firstName;

        t.set(userRef, updateData, { merge: true });

        // Логируем транзакцию
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

      // Синхронизируем кэш
      const doc = await userRef.get();
      if (doc.exists) cache.set(userId, toBalance(userId, doc.data()!));
      console.log(`📤 Пользователь ${userId}: использован 1 пост (залогировано)`);

      return { success: true, remaining };
    } catch (error) {
      if (error instanceof Error && error.message === 'Нет баланса') return { success: false, remaining: 0 };
      console.error('❌ Ошибка использования поста:', error instanceof Error ? error.message : error);
      return { success: false, remaining: 0 };
    }
  },



  /** Проверить существование пользователя и создать при необходимости */
  async ensureUser(userId: string, info?: UserInfo, forceCheck = false): Promise<void> {
    if (!userId) return;

    // 1. Проверяем кэш (если не forceCheck)
    if (!forceCheck && cache.has(userId)) {
      const cached = cache.get(userId)!;
      // Если данные изменились, обновляем
      if (
        (info?.username && cached.username !== info.username) ||
        (info?.firstName && cached.firstName !== info.firstName)
      ) {
        // Обновляем кэш немедленно
        cached.username = info.username || cached.username;
        cached.firstName = info.firstName || cached.firstName;

        // Фоновое обновление в БД
        const updateData: Partial<UserBalance> & { lastUpdate: Date } = { lastUpdate: new Date() };
        if (info.username !== undefined) updateData.username = info.username;
        if (info.firstName !== undefined) updateData.firstName = info.firstName;

        db.collection('users').doc(userId).set(updateData, { merge: true })
          .catch(err => console.error('❌ Ошибка фонового обновления:', err instanceof Error ? err.message : err));
      }
      return;
    }

    // При forceCheck читаем напрямую из БД
    const userRef = db.collection('users').doc(userId);

    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);

        if (!doc.exists) {
          // Создаем нового пользователя
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

          t.set(userRef, newUser);
          console.log(`👤 Создан новый пользователь: ${userId}`);
        } else {
          // Пользователь существует - обновляем информацию при необходимости
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

      // Обновляем кэш
      const finalDoc = await userRef.get();
      if (finalDoc.exists) {
        cache.set(userId, toBalance(userId, finalDoc.data()!));
      }

    } catch (error) {
      console.error('❌ Ошибка ensureUser:', error instanceof Error ? error.message : error);
    }
  },

  /** Удалить старые транзакции (старше N дней) */
  async deleteOldTransactions(days: number): Promise<void> {
    const limitDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let deletedTotal = 0;

    try {
      let hasMore = true;

      // Удаляем батчами по TRANSACTION_BATCH_LIMIT записей до тех пор, пока есть старые транзакции
      while (hasMore) {
        const snapshot = await db
          .collection('transactions')
          .where('createdAt', '<', limitDate)
          .limit(TRANSACTION_BATCH_LIMIT)
          .get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        const batch = db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();

        deletedTotal += snapshot.size;

        // Если получили меньше записей, чем лимит - это была последняя порция
        if (snapshot.size < TRANSACTION_BATCH_LIMIT) {
          hasMore = false;
        }
      }

      if (deletedTotal > 0) {
        console.log(`🧹 Удалено ${deletedTotal} старых транзакций (> ${days} дней)`);
      }
    } catch (error) {
      console.error('❌ Ошибка очистки транзакций:', error instanceof Error ? error.message : error);
    }
  },
};
