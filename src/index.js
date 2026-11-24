const config = require('./config');
const { createBot } = require('./bot');
const { createApp } = require('./server/app');

async function bootstrap() {
  console.log('---------------------------------------------------------');
  console.log('🚀 Sensey Telegram Shop Bot tizimi ishga tushirilmoqda...');
  console.log('---------------------------------------------------------');

  // 1. Bot nusxasini yaratish
  const bot = createBot();

  // 2. Express HTTP Serverni ishga tushirish
  const app = createApp(bot);
  const server = app.listen(config.port, () => {
    console.log(`🌍 Express API server ishlamoqda: http://localhost:${config.port}`);
    console.log(`🏥 Health check holati: http://localhost:${config.port}/health`);
  });

  // 2. Botni ishga tushirish
  if (bot) {
    try {
      const me = await bot.telegram.getMe();
      console.log(`🤖 Telegram Bot faol: @${me.username} (${me.first_name})`);
      bot.launch({ dropPendingUpdates: true }).catch((err) => {
        console.error('❌ Bot polling xatosi:', err.message);
      });
      console.log('✅ Polling muvaffaqiyatli boshlandi!');
      console.log('---------------------------------------------------------');
    } catch (err) {
      console.error('❌ Botni ishga tushirishda xatolik:', err.message);
    }
  } else {
    console.log('💡 Eslatma: Telegram botni to\'liq ishga tushirish uchun .env faylida BOT_TOKEN ni belgilang.');
    console.log('---------------------------------------------------------');
  }

  // To'xtash signallarini to'g'ri qayta ishlash
  const stopHandler = () => {
    console.log('\nTizim to\'xtatilmoqda...');
    if (bot) bot.stop('SIGINT');
    server.close(() => {
      console.log('Server to\'xtatildi.');
      process.exit(0);
    });
  };

  process.once('SIGINT', stopHandler);
  process.once('SIGTERM', stopHandler);
}

bootstrap().catch((err) => {
  console.error('Boshlang\'ich yuklashda kutilmagan xato:', err);
  process.exit(1);
});
