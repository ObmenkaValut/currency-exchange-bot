export interface PaymentData {
  userId: string;
  amount: number;
  currency: string;
  service: string;
  timestamp: Date;
  status: 'pending' | 'success' | 'failed';
}
