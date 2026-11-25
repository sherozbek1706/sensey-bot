const express = require('express');
const router = express.Router();
const repo = require('../../db/repository');
const catalogService = require('../../services/catalogService');
const smmService = require('../../services/smmService');
const resellerApi = require('../../services/resellerApi');
const seenSmsApi = require('../../services/seenSmsApi');
const { notifySalesChannel } = require('../../services/channelNotifier');
const keyboards = require('../../bot/keyboards');
const config = require('../../config');
const db = require('../../db');

// Telegram WebView keshlab qolmasligi uchun har doim yangi ma'lumot qaytarish
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

/**
 * Platformani aniqlash yordamchisi
 */
function detectPlatform(category, name) {
  const text = `${category} ${name}`.toLowerCase();
  if (text.includes('telegram') || text.includes('tg') || text.includes('stars')) return 'telegram';
  if (text.includes('instagram') || text.includes('ig')) return 'instagram';
  if (text.includes('youtube') || text.includes('yt')) return 'youtube';
  if (text.includes('tiktok') || text.includes('tt')) return 'tiktok';
  return 'other';
}

/**
 * 1. Foydalanuvchi ma'lumotlari va boshlang'ich konfiguratsiya
 */
router.get('/init', (req, res) => {
  try {
    const userId = Number(req.query.user_id) || config.adminId;
    const username = req.query.username || '';
    const firstName = req.query.first_name || 'Foydalanuvchi';

    const user = repo.getOrCreateUser(userId, username, firstName);

    res.json({
      success: true,
      user: {
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name || firstName,
        balanceUzs: user.balance_uzs,
        isAdmin: user.telegram_id === config.adminId
      },
      paymentCard: {
        number: config.paymentCard.number,
        holder: config.paymentCard.holder
      },
      salesChannel: config.salesChannelId
    });
  } catch (err) {
    console.error('[WebApp Init Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. AI & Raqamli obunalar katalogi
 */
router.get('/catalog', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    const products = await catalogService.getCatalog(force);
    res.json({ success: true, products });
  } catch (err) {
    console.error('[WebApp Catalog Error]:', err);
    res.status(500).json({ error: 'Katalogni yuklashda xatolik: ' + err.message });
  }
});

/**
 * 3. SMM & Nakrutka xizmatlari ro'yxati
 */
router.get('/smm/services', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    const allServices = await smmService.getAllServices(force);
    const enriched = allServices.map(s => ({
      ...s,
      platform: detectPlatform(s.category, s.name)
    }));

    res.json({
      success: true,
      total: enriched.length,
      services: enriched
    });
  } catch (err) {
    console.error('[WebApp SMM Services Error]:', err);
    res.status(500).json({ error: 'SMM xizmatlarni yuklashda xatolik: ' + err.message });
  }
});

/**
 * 4. Foydalanuvchi buyurtmalari tarixi (AI + SMM)
 */
