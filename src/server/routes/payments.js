const express = require('express');
const router = express.Router();
const repo = require('../../db/repository');
const catalogService = require('../../services/catalogService');
const config = require('../../config');

/**
 * Click to'lov tizimi integratsiyasi
 * (Prepare va Complete bosqichlari)
 */
router.post('/click/prepare', (req, res) => {
  const { click_trans_id, service_id, click_paydoc_id, merchant_trans_id, amount, action, error, sign_time, sign_string } = req.body;

  console.log('[Click Prepare]', req.body);
  const userId = Number(merchant_trans_id);

  if (!userId) {
    return res.json({ error: -5, error_note: 'Foydalanuvchi topilmadi' });
  }

  // To'lovni kutish holatida yozib qo'yish
  const tx = repo.createPendingDeposit(userId, Number(amount), 'click', `Click trans: ${click_trans_id}`);

  return res.json({
    click_trans_id,
    merchant_trans_id,
    merchant_prepare_id: tx.id,
    error: 0,
    error_note: 'Success'
  });
});

router.post('/click/complete', async (req, res) => {
  const { click_trans_id, merchant_prepare_id, error } = req.body;
  console.log('[Click Complete]', req.body);

  if (error < 0) {
    return res.json({ error: -9, error_note: 'Tranzaksiya bekor qilingan' });
  }

  try {
    const updatedTx = repo.confirmDeposit(Number(merchant_prepare_id));

    // Foydalanuvchiga Telegram orqali xabar yuborish
    if (req.bot) {
      try {
        await req.bot.telegram.sendMessage(
          updatedTx.user_id,
          `⚡️ <b>Click orqali hisobingiz to'ldirildi!</b>\n\n` +
          `Qo'shilgan summa: <b>+${catalogService.formatUzs(updatedTx.amount_uzs)}</b>\n\n` +
          `<i>Xaridlar uchun «🛍 Katalog & Obunalar» bo'limiga o'tishingiz mumkin.</i>`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}
    }

    return res.json({
      click_trans_id,
      merchant_trans_id: updatedTx.user_id,
      merchant_confirm_id: updatedTx.id,
      error: 0,
      error_note: 'Success'
    });
  } catch (err) {
    console.error('[Click Complete Error]', err);
    return res.json({ error: -8, error_note: err.message });
  }
});

/**
 * Payme JSON-RPC integratsiyasi skeleti
 */
router.post('/payme', async (req, res) => {
  const { method, params } = req.body;
  console.log('[Payme Request]', method, params);

  // Payme standart JSON-RPC usullari (CheckPerformTransaction, CreateTransaction, PerformTransaction)
  // Bu yerda o'z Payme Merchant kalitlaringiz bilan to'liq avtomatlashtiriladi
  res.json({
    jsonrpc: '2.0',
    result: { status: 'acknowledged' },
    id: req.body.id
  });
});

module.exports = router;
