import admin from 'firebase-admin';

const REQUIRED = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const missing = REQUIRED.filter((v) => !process.env[v]);

if (missing.length > 0) throw new Error(`❌ Missing: ${missing.join(', ')}`);

// Parse private key
let privateKey = process.env.FIREBASE_PRIVATE_KEY!;
privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey,
    }),
  });
  console.log('✅ Firebase initialized');
}

export const db = admin.firestore();