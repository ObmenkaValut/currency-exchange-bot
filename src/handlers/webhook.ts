/**
 * CryptoBot Webhook Handler
 */
import { Router } from 'express';
import crypto from 'crypto';
import { userBalanceService } from '../services/premium';
import { bot } from '../bot';
import { CryptoBotWebhook } from '../types/payment';
import {
    MAX_POSTS_PER_PURCHASE,
    getPostWord,
    calculateAmount,
    INVOICE_TTL,
    CLEANUP_INTERVAL,
    MAX_CACHE_SIZE,
} from '../config/constants';

// === Cache для дедуплікації ===
const processedInvoices = new Map<number, number>();

/** Видаляє найстаріші записи якщо перевищено ліміт */
const enforceLimit = <K, V>(map: Map<K, V>, max: number): void => {
    if (map.size <= max) return;
    const toDelete = Array.from(map.keys()).slice(0, map.size - max);
    toDelete.forEach((k) => map.delete(k));
    console.log(`🧹 Invoice cache: видалено ${toDelete.length} записів`);
};

// === Cleanup кожну годину ===
setInterval(() => {
    const now = Date.now();
    processedInvoices.forEach((ts, id) => {
        if (now - ts > INVOICE_TTL) processedInvoices.delete(id);
    });
    enforceLimit(processedInvoices, MAX_CACHE_SIZE);
    console.log(`🧹 Invoice cleanup: ${processedInvoices.size} cached`);
}, CLEANUP_INTERVAL);

/** Верифікація підпису CryptoBot */
const verifySignature = (body: string, sig: string, token: string): boolean => {
    const key = crypto.createHash('sha256').update(token).digest();
    const expected = crypto.createHmac('sha256', key).update(body).digest('hex');
    return sig === expected;
};

/** Створює Express router для webhook */
export function createWebhookRouter(apiToken: string): Router {
    const router = Router();

    router.post('/cryptobot', async (req, res) => {
        console.log('🔔 Webhook received');

        try {
            // 1. Перевірка підпису
            const signature = req.headers['crypto-pay-api-signature'];
            if (!signature || typeof signature !== 'string') {
                console.error('❌ Missing signature');
                return res.status(401).json({ ok: false, error: 'Missing signature' });
            }

            const bodyStr = JSON.stringify(req.body);
            if (!verifySignature(bodyStr, signature, apiToken)) {
                console.error('❌ Invalid signature');
                return res.status(401).json({ ok: false, error: 'Invalid signature' });
            }

            // 2. Парсинг webhook
            const webhook: CryptoBotWebhook = req.body;
            if (webhook.update_type !== 'invoice_paid' || webhook.payload.status !== 'paid') {
                return res.status(200).json({ ok: true });
            }

            const { invoice_id, amount, payload: payloadStr } = webhook.payload;

            // 3. Валідація invoiceId
            if (!invoice_id || !Number.isFinite(invoice_id)) {
                console.error('❌ Invalid invoiceId:', invoice_id);
                return res.status(400).json({ ok: false, error: 'Invalid invoiceId' });
            }
            const invoiceId = invoice_id;

            // 4. Захист від дублікатів
            if (processedInvoices.has(invoiceId)) {
                console.log(`⚠️ Invoice ${invoiceId} already processed`);
                return res.status(200).json({ ok: true, message: 'Already processed' });
            }

            // 5. Парсинг payload
            let payloadData: { userId?: number; count?: number };
            try {
                payloadData = JSON.parse(payloadStr);
            } catch {
                console.error('❌ Invalid payload JSON');
                return res.status(400).json({ ok: false, error: 'Invalid payload' });
            }

            const { userId, count } = payloadData;

            // 6. Валідація даних
            if (!userId || !Number.isFinite(userId) || userId <= 0) {
                console.error('❌ Invalid userId:', userId);
                return res.status(400).json({ ok: false, error: 'Invalid userId' });
            }

            if (!count || !Number.isInteger(count) || count <= 0 || count > MAX_POSTS_PER_PURCHASE) {
                console.error('❌ Invalid count:', count);
                return res.status(400).json({ ok: false, error: 'Invalid count' });
            }

            // 7. Перевірка суми
            const expected = calculateAmount(count);
            if (amount !== expected) {
                console.error(`❌ Amount mismatch: ${expected} vs ${amount}`);
                return res.status(400).json({ ok: false, error: 'Amount mismatch' });
            }

            // 8. Нарахування балансу
            processedInvoices.set(invoiceId, Date.now());
            await userBalanceService.addPaidMessages(
                userId.toString(),
                count,
                'cryptobot',
                undefined, // CryptoBot не передає username
                invoiceId
            );

            // 9. Повідомляємо юзера
            const word = getPostWord(count);
            await bot.api.sendMessage(
                userId,
                `✅ Оплата через CryptoBot успішна!\n\nДодано ${count} ${word} до балансу!\n\n📊 Перевір: /start`
            );

            console.log(`✅ Payment: user=${userId}, count=${count}, invoice=${invoiceId}`);
            res.status(200).json({ ok: true });
        } catch (error) {
            console.error('❌ Webhook error:', error);
            res.status(500).json({ ok: false, error: 'Internal error' });
        }
    });

    return router;
}
