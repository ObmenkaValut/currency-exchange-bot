import { BOT_URL, getPostWord, getPriceCrypto, MAX_POSTS_PER_PURCHASE } from '../config/constants';

const CRYPTO_API = 'https://pay.crypt.bot/api';
const TOKEN = process.env.CRYPTO_BOT_TOKEN || '';

if (!TOKEN) console.warn('⚠️ CRYPTO_BOT_TOKEN не установлен');

interface InvoiceResponse {
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

export const cryptoBotService = {
    async createInvoice(userId: number, count: number): Promise<string | null> {
        try {
            // Валидация
            if (!userId || !Number.isInteger(userId) || userId <= 0) {
                console.error(`🚨 Invalid userId: ${userId}`);
                return null;
            }
            if (!count || !Number.isInteger(count) || count <= 0 || count > MAX_POSTS_PER_PURCHASE) {
                console.error(`🚨 Invalid count: ${count}`);
                return null;
            }

            const amount = getPriceCrypto(count).toFixed(2);
            const word = getPostWord(count);

            const params = new URLSearchParams({
                amount,
                currency_type: 'fiat',
                fiat: 'USD',
                description: `${count} ${word} в группу обмена валют`,
                payload: JSON.stringify({ userId, count }),
                paid_btn_name: 'openBot',
                paid_btn_url: BOT_URL,
            });

            const res = await fetch(`${CRYPTO_API}/createInvoice?${params}`, {
                method: 'GET',
                headers: { 'Crypto-Pay-API-Token': TOKEN },
            });

            const data = (await res.json()) as InvoiceResponse;

            if (data.ok && data.result) {
                console.log(`💎 Invoice: ${data.result.invoice_id} user=${userId} count=${count}`);
                return data.result.bot_invoice_url;
            }

            console.error(`❌ CryptoBot: ${data.error}`);
            return null;
        } catch (error) {
            console.error(`❌ CryptoBot error:`, error);
            return null;
        }
    },
};

console.log('✅ CryptoBot service ready');
