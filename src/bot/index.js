const { Telegraf } = require('telegraf');
const config = require('../config');
const registerStartHandlers = require('./handlers/start');
const registerSmmHandlers = require('./handlers/smm');
const registerCatalogHandlers = require('./handlers/catalog');
const registerProfileHandlers = require('./handlers/profile');
const registerAdminHandlers = require('./handlers/admin');
const { subscriptionMiddleware, registerSubscriptionHandler } = require('./middlewares/subscription');

function createBot() {
  if (!config.botToken || config.botToken === 'YOUR_BOT_TOKEN_HERE') {
    console.warn('⚠️ DIQQAT: BOT_TOKEN hali .env faylida ko\'rsatilmagan! Bot polling boshlanmadi.');
    return null;
  }

  const bot = new Telegraf(config.botToken);

  // Xatoliklarni ushlab qolish middleware
  bot.catch((err, ctx) => {
    console.error(`[Telegraf] Xatolik (${ctx.updateType}):`, err);
    ctx.reply('Kutilmagan xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.').catch(() => {});
  });

  // 1. Majburiy obunani tekshirish middleware va callback handler
  bot.use(subscriptionMiddleware(bot));
  registerSubscriptionHandler(bot);

  // 2. Handlerlarni ro'yxatga olish
  // Hozircha barcha xarid va xizmatlar WebApp orqali ishlaydi (eski bot menyulari komentga olindi):
  registerStartHandlers(bot);
  // registerSmmHandlers(bot);
  // registerCatalogHandlers(bot);
  // registerProfileHandlers(bot);
  registerAdminHandlers(bot);

  return bot;
}

module.exports = { createBot };
