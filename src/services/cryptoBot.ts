import dotenv from 'dotenv';
import { BOT_URL, getPostWord, calculateAmount } from '../config/constants';

dotenv.config();

if (!process.env.CRYPTO_BOT_TOKEN) {
    throw new Error('❌ CRYPTO_BOT_TOKEN не знайдено в .env');
}

const CRYPTO_BOT_API = 'https://pay.crypt.bot/api';
const API_TOKEN = process.env.CRYPTO_BOT_TOKEN;

interface CryptoBotInvoiceResponse {
    ok: boolean;
    result?: {
        invoice_id: number;
        hash: string;
        currency_type: string;
        amount: string;
        pay_url: string;
        bot_invoice_url: string;
        status: 'active' | 'paid' | 'expired';
    };
    error?: string;
}

/**
 * Сервіс для роботи з CryptoBot API
 */
export const cryptoBotService = {
    async createInvoice(userId: number, count: number): Promise<string | null> {
        try {
            const amount = calculateAmount(count);
            const postWord = getPostWord(count);
            const description = `${count} ${postWord} у групу обміну валют`;
            const payload = JSON.stringify({ userId, count });

            const params = new URLSearchParams({
                amount,
                currency_type: 'fiat',
                fiat: 'USD',
                description,
                payload,
                paid_btn_name: 'openBot',
                paid_btn_url: BOT_URL,
            });

            const url = `${CRYPTO_BOT_API}/createInvoice?${params.toString()}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Crypto-Pay-API-Token': API_TOKEN,
                },
            });

            const data = await response.json() as CryptoBotInvoiceResponse;

            if (data.ok && data.result) {
                console.log(`💎 CryptoBot інвойс створено: ${data.result.invoice_id} для ${userId}`);
                return data.result.bot_invoice_url; // URL для оплати в Telegram
            } else {
                console.error('❌ Помилка CryptoBot:', data.error);
                return null;
            }
        } catch (error) {
            console.error('❌ Помилка createInvoice:', error);
            return null;
        }
    },

    /**
     * Перевірити статус інвойсу (опціонально, для ручної перевірки)
     * @param invoiceId - ID інвойсу
     */
    async getInvoiceStatus(invoiceId: number): Promise<string | null> {
        try {
            const params = new URLSearchParams({
                invoice_ids: invoiceId.toString(),
            });

            const url = `${CRYPTO_BOT_API}/getInvoices?${params.toString()}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Crypto-Pay-API-Token': API_TOKEN,
                },
            });

            const data: any = await response.json();

            if (data.ok && data.result?.items?.[0]) {
                return data.result.items[0].status;
            }

            return null;
        } catch (error) {
            console.error('❌ Помилка getInvoiceStatus:', error);
            return null;
        }
    },
};

console.log('✅ CryptoBot service ініціалізовано');
