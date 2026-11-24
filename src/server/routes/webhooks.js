const express = require('express');
const router = express.Router();
const config = require('../../config');

/**
 * AIVault Hub Webhook hodisalari (order.delivered, order.queued va h.k.)
 */
router.post('/reseller', async (req, res) => {
  try {
    const signature = req.headers['x-reseller-signature'];
    const payload = req.body;

    console.log('[AIVault Hub Webhook keldi]:', payload);

    // Agar webhookda buyurtma haqida ma'lumot kelsa, foydalanuvchiga xabar yuborish
    if (payload.event === 'order.delivered' && req.bot) {
      const order = payload.data;
      if (order && order.external_order_id) {
        // Kerak bo'lsa foydalanuvchini xabardor qilish
        console.log(`[Webhook] Buyurtma yetkazildi: ${order.order_id}`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Webhook error]:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
