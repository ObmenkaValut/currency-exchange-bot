/** Webhook от CryptoBot при оплате инвойса */
export interface CryptoBotWebhook {
  update_id: number;
  update_type: 'invoice_paid';
  request_date: string;
  payload: {
    invoice_id: number;
    hash: string;
    currency_type: string;
    amount: string;
    paid_asset?: string;
    paid_amount?: string;
    fee_asset?: string;
    fee_amount?: string;
    pay_url: string;
    bot_invoice_url: string;
    description: string;
    status: 'paid';
    created_at: string;
    paid_at: string;
    payload: string; // JSON-строка: { userId, count }
  };
}
