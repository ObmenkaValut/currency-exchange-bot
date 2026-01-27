/**
 * CryptoBot Webhook Handler
 * Обробляє оплати від CryptoBot з повною валідацією
 */

import { Router } from 'express';
import crypto from 'crypto';
import { userBalanceService } from '../services/premium';
import { bot } from '../bot';
import { CryptoBotWebhook } from '../types/payment';
import { MAX_POSTS_PER_PURCHASE, getPostWord, calculateAmount } from '../config/constants';

// Захист від дублікатів (зберігаємо оброблені інвойси)
const processedInvoices = new Set<number>();

/**
 * Верифікує підпис webhook від CryptoBot
 */
function verifySignature(body: string, signature: string, token: string): boolean {
    const secretKey = crypto.createHash('sha256').update(token).digest();
    const expectedSignature = crypto.createHmac('sha256', secretKey).update(body).digest('hex');
    return signature === expectedSignature;
}

/**
 * Створює Express router для webhook
 */
export function createWebhookRouter(apiToken: string): Router {
    const router = Router();

    router.post('/cryptobot', async (req, res) => {
        console.log('🔔 Webhook received');

        try {
            // 1. Перевірка підпису
            const signature = req.headers['crypto-pay-api-signature'] as string;
            const bodyString = JSON.stringify(req.body);

            if (!verifySignature(bodyString, signature, apiToken)) {
                console.error('❌ INVALID SIGNATURE!');
                return res.status(401).json({ ok: false, error: 'Invalid signature' });
            }

            const webhook: CryptoBotWebhook = req.body;

            // Обробляємо тільки оплачені інвойси
            if (webhook.update_type !== 'invoice_paid' || webhook.payload.status !== 'paid') {
                return res.status(200).json({ ok: true });
            }

            const invoiceId = webhook.payload.invoice_id;

            // 2. Захист від дублікатів
            if (processedInvoices.has(invoiceId)) {
                console.log(`⚠️ Invoice ${invoiceId} already processed`);
                return res.status(200).json({ ok: true, message: 'Already processed' });
            }

            // 3. Парсимо та валідуємо payload
            let payloadData;
            try {
                payloadData = JSON.parse(webhook.payload.payload);
            } catch {
                console.error('❌ Invalid payload JSON');
                return res.status(400).json({ ok: false, error: 'Invalid payload' });
            }

            const { userId, count } = payloadData;

            // 4. Валідація даних
            if (!userId || typeof userId !== 'number' || userId <= 0) {
                console.error('❌ Invalid userId:', userId);
                return res.status(400).json({ ok: false, error: 'Invalid userId' });
            }

            if (!count || typeof count !== 'number' || count <= 0 ||
                count > MAX_POSTS_PER_PURCHASE || !Number.isInteger(count)) {
                console.error('❌ Invalid count:', count);
                return res.status(400).json({ ok: false, error: 'Invalid count' });
            }

            // 5. Перевірка суми
            const expectedAmount = calculateAmount(count);
            if (webhook.payload.amount !== expectedAmount) {
                console.error(`❌ Amount mismatch: expected ${expectedAmount}, got ${webhook.payload.amount}`);
                return res.status(400).json({ ok: false, error: 'Amount mismatch' });
            }

            // 6. Позначаємо як оброблений
            processedInvoices.add(invoiceId);

            // 7. Додаємо баланс
            await userBalanceService.addPaidMessages(userId.toString(), count);

            // 8. Повідомляємо користувача
            const postWord = getPostWord(count);
            await bot.api.sendMessage(
                userId,
                `✅ Оплата через CryptoBot успішна!\n\n` +
                `Додано ${count} ${postWord} до балансу!\n\n` +
                `📊 Перевір статистику: /start`
            );

            console.log(`✅ Payment: userId=${userId}, count=${count}, invoice=${invoiceId}`);
            res.status(200).json({ ok: true });

        } catch (error) {
            console.error('❌ Webhook error:', error);
            res.status(500).json({ ok: false, error: 'Internal server error' });
        }
    });

    return router;
}
