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

interface CreateInvoicePayload {
    amount: string;
    currency_type: 'fiat';
    fiat: 'USD';
    description: string;
    payload: string;
    paid_btn_name: 'openBot';
    paid_btn_url: string;
}

export const cryptoBotService = {
    async createInvoice(userId: number, count: number): Promise<string | null> {
        try {
            // Валидация входных параметров
            if (!userId || !Number.isInteger(userId) || userId <= 0) {
                console.error(`🚨 Некорректный userId: ${userId}`);
                return null;
            }
            if (!count || !Number.isInteger(count) || count <= 0 || count > MAX_POSTS_PER_PURCHASE) {
                console.error(`🚨 Некорректное количество постов: ${count} (макс: ${MAX_POSTS_PER_PURCHASE})`);
                return null;
            }

            const amount = getPriceCrypto(count).toFixed(2);
            const word = getPostWord(count);

            const body: CreateInvoicePayload = {
                amount,
                currency_type: 'fiat',
                fiat: 'USD',
                description: `${count} ${word} в группу обмена валют`,
                payload: JSON.stringify({ userId, count }),
                paid_btn_name: 'openBot',
                paid_btn_url: BOT_URL,
            };

            const res = await fetch(`${CRYPTO_API}/createInvoice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Crypto-Pay-API-Token': TOKEN,
                },
                body: JSON.stringify(body),
            });

            const data = (await res.json()) as InvoiceResponse;

            if (data.ok && data.result) {
                console.log(`💎 Инвойс создан: ${data.result.invoice_id} (user=${userId}, count=${count})`);
                return data.result.bot_invoice_url;
            }

            console.error(`❌ Ошибка CryptoBot API: ${data.error || 'неизвестная ошибка'}`);
            return null;
        } catch (error) {
            console.error(`❌ Ошибка при создании инвойса:`, error instanceof Error ? error.message : error);
            return null;
        }
    },
};
