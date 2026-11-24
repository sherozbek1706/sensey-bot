const config = require('../config');
const catalogService = require('./catalogService');
const smmService = require('./smmService');

/**
 * Xaridor ismini qisman yashirib chiroyli formatlash (Maxfiylik uchun)
 * Masalan: "Ali" -> "A**", "Sherozbek" -> "Sh*****"
 */
function maskName(name) {
  if (!name) return 'Foydalanuvchi';
  const clean = name.trim();
  if (clean.length <= 2) return clean[0] + '*';
  return clean.substring(0, 2) + '*'.repeat(Math.min(clean.length - 2, 5));
}

/**
 * Sotuvlar kanaliga har bir xarid haqida chiroyli bildirishnoma yuborish
 */
async function notifySalesChannel(bot, order) {
  if (!config.salesChannelId || !bot) return;

  try {
    let text = '';
    const dateStr = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
    const maskedUser = maskName(order.customerName);

    if (order.type === 'ai') {
      text = `🎉 <b>Yangi xarid amalga oshirildi!</b>\n\n` +
        `📦 <b>Mahsulot:</b> ${order.serviceName}\n` +
        `💰 <b>Narxi:</b> ${catalogService.formatUzs(order.totalUzs)}\n` +
        `🔢 <b>Buyurtma kodi:</b> <code>${order.orderCode}</code>\n` +
        `👤 <b>Xaridor:</b> ${maskedUser}\n` +
        `⏱ <b>Vaqti:</b> ${dateStr}\n\n` +
        `⚡️ <i>Litsenziya 1 soniyada avtomatik yetkazildi.</i>\n` +
        `🤖 <b>Xarid qilish uchun:</b> @senseyboybot`;
    } else if (order.type === 'smm') {
      text = `🚀 <b>Yangi SMM Nakrutka buyurtmasi!</b>\n\n` +
        `📦 <b>Xizmat:</b> ${order.serviceName}\n` +
        `🔢 <b>Miqdori:</b> ${Number(order.quantity).toLocaleString()} dona\n` +
        `💰 <b>Narxi:</b> ${smmService.formatUzs(order.totalUzs)}\n` +
        `🔢 <b>Buyurtma kodi:</b> <code>${order.orderCode}</code>\n` +
        `👤 <b>Buyurtmachi:</b> ${maskedUser}\n` +
        `⏱ <b>Vaqti:</b> ${dateStr}\n\n` +
        `⚡️ <i>Buyurtma qabul qilindi va ijro etilmoqda.</i>\n` +
        `🤖 <b>Buyurtma berish uchun:</b> @senseyboybot`;
    }

    if (text) {
      await bot.telegram.sendMessage(config.salesChannelId, text, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.warn(`[SalesChannelNotifier] Xabar yuborishda xatolik (${config.salesChannelId}):`, err.message);
  }
}

module.exports = { notifySalesChannel };
