const keyboards = require('../keyboards');
const catalogService = require('../../services/catalogService');
const resellerApi = require('../../services/resellerApi');
const repo = require('../../db/repository');
const config = require('../../config');
const { notifySalesChannel } = require('../../services/channelNotifier');

function registerCatalogHandlers(bot) {
  // Katalog bo'limi
  bot.hears(['🛍 Katalog & Obunalar', '🛍 AI & Raqamli Obunalar'], async (ctx) => {
    await showCatalog(ctx);
  });

  bot.action('back_to_catalog', async (ctx) => {
    await ctx.answerCbQuery();
    await showCatalog(ctx, true);
  });

  bot.action('refresh_catalog', async (ctx) => {
    await ctx.answerCbQuery('Katalog yangilanmoqda...');
    await showCatalog(ctx, true, true);
  });

  async function showCatalog(ctx, isEdit = false, forceRefresh = false) {
    try {
      const products = await catalogService.getCatalog(forceRefresh);
      const text = `🛍 <b>Mavjud obunalar va xizmatlar ro'yxati:</b>\n\n` +
        `<i>O'zingizga kerakli mahsulot ustiga bosing va to'liq ma'lumot hamda narxi bilan tanishing:</i>`;

      const kb = keyboards.catalogKeyboard(products);

      if (isEdit && ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
      } else {
        await ctx.replyWithHTML(text, kb);
      }
    } catch (error) {
      console.error('[ShowCatalog] xatolik:', error);
      const errMsg = 'Katalogni yuklashda xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.';
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery(errMsg, { show_alert: true });
      } else {
        await ctx.reply(errMsg);
      }
    }
  }

  // Mahsulot kartasi (ko'rish)
  bot.action(/^prod_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const serviceId = ctx.match[1];

    try {
      const product = await catalogService.getProductById(serviceId);
      if (!product) {
        return ctx.reply('Kechirasiz, mahsulot topilmadi.');
      }

      const stockStatus = product.inStock
        ? `✅ <b>Mavjud:</b> ${product.stock} dona`
        : `❌ <b>Qolmagan</b>`;

      let text = `📦 <b>${product.name}</b>\n\n` +
        `💰 <b>Narxi:</b> ${catalogService.formatUzs(product.retailPriceUzs)}\n` +
        `📊 <b>Holati:</b> ${stockStatus}\n\n`;

      if (product.description) {
        // Tavsifni tozalash yoki qo'shish
        text += `📝 <b>Tavsif:</b>\n${product.description}\n\n`;
      }

      text += `⚡️ <i>To'lov amalga oshirilishi bilan bot sizga aktivatsiya havolasi yoki litsenziyani avtomatik taqdim etadi.</i>`;

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...keyboards.productDetail(serviceId, product.inStock)
      });
    } catch (error) {
      console.error('[ProductDetail] xatolik:', error);
      await ctx.reply('Mahsulot ma\'lumotini yuklashda xatolik yuz berdi.');
    }
  });

  // Xarid tugmasi bosilganda
  bot.action(/^buy_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const serviceId = ctx.match[1];

    try {
      const product = await catalogService.getProductById(serviceId);
      if (!product || !product.inStock) {
        return ctx.reply('Kechirasiz, ushbu mahsulot hozirda omborda qolmagan.');
      }

      const user = repo.getUser(ctx.from.id);
      const userBalance = user ? user.balance_uzs : 0;

      // Agar balans yetarli bo'lmasa
      if (userBalance < product.retailPriceUzs) {
        const diff = product.retailPriceUzs - userBalance;
        const text = `⚠️ <b>Balansingiz yetarli emas!</b>\n\n` +
          `📦 Mahsulot: <b>${product.name}</b>\n` +
          `💰 Narxi: <b>${catalogService.formatUzs(product.retailPriceUzs)}</b>\n` +
          `👤 Sizning balansingiz: <b>${catalogService.formatUzs(userBalance)}</b>\n` +
          `📉 Yetishmayotgan summa: <b>${catalogService.formatUzs(diff)}</b>\n\n` +
          `Xarid qilish uchun avval hisobingizni to'ldiring:`;

        return ctx.editMessageText(text, {
          parse_mode: 'HTML',
          ...keyboards.insufficientBalance()
        });
      }

      // Balans yetarli bo'lsa, tasdiqlash so'raladi
      const confirmText = `🛍 <b>Xaridni tasdiqlaysizmi?</b>\n\n` +
        `📦 Mahsulot: <b>${product.name}</b>\n` +
        `💰 Yechiladigan summa: <b>${catalogService.formatUzs(product.retailPriceUzs)}</b>\n` +
        `👤 Xariddan keyingi qoldiq: <b>${catalogService.formatUzs(userBalance - product.retailPriceUzs)}</b>\n\n` +
        `«Tasdiqlash» tugmasini bossangiz, hisobingizdan mablag' yechiladi va litsenziya darhol taqdim etiladi.`;

      await ctx.editMessageText(confirmText, {
        parse_mode: 'HTML',
        ...keyboards.confirmPurchase(serviceId)
      });
    } catch (error) {
      console.error('[BuyButton] xatolik:', error);
      await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
    }
  });

  // Xaridni tasdiqlash
  bot.action(/^confirm_buy_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Xarid amalga oshirilmoqda, iltimos kuting...');
    const serviceId = ctx.match[1];
    const telegramId = ctx.from.id;

    try {
      const product = await catalogService.getProductById(serviceId);
      if (!product) {
        return ctx.reply('Mahsulot topilmadi.');
      }

      const user = repo.getUser(telegramId);
      if (!user || user.balance_uzs < product.retailPriceUzs) {
        return ctx.reply('Balansingiz yetarli emas.');
      }

      const orderCode = `ORD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

      // 1. Foydalanuvchi balansidan yechish
      repo.adjustUserBalance(
        telegramId,
        -product.retailPriceUzs,
        'purchase',
        'internal',
        `Xarid: ${product.name} (#${orderCode})`
      );

      // 2. Reseller API orqali mahsulotni sotib olish
      let resellerResult;
      try {
        resellerResult = await resellerApi.createOrder({
          serviceId: product.serviceId,
          quantity: 1,
          externalOrderId: orderCode
        });
      } catch (apiError) {
        console.error('[OrderExecution] Reseller API xatolik:', apiError);
        // Pulni foydalanuvchiga qaytarish (Avtomatik refund)
        repo.adjustUserBalance(
          telegramId,
          product.retailPriceUzs,
          'refund',
          'internal',
          `Avtomatik qaytarildi (#${orderCode}) - API xatolik: ${apiError.message}`
        );

        // Adminga xabar yuborish
        try {
          await bot.telegram.sendMessage(
            config.adminId,
            `⚠️ <b>DIQQAT! Reseller API xatolik berdi:</b>\n\n` +
            `Foydalanuvchi: ${telegramId} (@${ctx.from.username || 'yoq'})\n` +
            `Mahsulot: ${product.name} (${product.serviceId})\n` +
            `Xato: ${apiError.message}\n` +
            `<i>(Foydalanuvchi hisobiga pul avtomatik qaytarildi)</i>`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}

        return ctx.editMessageText(
          `❌ <b>Kechirasiz, xarid vaqtida tizimda xatolik yuz berdi.</b>\n\n` +
          `Ehtimol, provayder omborida mahsulot tugagan yoki texnik uzilish bo'lishi mumkin.\n` +
          `💰 Yechilgan <b>${catalogService.formatUzs(product.retailPriceUzs)}</b> balansingizga to'liq qaytarildi.\n\n` +
          `Muammo bo'yicha adminga murojaat qilishingiz mumkin.`,
          { parse_mode: 'HTML', ...keyboards.mainMenu(telegramId === config.adminId) }
        );
      }

      // 3. Buyurtmani bazaga yozish
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

      // 4. Mijozga yetkazib berish xabarini tayyorlash
      let deliveryText = `🎉 <b>Tabriklaymiz, xaridingiz muvaffaqiyatli yakunlandi!</b>\n\n` +
        `📦 <b>Mahsulot:</b> ${product.name}\n` +
        `🔢 <b>Buyurtma raqami:</b> <code>${orderCode}</code>\n` +
        `💰 <b>Narxi:</b> ${catalogService.formatUzs(product.retailPriceUzs)}\n\n` +
        `🔑 <b>Sizning litsenziyangiz / havolangiz:</b>\n`;

      deliveredItems.forEach((item, index) => {
        deliveryText += `<code>${item}</code>\n`;
      });

      if (product.instructions) {
        deliveryText += `\n📌 <b>Aktivatsiya qilish bo'yicha ko'rsatma:</b>\n${product.instructions}\n`;
      }

      deliveryText += `\n<i>Barcha buyurtmalaringizni «📦 Mening buyurtmalarim» bo'limida ham ko'rishingiz mumkin.</i>`;

      await ctx.editMessageText(deliveryText, { parse_mode: 'HTML' });

      // Adminga muvaffaqiyatli sotuv xabarnomasi
      try {
        const profitUzs = product.retailPriceUzs - (costUsd * config.currency.usdToUzsRate);
        await bot.telegram.sendMessage(
          config.adminId,
          `💰 <b>Yangi xarid amalga oshirildi!</b>\n\n` +
          `👤 Xaridor: ${ctx.from.first_name} (@${ctx.from.username || 'mavjud emas'})\n` +
          `📦 Mahsulot: ${product.name}\n` +
          `💵 Sotilgan narx: ${catalogService.formatUzs(product.retailPriceUzs)}\n` +
          `📉 Tannarxi: $${costUsd} (~${catalogService.formatUzs(costUsd * config.currency.usdToUzsRate)})\n` +
          `🚀 <b>Sof foyda:</b> ~${catalogService.formatUzs(profitUzs)}`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}

      // 5. Sotuvlar kanaliga bildirishnoma yuborish
      notifySalesChannel(bot, {
        type: 'ai',
        orderCode,
        serviceName: product.name,
        totalUzs: product.retailPriceUzs,
        customerName: ctx.from.first_name || ctx.from.username || 'Mijoz'
      });

    } catch (error) {
      console.error('[ConfirmBuy] xatolik:', error);
      await ctx.reply('Xaridni yakunlashda xatolik yuz berdi. Iltimos, adminga murojaat qiling.');
    }
  });
}

module.exports = registerCatalogHandlers;