router.get('/orders', (req, res) => {
  try {
    const userId = Number(req.query.user_id) || config.adminId;
    let aiOrders = repo.getUserOrders(userId, 30);
    let smmOrders = repo.getUserSmmOrders(userId, 30);

    // Agar admin bo'lsa, do'kondagi barcha buyurtmalarni ham ko'ra olsin
    if (userId === config.adminId) {
      aiOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 30').all();
      smmOrders = db.prepare('SELECT * FROM smm_orders ORDER BY created_at DESC LIMIT 30').all();
    }

    res.json({
      success: true,
      aiOrders,
      smmOrders
    });
  } catch (err) {
    console.error('[WebApp Orders Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. AI obuna xarid qilish
 */
router.post('/buy/ai', async (req, res) => {
  try {
    const { userId, username, firstName, serviceId } = req.body;
    const telegramId = Number(userId);
    if (!telegramId || !serviceId) {
      return res.status(400).json({ error: 'Ma\'lumotlar to\'liq emas' });
    }

    const product = await catalogService.getProductById(serviceId);
    if (!product || !product.inStock) {
      return res.status(400).json({ error: 'Ushbu mahsulot hozirda omborda qolmagan.' });
    }

    const user = repo.getOrCreateUser(telegramId, username || '', firstName || '');
    if (user.balance_uzs < product.retailPriceUzs) {
      return res.status(400).json({
        error: `Balansingiz yetarli emas! Kerak: ${catalogService.formatUzs(product.retailPriceUzs)}, Mavjud: ${catalogService.formatUzs(user.balance_uzs)}`,
        code: 'INSUFFICIENT_BALANCE'
      });
    }

    const orderCode = `ORD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

    // 1. Balansdan yechish
    repo.adjustUserBalance(
      telegramId,
      -product.retailPriceUzs,
      'purchase',
      'internal',
      `WebApp Xarid: ${product.name} (#${orderCode})`
    );

    // 2. Reseller API orqali buyurtma berish
    let resellerResult;
    try {
      resellerResult = await resellerApi.createOrder({
        serviceId: product.serviceId,
        quantity: 1,
        externalOrderId: orderCode
      });
    } catch (apiError) {
      // Avtomatik refund
      repo.adjustUserBalance(
        telegramId,
        product.retailPriceUzs,
        'refund',
        'internal',
        `Avtomatik qaytarildi (#${orderCode}) - Xato: ${apiError.message}`
      );
      return res.status(502).json({
        error: `Provayder xatoligi sababli xarid bajarilmadi. Mablag'ingiz hisobingizga qaytarildi. (${apiError.message})`
      });
    }

    const deliveredItems = resellerResult.products || [];
    const costUsd = resellerResult.total_cost || product.wholesaleUsd;

    repo.createOrderRecord({
      orderCode,
      userId: telegramId,
      serviceId: product.serviceId,
      serviceName: product.name,
      quantity: 1,
      totalUzs: product.retailPriceUzs,
      costUsd,
      deliveredProducts: deliveredItems,
      resellerOrderId: resellerResult.order_id || ''
    });

    const updatedUser = repo.getUser(telegramId);

    // 3. Telegram orqali xaridorga va adminga xabar yuborish
    if (req.bot) {
      try {
        let deliveryText = `🎉 <b>WebApp orqali xaridingiz muvaffaqiyatli yakunlandi!</b>\n\n` +
          `📦 <b>Mahsulot:</b> ${product.name}\n` +
          `🔢 <b>Buyurtma kodi:</b> <code>${orderCode}</code>\n` +
          `💰 <b>Narxi:</b> ${catalogService.formatUzs(product.retailPriceUzs)}\n\n` +
          `🔑 <b>Litsenziya / Havola:</b>\n`;
        deliveredItems.forEach(item => {
          deliveryText += `<code>${item}</code>\n`;
        });
        await req.bot.telegram.sendMessage(telegramId, deliveryText, { parse_mode: 'HTML' });
      } catch (e) {}

      try {
        const profitUzs = product.retailPriceUzs - (costUsd * config.currency.usdToUzsRate);
        await req.bot.telegram.sendMessage(
          config.adminId,
          `💰 <b>WebApp orqali yangi AI xarid!</b>\n\n` +
          `👤 Xaridor: ${firstName || telegramId} (@${username || 'yoq'})\n` +
          `📦 Mahsulot: ${product.name}\n` +
          `💵 Narx: ${catalogService.formatUzs(product.retailPriceUzs)}\n` +
          `🚀 <b>Sof foyda:</b> ~${catalogService.formatUzs(profitUzs)}`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}

      notifySalesChannel(req.bot, {
        type: 'ai',
        orderCode,
        serviceName: product.name,
        totalUzs: product.retailPriceUzs,
        customerName: firstName || username || 'Mijoz'
      });
    }

    res.json({
      success: true,
      orderCode,
      productName: product.name,
      deliveredProducts: deliveredItems,
      newBalance: updatedUser.balance_uzs
    });
  } catch (err) {
    console.error('[WebApp Buy AI Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. SMM Nakrutka buyurtma berish
 */
router.post('/buy/smm', async (req, res) => {
  try {
    const { userId, username, firstName, serviceId, link, quantity } = req.body;
    const telegramId = Number(userId);
    const qty = Number(quantity);

    if (!telegramId || !serviceId || !link || !qty) {
      return res.status(400).json({ error: 'Barcha maydonlarni to\'ldiring' });
    }

    const service = await smmService.getServiceById(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Xizmat topilmadi' });
    }

    if (qty < service.min || qty > service.max) {
      return res.status(400).json({
        error: `Miqdor ${service.min} va ${service.max.toLocaleString()} orasida bo'lishi kerak`
      });
    }

    const pricing = smmService.calculatePrice(service, qty);
    const user = repo.getOrCreateUser(telegramId, username || '', firstName || '');

    if (user.balance_uzs < pricing.retailTotal) {
      return res.status(400).json({
        error: `Balansingiz yetarli emas! Kerak: ${smmService.formatUzs(pricing.retailTotal)}, Mavjud: ${smmService.formatUzs(user.balance_uzs)}`,
        code: 'INSUFFICIENT_BALANCE'
      });
    }

    const orderCode = `SMM-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

    // 1. Balansdan yechish
    repo.adjustUserBalance(
      telegramId,
      -pricing.retailTotal,
      'purchase',
      'internal',
      `WebApp SMM: ${service.name} (#${orderCode})`
    );

    // 2. SeenSMS API orqali yuborish
    let apiResponse;
    try {
      apiResponse = await seenSmsApi.createOrder({
        service: service.serviceId,
        link: link.trim(),
        quantity: qty
      });
    } catch (apiError) {
      repo.adjustUserBalance(
        telegramId,
        pricing.retailTotal,
        'refund',
        'internal',
        `Avtomatik qaytarildi (#${orderCode}) - Xato: ${apiError.message}`
      );
      return res.status(502).json({
        error: `Buyurtmada xatolik: ${apiError.message}. Mablag' balansingizga qaytarildi.`
      });
    }

    const seensmsOrderId = apiResponse.order;

    repo.createSmmOrderRecord({
      orderCode,
      userId: telegramId,
      seensmsOrderId,
      serviceId: service.serviceId,
      serviceName: service.name,
      targetLink: link.trim(),
      quantity: qty,
      totalUzs: pricing.retailTotal,
      costUzs: pricing.wholesaleCost,
      profitUzs: pricing.profit
    });

    const updatedUser = repo.getUser(telegramId);

    if (req.bot) {
      try {
        await req.bot.telegram.sendMessage(
          telegramId,
          `🎉 <b>WebApp orqali SMM buyurtmangiz qabul qilindi!</b>\n\n` +
          `🔢 <b>Buyurtma kodi:</b> <code>${orderCode}</code>\n` +
          `🆔 <b>SeenSMS ID:</b> <code>${seensmsOrderId}</code>\n` +
          `📦 <b>Xizmat:</b> ${service.name}\n` +
          `🔗 <b>Havola:</b> <code>${link}</code>\n` +
          `🔢 <b>Miqdor:</b> ${qty.toLocaleString()} dona\n` +
          `💰 <b>To'landi:</b> ${smmService.formatUzs(pricing.retailTotal)}`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}

      try {
        await req.bot.telegram.sendMessage(
          config.adminId,
          `🚀 <b>WebApp orqali yangi SMM buyurtma!</b>\n\n` +
          `👤 Mijoz: ${firstName || telegramId} (@${username || 'yoq'})\n` +
          `📦 Xizmat: ${service.name}\n` +
          `🔢 Miqdor: ${qty.toLocaleString()} ta\n` +
          `🔗 Havola: ${link}\n` +
          `💵 Narx: ${smmService.formatUzs(pricing.retailTotal)}\n` +
          `💰 <b>Sof foyda: +${smmService.formatUzs(pricing.profit)}</b>`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}

      notifySalesChannel(req.bot, {
        type: 'smm',
        orderCode,
        serviceName: service.name,
        quantity: qty,
        totalUzs: pricing.retailTotal,
        customerName: firstName || username || 'Mijoz'
      });
    }

    res.json({
      success: true,
      orderCode,
      seensmsOrderId,
      newBalance: updatedUser.balance_uzs
    });
  } catch (err) {
    console.error('[WebApp Buy SMM Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. Hisobni to'ldirish so'rovi va skrinshot (chek) yuklash
 */
router.post('/deposit', async (req, res) => {
  try {
    const { userId, username, firstName, amount, receiptBase64 } = req.body;
    const telegramId = Number(userId);
    const depositAmount = Number(amount);

    if (!telegramId || isNaN(depositAmount) || depositAmount < 5000) {
      return res.status(400).json({ error: 'Minimal to\'ldirish summasi 5 000 so\'m' });
    }

    if (!receiptBase64) {
      return res.status(400).json({ error: 'Iltimos, to\'lov cheki skrinshotini yuklang' });
    }

    repo.getOrCreateUser(telegramId, username || '', firstName || '');

    const tx = repo.createPendingDeposit(
      telegramId,
      depositAmount,
      'card_webapp',
      `WebApp orqali so'ralgan summa: ${depositAmount} so'm`
    );

    if (req.bot) {
      const adminCaption = `📥 <b>WebApp orqali yangi to'lov cheki! (#TX${tx.id})</b>\n\n` +
        `👤 <b>Foydalanuvchi:</b> ${firstName || 'Mijoz'} (@${username || 'yoq'})\n` +
        `🆔 <b>Telegram ID:</b> <code>${telegramId}</code>\n` +
        `💰 <b>So'ralgan summa:</b> <b>${catalogService.formatUzs(depositAmount)}</b>\n\n` +
        `👇 <i>To'lovni tekshirib, quyidagi tugmalar orqali tasdiqlang yoki rad eting:</i>`;

      const kb = keyboards.adminDepositAction(tx.id);
      const base64Data = receiptBase64.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer = Buffer.from(base64Data, 'base64');

      await req.bot.telegram.sendPhoto(
        config.adminId,
        { source: imgBuffer },
        {
          caption: adminCaption,
          parse_mode: 'HTML',
          ...kb
        }
      );
    }

    res.json({
      success: true,
      txId: tx.id,
      message: 'To\'lov cheki adminga yuborildi! 1–5 daqiqa ichida tasdiqlanadi.'
    });
  } catch (err) {
    console.error('[WebApp Deposit Error]:', err);
    res.status(500).json({ error: 'Chekni yuborishda xatolik: ' + err.message });
  }
});

module.exports = router;
