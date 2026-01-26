import admin from 'firebase-admin';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

// Використовуємо JSON файл
const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();
console.log('✅ Firebase ініціалізовано');