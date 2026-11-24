const { Markup } = require('telegraf');
const keyboards = require('../keyboards');
const repo = require('../../db/repository');
const config = require('../../config');

function registerStartHandlers(bot) {
  // /start komandasi
  bot.start(async (ctx) => {
    try {
      const user = repo.getOrCreateUser(
        ctx.from.id,
        ctx.from.username || '',
        ctx.from.first_name || ''
      );

      const isAdmin = ctx.from.id === config.adminId;

      const welcomeText = `👋 <b>Assalomu alaykum, ${ctx.from.first_name}!</b>\n\n` +
        `🚀 <b>Sensey Store</b> — Barcha SMM Nakrutka va AI raqamli obunalar endi yagona zamonaviy <b>Mini App (Web Ilova)</b> ichida!\n\n` +
        `✨ <b>Ilova orqali:</b>\n` +
        `• 🚀 <b>1 600+ SMM xizmatlar:</b> <i>Telegram, Instagram, YouTube, TikTok</i>\n` +
        `• 🤖 <b>AI & Obunalar:</b> <i>Gemini Plus, Duolingo Super, Adobe Express, CapCut Pro</i>\n` +
        `• 💳 <b>Hisobni to'ldirish va buyurtmalar tarixi</b>\n\n` +
        `👇 Do'konni ochish uchun pastdagi tugmani bosing:`;

      // Eski pastki tugmalarni tozalash (admin uchun Admin Boshqaruv qoladi)
      await ctx.replyWithHTML(welcomeText, keyboards.mainMenu(isAdmin));

      const appUrl = (config.webappUrl && config.webappUrl.startsWith('https://'))
        ? config.webappUrl
        : null;

      if (appUrl) {
        await ctx.replyWithHTML(
          `📱 <b>Sensey Store Mini App:</b>`,
          Markup.inlineKeyboard([
            [Markup.button.webApp('🛍 Do\'konni ochish (WebApp)', appUrl)]
          ])
        );
      }
    } catch (error) {
      console.error('[StartHandler] xatolik:', error);
      await ctx.reply('Tizimda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
  });

  // Qo'llanma & Yordam
  bot.hears('ℹ️ Qo\'llanma & Yordam', async (ctx) => {
    const helpText = `ℹ️ <b>Qo'llanma va Yordam</b>\n\n` +
      `1️⃣ <b>Qanday qilib obuna sotib olaman?</b>\n` +
      `Avval balansingizni to'ldiring, so'ngra «🛍 Katalog & Obunalar» bo'limidan kerakli mahsulotni tanlang va «Sotib olish» tugmasini bosing.\n\n` +
      `2️⃣ <b>Qanchada yetkazib beriladi?</b>\n` +
      `Xarid qilingan zahoti bot sizga rasmiy promo-havola yoki kirish ma'lumotlarini taqdim etadi.\n\n` +
      `3️⃣ <b>Kafolat bormi?</b>\n` +
      `Barcha mahsulotlar rasmiy va sinovdan o'tgan. Agar aktivatsiyada savol bo'lsa, adminga murojaat qiling.\n\n` +
      `👨‍💻 <b>Admin / Qo'llab-quvvatlash:</b> @admin`;

    await ctx.replyWithHTML(helpText);
  });

  // Bosh menyuga qaytish callback
  bot.action('back_to_main', async (ctx) => {
    await ctx.answerCbQuery();
    const isAdmin = ctx.from.id === config.adminId;
    await ctx.reply('Asosiy menyu:', keyboards.mainMenu(isAdmin));
  });
}

module.exports = registerStartHandlers;
