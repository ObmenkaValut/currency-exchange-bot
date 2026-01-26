export interface PremiumUser {
  userId: string;
  isPremium: boolean;
  paidAt: Date | FirebaseFirestore.Timestamp;
  expiresAt: Date | FirebaseFirestore.Timestamp;
}


export interface UserLimit {
  count: number;
  date: string; // YYYY-MM-DD
}
