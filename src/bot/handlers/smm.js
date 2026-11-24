const keyboards = require('../keyboards');
const smmService = require('../../services/smmService');
const seenSmsApi = require('../../services/seenSmsApi');
const repo = require('../../db/repository');
const config = require('../../config');
const { notifySalesChannel } = require('../../services/channelNotifier');

// Foydalanuvchilarning SMM buyurtma berish holatlari (Step-by-step state)
const smmOrderStates = new Map();

function registerSmmHandlers(bot) {
  // SMM & Nakrutka asosiy bo'limi
  bot.hears('🚀 SMM & Nakrutka', async (ctx) => {
    await showPlatforms(ctx);
  });

  bot.action('smm_platforms', async (ctx) => {
    await ctx.answerCbQuery();
    await showPlatforms(ctx, true);
  });

  async function showPlatforms(ctx, isEdit = false) {
    const text = `🚀 <b>SMM & Nakrutka xizmatlari markazi:</b>\n\n` +
      `<i>O'zingizga kerakli ijtimoiy tarmoqni tanlang. 1 600+ dan ortiq arzon, tezkor va kafolatli xizmatlar mavjud:</i>\n\n` +
      `• <b>Telegram:</b> Obunachilar, Reaksiyalar, Ko'rishlar, Premium obunachilar\n` +
      `• <b>Instagram:</b> Obunachilar, Like, Reels va Stories ko'rishlar\n` +
      `• <b>YouTube:</b> Ko'rishlar, Obunachilar, Jonli efir, Like\n` +
      `• <b>TikTok:</b> Ko'rishlar, Like, Obunachilar va boshqalar\n\n` +
      `👇 <i>Platformani tanlang:</i>`;

    const kb = keyboards.smmPlatforms();
    if (isEdit && ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
    } else {
      await ctx.replyWithHTML(text, kb);
    }
  }

  // Platforma tanlanganda kategoriyalarni chiqarish
  bot.action(/^smm_plat_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const platform = ctx.match[1];
    await showCategories(ctx, platform, 0, true);
  });

  // Kategoriya sahifalari (Pagination)
  bot.action(/^smm_catpage_(.+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const platform = ctx.match[1];
    const page = Number(ctx.match[2]);
    await showCategories(ctx, platform, page, true);
  });

  async function showCategories(ctx, platform, page = 0, isEdit = false) {
    try {
      const categories = await smmService.getCategoriesByPlatform(platform);
      if (!categories || categories.length === 0) {
        return ctx.reply('Ushbu platforma uchun hozircha xizmatlar mavjud emas.');
      }

      const platformNames = {
        telegram: '📱 Telegram',
        instagram: '📸 Instagram',
        youtube: '▶️ YouTube',
        tiktok: '🎵 TikTok',
        other: '🌐 Boshqa tarmoqlar'
      };

      const title = platformNames[platform] || 'Ijtimoiy tarmoq';
      const text = `📁 <b>${title} — Xizmat turlari:</b>\n\n` +
        `<i>Kerakli bo'limni tanlang (Sahifa: ${page + 1}/${Math.ceil(categories.length / 8)}):</i>`;

      const kb = keyboards.smmCategories(platform, categories, page, 8);
      if (isEdit && ctx.callbackQuery) {
        try {
          await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
        } catch (editErr) {
          if (editErr.description?.includes('message is not modified')) return;
          await ctx.replyWithHTML(text, kb);
        }
      } else {
        await ctx.replyWithHTML(text, kb);
      }
    } catch (error) {
      console.error('[ShowCategories] xatolik:', error);
      await ctx.reply('Kategoriyalarni yuklashda xatolik yuz berdi.');
    }
  }

  // Kategoriya ichidagi xizmatlarni chiqarish
  bot.action(/^smm_cat_(.+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const platform = ctx.match[1];
    const catIndex = Number(ctx.match[2]);
    await showServices(ctx, platform, catIndex, 0, true);
  });

  // Xizmatlar sahifalari (Pagination)
  bot.action(/^smm_srvpage_(.+)_(.+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const platform = ctx.match[1];
    const catIndex = Number(ctx.match[2]);
    const page = Number(ctx.match[3]);
    await showServices(ctx, platform, catIndex, page, true);
  });

  async function showServices(ctx, platform, catIndex, page = 0, isEdit = false) {
    try {
      const categories = await smmService.getCategoriesByPlatform(platform);
      const cat = categories[catIndex];
      if (!cat) {
        return ctx.reply('Kategoriya topilmadi.');
      }

      const services = await smmService.getServicesByCategory(cat.category);
      const totalPages = Math.ceil(services.length / 6);

      const text = `📋 <b>Kategoriya: ${cat.category}</b>\n\n` +
        `<i>O'zingizga ma'qul xizmatni tanlang (Sahifa: ${page + 1}/${totalPages}):</i>`;

      const kb = keyboards.smmServices(services, platform, catIndex, page, 6);
      if (isEdit && ctx.callbackQuery) {
        try {
          await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
        } catch (editErr) {
          if (editErr.description?.includes('message is not modified')) return;
          console.warn('[ShowServices] editMessageText fallback:', editErr.message);
          await ctx.replyWithHTML(text, kb);
        }
      } else {
        await ctx.replyWithHTML(text, kb);
      }
    } catch (error) {
      console.error('[ShowServices] xatolik:', error);
      await ctx.reply('Xizmatlarni yuklashda xatolik yuz berdi.');
    }
  }

  // Bitta xizmat haqida to'liq ma'lumot
  bot.action(/^smm_srv_([0-9]+)_(.+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const serviceId = Number(ctx.match[1]);
    const platform = ctx.match[2];
    const catIndex = Number(ctx.match[3]);

    try {
      const service = await smmService.getServiceById(serviceId);
      if (!service) {
        return ctx.reply('Xizmat topilmadi.');
      }

      const refillBadge = service.refill ? '✅ Kafolatli (Refill bor)' : '❌ Kafolatsiz';
      const cancelBadge = service.cancel ? '✅ Bekor qilish mumkin' : '❌ Bekor qilib bo\'lmaydi';

      let text = `📦 <b>${service.name}</b>\n\n` +
        `🆔 <b>Xizmat ID:</b> <code>${service.serviceId}</code>\n` +
        `📂 <b>Kategoriya:</b> ${service.category}\n` +
        `💰 <b>Narxi (1 000 dona):</b> <b>${smmService.formatUzs(service.retailRate)}</b>\n` +
        `📉 <b>Minimal buyurtma:</b> ${service.min} dona\n` +
        `📈 <b>Maksimal buyurtma:</b> ${service.max.toLocaleString()} dona\n` +
        `🛡 <b>Kafolat:</b> ${refillBadge}\n\n`;

      if (service.type) {
        text += `📝 <b>Xususiyatlari va tezligi:</b>\n<i>${service.type}</i>\n\n`;
      }

      text += `⚡️ <i>Buyurtma berish uchun pastdagi tugmani bosing:</i>`;

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...keyboards.smmServiceDetail(serviceId, platform, catIndex)
      });
    } catch (error) {
      console.error('[ServiceDetail] xatolik:', error);
      await ctx.reply('Xizmat tafsilotlarini yuklashda xatolik yuz berdi.');
    }
  });

  // Buyurtma jarayonini boshlash: Havola so'rash
  bot.action(/^smm_order_start_([0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const serviceId = Number(ctx.match[1]);
    const telegramId = ctx.from.id;

    try {
      const service = await smmService.getServiceById(serviceId);
      if (!service) {
        return ctx.reply('Xizmat topilmadi.');
      }

      smmOrderStates.set(telegramId, {
        step: 'awaiting_link',
        serviceId,
        service
      });

      const text = `🔗 <b>Xizmat: ${service.name}</b>\n\n` +
        `Iltimos, nakrutka yuborilishi kerak bo'lgan <b>havolani (link)</b> yuboring:\n\n` +
        `• <i>Kanal/Guruh uchun:</i> <code>https://t.me/kanal_nomi</code>\n` +
        `• <i>Telegram post ko'rish/reaksiya uchun:</i> <code>https://t.me/kanal_nomi/123</code>\n` +
        `• <i>Instagram profil/post uchun:</i> <code>https://www.instagram.com/p/...</code>\n` +
        `• <i>YouTube video uchun:</i> <code>https://youtu.be/...</code>\n\n` +
        `<i>Bekor qilish uchun /cancel deb yozing.</i>`;

      await ctx.replyWithHTML(text);
    } catch (error) {
      console.error('[OrderStart] xatolik:', error);
      await ctx.reply('Xatolik yuz berdi.');
    }
  });

  // /cancel buyrug'i
  bot.command('cancel', async (ctx) => {
    if (smmOrderStates.has(ctx.from.id)) {
      smmOrderStates.delete(ctx.from.id);
      await ctx.reply('Buyurtma berish jarayoni bekor qilindi.');
    }
  });

  // Matnli xabarlarni tutish (Havola va Miqdor)
  bot.on('text', async (ctx, next) => {
    const telegramId = ctx.from.id;
    const state = smmOrderStates.get(telegramId);

    if (!state) {
      return next();
    }

    const text = ctx.message.text.trim();

    // 1-Qadam: Havola qabul qilindi
    if (state.step === 'awaiting_link') {
      if (!text.startsWith('http://') && !text.startsWith('https://') && !text.startsWith('@') && !text.includes('t.me/')) {
        return ctx.reply('⚠️ Iltimos, to\'g\'ri havola kiriting (masalan, https://... yoki https://t.me/...).');
      }

      state.link = text;
      state.step = 'awaiting_quantity';
      smmOrderStates.set(telegramId, state);

      return ctx.replyWithHTML(
        `🔢 <b>Kerakli miqdorni kiriting:</b>\n\n` +
        `📦 Xizmat: <b>${state.service.name}</b>\n` +
        `📉 Minimal miqdor: <b>${state.service.min}</b> dona\n` +
        `📈 Maksimal miqdor: <b>${state.service.max.toLocaleString()}</b> dona\n` +
        `💰 1 000 dona narxi: <b>${smmService.formatUzs(state.service.retailRate)}</b>\n\n` +
        `<i>Masalan: 500 deb yuboring.</i>`
      );
    }

    // 2-Qadam: Miqdor qabul qilindi
    if (state.step === 'awaiting_quantity') {
      const quantity = parseInt(text.replace(/[^0-9]/g, ''), 10);

      if (isNaN(quantity) || quantity < state.service.min || quantity > state.service.max) {
        return ctx.reply(
          `⚠️ Noto'g'ri miqdor!\n` +
          `Iltimos, ${state.service.min} va ${state.service.max.toLocaleString()} orasidagi son kiriting.`
        );
      }

      state.quantity = quantity;
      const pricing = smmService.calculatePrice(state.service, quantity);
      state.pricing = pricing;
      state.step = 'awaiting_confirmation';
      smmOrderStates.set(telegramId, state);

      const user = repo.getUser(telegramId);
      const userBalance = user ? user.balance_uzs : 0;

      // Balans yetarlimi?
      if (userBalance < pricing.retailTotal) {
        const diff = pricing.retailTotal - userBalance;
        smmOrderStates.delete(telegramId);

        return ctx.replyWithHTML(
          `⚠️ <b>Balansingizda mablag' yetarli emas!</b>\n\n` +
          `📦 Xizmat: <b>${state.service.name}</b>\n` +
          `🔢 Miqdor: <b>${quantity.toLocaleString()} dona</b>\n` +
          `💰 Jami narxi: <b>${smmService.formatUzs(pricing.retailTotal)}</b>\n` +
          `👤 Balansingiz: <b>${smmService.formatUzs(userBalance)}</b>\n` +
          `📉 Yetishmayapti: <b>${smmService.formatUzs(diff)}</b>\n\n` +
          `<i>Xarid qilish uchun avval hisobingizni to'ldiring:</i>`,
          keyboards.insufficientBalance()
        );
      }

      // Tasdiqlash xabari
      const summaryText = `🛒 <b>Buyurtmani tasdiqlaysizmi?</b>\n\n` +
        `📦 <b>Xizmat:</b> ${state.service.name}\n` +
        `🔗 <b>Havola:</b> <code>${state.link}</code>\n` +
        `🔢 <b>Miqdor:</b> ${quantity.toLocaleString()} dona\n` +
        `💰 <b>Yechiladigan summa:</b> <b>${smmService.formatUzs(pricing.retailTotal)}</b>\n` +
        `👤 <b>Xariddan keyingi qoldiq:</b> ${smmService.formatUzs(userBalance - pricing.retailTotal)}\n\n` +
        `<i>«Ha, tasdiqlayman» tugmasini bossangiz, buyurtma SeenSMS tarmog'iga yuboriladi va bajarish boshlanadi.</i>`;

      return ctx.replyWithHTML(summaryText, keyboards.smmConfirmOrder());
    }

    return next();
  });

  // Buyurtmani tasdiqlash tugmasi
  bot.action('smm_order_confirm', async (ctx) => {
    await ctx.answerCbQuery('Buyurtma yuborilmoqda, iltimos kuting...');
    const telegramId = ctx.from.id;
    const state = smmOrderStates.get(telegramId);

    if (!state || state.step !== 'awaiting_confirmation') {
      return ctx.reply('Buyurtma sessiyasi tugagan. Iltimos, qaytadan boshlang.');
    }

    smmOrderStates.delete(telegramId);

    const { service, link, quantity, pricing } = state;
    const user = repo.getUser(telegramId);

    if (!user || user.balance_uzs < pricing.retailTotal) {
      return ctx.reply('Balansingiz yetarli emas.');
    }

    const orderCode = `SMM-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

    try {
      // 1. Foydalanuvchi balansidan yechish
      repo.adjustUserBalance(
        telegramId,
        -pricing.retailTotal,
        'purchase',
        'internal',
        `SMM Xarid: ${service.name} (#${orderCode})`
      );

      // 2. SeenSMS API ga buyurtma yuborish
      let apiResponse;
      try {
        apiResponse = await seenSmsApi.createOrder({
          service: service.serviceId,
          link,
          quantity
        });
      } catch (apiError) {
        console.error('[SeenSmsOrderError]', apiError);
        // Pulni foydalanuvchiga to'liq qaytarish (Avtomatik refund)
        repo.adjustUserBalance(
          telegramId,
          pricing.retailTotal,
          'refund',
          'internal',
          `Avtomatik qaytarildi (#${orderCode}) - Xato: ${apiError.message}`
        );

        // Adminga xabar
        try {
          await bot.telegram.sendMessage(
            config.adminId,
            `⚠️ <b>DIQQAT! SeenSMS API xatolik berdi:</b>\n\n` +
            `Foydalanuvchi: ${telegramId} (@${ctx.from.username || 'yoq'})\n` +
            `Xizmat: ${service.name} (ID: ${service.serviceId})\n` +
            `Xato: ${apiError.message}\n` +
            `<i>(Foydalanuvchi hisobiga pul avtomatik qaytarildi)</i>`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}

        return ctx.editMessageText(
          `❌ <b>Kechirasiz, buyurtmani qabul qilishda xatolik yuz berdi.</b>\n\n` +
          `Sababi: <i>${apiError.message}</i>\n\n` +
          `💰 Yechilgan <b>${smmService.formatUzs(pricing.retailTotal)}</b> balansingizga to'liq qaytarildi.\n` +
          `Iltimos, havolani to'g'ri kiritganingizni tekshiring yoki boshqa xizmatni sinab ko'ring.`,
          { parse_mode: 'HTML' }
        );
      }

      const seensmsOrderId = apiResponse.order;

      // 3. Ma'lumotlar bazasiga yozish
      repo.createSmmOrderRecord({
        orderCode,
        userId: telegramId,
        seensmsOrderId,
        serviceId: service.serviceId,
        serviceName: service.name,
        targetLink: link,
        quantity,
        totalUzs: pricing.retailTotal,
        costUzs: pricing.wholesaleCost,
        profitUzs: pricing.profit
      });

      // 4. Foydalanuvchiga muvaffaqiyatli xabarnoma
      const successText = `🎉 <b>Buyurtmangiz muvaffaqiyatli qabul qilindi!</b>\n\n` +
        `🔢 <b>Buyurtma kodi:</b> <code>${orderCode}</code>\n` +
        `🆔 <b>Tizim raqami (SeenSMS ID):</b> <code>${seensmsOrderId}</code>\n` +
        `📦 <b>Xizmat:</b> ${service.name}\n` +
        `🔗 <b>Havola:</b> <code>${link}</code>\n` +
        `🔢 <b>Miqdor:</b> ${quantity.toLocaleString()} dona\n` +
        `💰 <b>To'langan summa:</b> ${smmService.formatUzs(pricing.retailTotal)}\n\n` +
        `⏳ <i>Xizmat tez orada bajariladi. Holatini «📦 Mening buyurtmalarim» bo'limida kuzatishingiz mumkin.</i>`;

      await ctx.editMessageText(successText, { parse_mode: 'HTML' });

      // 5. Adminga bildirishnoma va sof foyda hisobi
      try {
        await bot.telegram.sendMessage(
          config.adminId,
          `🚀 <b>Yangi SMM Nakrutka buyurtmasi!</b>\n\n` +
          `👤 Mijoz: ${ctx.from.first_name} (@${ctx.from.username || 'yoq'})\n` +
          `📦 Xizmat: ${service.name}\n` +
          `🔢 Miqdor: ${quantity.toLocaleString()} ta\n` +
          `🔗 Havola: ${link}\n` +
          `💵 Sotilgan narx: ${smmService.formatUzs(pricing.retailTotal)}\n` +
          `📉 SeenSMS tannarxi: ${smmService.formatUzs(pricing.wholesaleCost)}\n` +
          `💰 <b>Sof foyda: +${smmService.formatUzs(pricing.profit)}</b>`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}

      // 6. Sotuvlar kanaliga bildirishnoma yuborish
      notifySalesChannel(bot, {
        type: 'smm',
        orderCode,
        serviceName: service.name,
        quantity,
        totalUzs: pricing.retailTotal,
        customerName: ctx.from.first_name || ctx.from.username || 'Mijoz'
      });

    } catch (err) {
      console.error('[ConfirmSmmOrder] xatolik:', err);
      await ctx.reply('Buyurtmani yakunlashda xatolik yuz berdi.');
    }
  });

  // Buyurtmani bekor qilish
  bot.action('smm_order_cancel', async (ctx) => {
    await ctx.answerCbQuery('Bekor qilindi');
    smmOrderStates.delete(ctx.from.id);
    await ctx.editMessageText('❌ Buyurtma bekor qilindi.');
  });
}

module.exports = registerSmmHandlers;
