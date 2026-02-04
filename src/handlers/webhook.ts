/**
 * Обработчик Webhook от CryptoBot
 * Принимает уведомления об успешных платежах и начисляет баланс пользователям
 */
import { Router } from 'express';
import crypto from 'crypto';
import { userBalanceService } from '../services/premium';
import { bot } from '../bot';
import { CryptoBotWebhook } from '../types/payment';
import {
    MAX_POSTS_PER_PURCHASE,
    getPostWord,
    getPriceCrypto,
    INVOICE_TTL,
    CLEANUP_INTERVAL,
    MAX_CACHE_SIZE,
    MESSAGES,
} from '../config/constants';
import { enforceMapLimit } from '../utils/helpers';

// === Типы ===
interface PaymentPayload {
    userId: number;
    count: number;
}

// === Кэш для предотвращения дублирования платежей ===
// Хранит invoiceId -> timestamp обработки
const processedInvoices = new Map<number, number>();

// === Автоматическая очистка устаревших инвойсов ===
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    processedInvoices.forEach((ts, id) => {
        if (now - ts > INVOICE_TTL) {
            processedInvoices.delete(id);
            cleaned++;
        }
    });

    enforceMapLimit(processedInvoices, MAX_CACHE_SIZE);

    if (cleaned > 0) {
        console.log(`🧹 Очистка инвойсов: удалено ${cleaned}, осталось ${processedInvoices.size}`);
    }
}, CLEANUP_INTERVAL);

/** Верификация HMAC подписи от CryptoBot */
const verifySignature = (body: string, sig: string, token: string): boolean => {
    const key = crypto.createHash('sha256').update(token).digest();
    const expected = crypto.createHmac('sha256', key).update(body).digest('hex');
    return sig === expected;
};

/** Валидация данных платежа */
const validatePaymentData = (
    invoiceId: number,
    userId: number,
    count: number,
    amount: string
): { valid: true } | { valid: false; error: string; status: number } => {
    // Проверка invoiceId
    if (!invoiceId || !Number.isFinite(invoiceId)) {
        console.error(`❌ Некорректный invoiceId: ${invoiceId}`);
        return { valid: false, error: 'Некорректный invoiceId', status: 400 };
    }

    // Проверка userId
    if (!userId || !Number.isFinite(userId) || userId <= 0) {
        console.error(`❌ Некорректный userId: ${userId} (invoice=${invoiceId})`);
        return { valid: false, error: 'Некорректный userId', status: 400 };
    }

    // Проверка количества
    if (!count || !Number.isInteger(count) || count <= 0 || count > MAX_POSTS_PER_PURCHASE) {
        console.error(`❌ Некорректное количество: ${count} (user=${userId}, invoice=${invoiceId})`);
        return { valid: false, error: 'Некорректное количество', status: 400 };
    }

    // Проверка суммы (сравниваем как числа, т.к. CryptoBot может вернуть "0.2" вместо "0.20")
    const expectedAmount = getPriceCrypto(count);
    const receivedAmount = parseFloat(amount);

    if (isNaN(receivedAmount) || Math.abs(receivedAmount - expectedAmount) > 0.001) {
        console.error(`❌ Несоответствие суммы: ожидалось ${expectedAmount.toFixed(2)}, получено ${amount} (user=${userId}, invoice=${invoiceId})`);
        return { valid: false, error: 'Несоответствие суммы', status: 400 };
    }

    return { valid: true };
};

/** Создает Express router для обработки webhook */
export function createWebhookRouter(apiToken: string): Router {
    const router = Router();

    router.post('/cryptobot', async (req, res) => {
        console.log('🔔 Получен webhook от CryptoBot');

        try {
            // === 1. Проверка подписи ===
            const signature = req.headers['crypto-pay-api-signature'];
            if (!signature || typeof signature !== 'string') {
                console.error('❌ Отсутствует подпись в заголовках');
                return res.status(401).json({ ok: false, error: 'Отсутствует подпись' });
            }

            // @ts-ignore - rawBody добавляется middleware Express
            const bodyStr = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);

            if (!verifySignature(bodyStr, signature, apiToken)) {
                console.error('❌ Неверная подпись webhook');
                return res.status(401).json({ ok: false, error: 'Неверная подпись' });
            }

            // === 2. Парсинг webhook ===
            const webhook: CryptoBotWebhook = req.body;

            // Игнорируем все события кроме оплаченных инвойсов
            if (webhook.update_type !== 'invoice_paid' || webhook.payload.status !== 'paid') {
                console.log(`⏭️ Пропускаем событие: type=${webhook.update_type}, status=${webhook.payload.status}`);
                return res.status(200).json({ ok: true });
            }

            const { invoice_id, amount, payload: payloadStr } = webhook.payload;

            // === 3. Защита от дублирования ===
            if (processedInvoices.has(invoice_id)) {
                console.warn(`⚠️ Инвойс ${invoice_id} уже обработан ранее`);
                return res.status(200).json({ ok: true, message: 'Уже обработан' });
            }

            // === 4. Парсинг payload ===
            let payloadData: Partial<PaymentPayload>;
            try {
                payloadData = JSON.parse(payloadStr);
            } catch (parseError) {
                console.error(`❌ Ошибка парсинга payload (invoice=${invoice_id}):`, parseError);
                return res.status(400).json({ ok: false, error: 'Некорректный JSON payload' });
            }

            const userId = payloadData.userId!;
            const count = payloadData.count!;

            // === 5. Валидация данных ===
            const validation = validatePaymentData(invoice_id, userId, count, amount);
            if (!validation.valid) {
                return res.status(validation.status).json({ ok: false, error: validation.error });
            }

            // === 6. Начисление баланса ===
            console.log(`💰 Обработка платежа: user=${userId}, count=${count}, amount=${amount}, invoice=${invoice_id}`);

            processedInvoices.set(invoice_id, Date.now());

            await userBalanceService.addPaidMessages(
                userId.toString(),
                count,
                'cryptobot',
                undefined, // CryptoBot не передает username в webhook
                invoice_id
            );

            // === 7. Уведомление пользователя ===
            const word = getPostWord(count);
            try {
                await bot.api.sendMessage(userId, MESSAGES.PAYMENT.SUCCESS(count, word));
                console.log(`✅ Платеж успешно обработан: user=${userId}, count=${count}, invoice=${invoice_id}`);
            } catch (sendError) {
                // Баланс уже начислен, ошибка отправки не критична
                console.warn(`⚠️ Не удалось отправить уведомление пользователю ${userId}:`, sendError instanceof Error ? sendError.message : sendError);
            }

            res.status(200).json({ ok: true });

        } catch (error) {
            console.error('❌ Критическая ошибка обработки webhook:', error instanceof Error ? error.message : error);
            if (error instanceof Error && error.stack) {
                console.error('Stack trace:', error.stack);
            }
            res.status(500).json({ ok: false, error: 'Внутренняя ошибка' });
        }
    });

    return router;
}
