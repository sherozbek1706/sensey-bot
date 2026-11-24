const { Markup } = require('telegraf');
const config = require('../../config');
const repo = require('../../db/repository');
const keyboards = require('../keyboards');

/**
 * Foydalanuvchining kanalga a'zo ekanligini tekshirish
 */
async function isSubscribed(bot, channelId, userId) {
  if (!channelId) return true;

  try {
    const member = await bot.telegram.getChatMember(channelId, userId);
    return ['creator', 'administrator', 'member', 'restricted'].includes(member.status);
  } catch (error) {
    const msg = error.message || '';
    // Agar foydalanuvchi kanalda bo'lmasa, Telegram shunday xatolar qaytaradi
    if (msg.includes('PARTICIPANT_ID_INVALID') || msg.includes('USER_NOT_PARTICIPANT') || msg.includes('user not found')) {
      return false;
    }
    console.warn(`[SubCheck] Tekshirishda xatolik (${channelId}):`, error.message);
    return true;
  }
}

/**
 * Obuna bo'lishni so'rovchi klaviatura va xabar
 */
function getSubscriptionPrompt() {
  const channelUsername = config.salesChannelId.replace('@', '');
  const channelUrl = `https://t.me/${channelUsername}`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.url('📢 Kanalga a\'zo bo\'lish', channelUrl)],
    [Markup.button.callback('✅ Obunani tekshirish', 'check_subscription')]
  ]);

  const text = `⚠️ <b>Botdan foydalanish uchun kanalimizga a'zo bo'ling!</b>\n\n` +
    `Kanalimizda har kungi jonli sotuvlar, chegirmalar va yangi aksiyalar e'lon qilib boriladi.\n\n` +
    `👇 Kanalga a'zo bo'lib, pastdagi <b>«✅ Obunani tekshirish»</b> tugmasini bosing:`;

  return { text, kb };
}

/**
 * Telegraf Majburiy Obuna Middleware
 */
function subscriptionMiddleware(bot) {
  return async (ctx, next) => {
    // Faqat shaxsiy (private) chatdagi xabarlar uchun
    if (!ctx.chat || ctx.chat.type !== 'private') {
      return next();
    }

    // Kanal belgilanmagan bo'lsa yoki admin bo'lsa tekshirmaymiz
    if (!config.salesChannelId || ctx.from.id === config.adminId) {
      return next();
    }

    // Obunani tekshirish callback tugmasining o'zini o'tkazib yuboramiz
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'check_subscription') {
      return next();
    }

    const subscribed = await isSubscribed(bot, config.salesChannelId, ctx.from.id);

    if (subscribed) {
      return next();
    }

    // Agar a'zo bo'lmagan bo'lsa
    const { text, kb } = getSubscriptionPrompt();

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ Iltimos, avval kanalimizga a\'zo bo\'ling!', { show_alert: true });
      return ctx.replyWithHTML(text, kb);
    } else {
      return ctx.replyWithHTML(text, kb);
    }
  };
}

/**
 * Obunani tekshirish tugmasi bosilganda
 */
function registerSubscriptionHandler(bot) {
  bot.action('check_subscription', async (ctx) => {
    const subscribed = await isSubscribed(bot, config.salesChannelId, ctx.from.id);

    if (!subscribed) {
      return ctx.answerCbQuery(
        '❌ Siz hali kanalga a\'zo bo\'lmadingiz!\nIltimos, avval kanalga kiring va «A\'zo bo\'lish» (Join) tugmasini bosing.',
        { show_alert: true }
      );
    }

    await ctx.answerCbQuery('✅ Rahmat! Obunangiz tasdiqlandi.');

    // Eski so'rov xabarini o'chirish
    try {
      await ctx.deleteMessage();
    } catch (e) {}

    // Foydalanuvchini ro'yxatdan o'tkazish va asosiy menyuni ochish
    const user = repo.getOrCreateUser(
      ctx.from.id,
      ctx.from.username || '',
      ctx.from.first_name || ''
    );
    const isAdmin = ctx.from.id === config.adminId;

    const welcomeText = `👋 <b>Assalomu alaykum, ${ctx.from.first_name}!</b>\n\n` +
      `🚀 <b>Sensey Store</b> — Eng arzon SMM Nakrutka va AI raqamli xizmatlar do'koniga xush kelibsiz!\n\n` +
      `✨ <b>Mavjud xizmatlar:</b>\n` +
      `• 🚀 <b>SMM & Nakrutka:</b> <i>Telegram, Instagram, YouTube, TikTok (obunachi, like, ko'rishlar)</i>\n` +
      `• 🤖 <b>AI & Obunalar:</b> <i>Gemini Plus, Duolingo Super, Adobe Express, CapCut Pro va h.k.</i>\n\n` +
      `⚡️ Barcha xizmatlar to'lovdan so'ng <b>1 soniyada avtomatik</b> tarzda ishga tushadi.\n\n` +
      `👇 Kerakli bo'limni tanlang:`;

    await ctx.replyWithHTML(welcomeText, keyboards.mainMenu(isAdmin));
  });
}

module.exports = {
  isSubscribed,
  subscriptionMiddleware,
  registerSubscriptionHandler
};
