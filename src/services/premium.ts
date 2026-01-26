import { db } from '../config/firebase';
import { PremiumUser } from '../types/user';
import { addDays } from '../utils/helpers';
import { CONSTANTS } from '../utils/constants';

// Кеш premium користувачів
const premiumCache = new Set<string>();

export const premiumService = {
  // Завантажити premium юзерів при старті
  async loadPremiumUsers(): Promise<void> {
    try {
      const snapshot = await db
        .collection('premiumUsers')
        .where('isPremium', '==', true)
        .get();

      const now = new Date();
      snapshot.forEach((doc) => {
        const data = doc.data() as PremiumUser;
        // Перевіряємо expiresAt в коді, а не в запиті (щоб уникнути composite index)
        if (data.expiresAt) {
          const expiryDate = data.expiresAt instanceof Date
            ? data.expiresAt
            : data.expiresAt.toDate();

          if (expiryDate > now) {
            premiumCache.add(doc.id);
          }
        }
      });

      console.log(`✅ Завантажено ${premiumCache.size} premium користувачів`);
    } catch (error) {
      console.error('❌ Помилка завантаження premium:', error);
      // Якщо помилка - продовжуємо роботу без premium користувачів
    }
  },

  // Перевірка чи юзер premium
  isPremium(userId: string): boolean {
    return premiumCache.has(userId.toString());
  },

  // Додати premium
  async addPremium(userId: string): Promise<void> {
    const now = new Date();
    const expiresAt = addDays(now, CONSTANTS.PREMIUM_DURATION_DAYS);

    const userData = {
      userId: userId.toString(),
      isPremium: true,
      paidAt: now,
      expiresAt: expiresAt,
    };

    await db.collection('premiumUsers').doc(userId.toString()).set(userData);
    premiumCache.add(userId.toString());

    console.log(`✅ Premium додано для ${userId} до ${expiresAt.toLocaleDateString()}`);
  },

  // Видалити premium
  removePremium(userId: string): void {
    premiumCache.delete(userId.toString());
  },
};
