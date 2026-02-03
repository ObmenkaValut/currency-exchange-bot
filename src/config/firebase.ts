import admin from 'firebase-admin';

const REQUIRED_ENV_VARS = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

if (missing.length > 0) throw new Error(`❌ Отсутствуют переменные окружения Firebase: ${missing.join(', ')}`);


// Парсинг приватного ключа
const privateKey = process.env.FIREBASE_PRIVATE_KEY!
  .replace(/^"|"$/g, '')  // Убрать кавычки
  .replace(/\\n/g, '\n');   // Заменить escaped \n

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey,
      }),
    });
    console.log('✅ Firebase инициализирован');
  } catch (error) {
    console.error('❌ Ошибка инициализации Firebase:', error instanceof Error ? error.message : error);
    throw new Error('Не удалось инициализировать Firebase');
  }
}

export const db = admin.firestore();
// Игнорировать undefined поля для совместимости с Firestore
db.settings({ ignoreUndefinedProperties: true });