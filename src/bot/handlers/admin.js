const keyboards = require('../keyboards');
const repo = require('../../db/repository');
const resellerApi = require('../../services/resellerApi');
const seenSmsApi = require('../../services/seenSmsApi');
const smmService = require('../../services/smmService');
const catalogService = require('../../services/catalogService');
const config = require('../../config');
const db = require('../../db');

function registerAdminHandlers(bot) {
  // Admin menyusi
  bot.hears('👑 Admin Boshqaruv', async (ctx) => {
    if (ctx.from.id !== config.adminId) {
      return ctx.reply('Kechirasiz, siz admin emassiz.');
    }

    const text = `👑 <b>Admin boshqaruv paneli:</b>\n\n` +
      `Quyidagi bo'limlardan birini tanlang yoki komandalardan foydalaning:\n` +
      `• <code>/addbalance &lt;user_id&gt; &lt;summa&gt;</code> — Foydalanuvchiga balans qo'shish\n` +
      `• <code>/broadcast &lt;xabar matni&gt;</code> — Barcha foydalanuvchilarga xabar yuborish`;

    await ctx.replyWithHTML(text, keyboards.adminMenu());
  });

  // Bot statistikasi
  bot.action('admin_stats', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;
    await ctx.answerCbQuery();

    try {
      const stats = repo.getBotStats();
      const text = `📊 <b>Sensey Store umumiy statistikasi:</b>\n\n` +
        `👥 <b>Foydalanuvchilar:</b> ${stats.totalUsers} nafar\n\n` +
        `🤖 <b>AI & Raqamli obunalar:</b>\n` +
        `• Jami buyurtmalar: ${stats.totalOrders} ta\n` +
        `• Tushum: ${catalogService.formatUzs(stats.totalTurnoverUzs)}\n` +
        `• Reseller tannarxi: $${stats.totalCostUsd.toFixed(2)}\n\n` +
        `🚀 <b>SMM & Nakrutka:</b>\n` +
        `• Jami buyurtmalar: ${stats.smm?.totalOrders || 0} ta\n` +
        `• SMM aylanmasi: ${smmService.formatUzs(stats.smm?.turnoverUzs || 0)}\n` +
        `• SeenSMS tannarxi: ${smmService.formatUzs(stats.smm?.costUzs || 0)}\n` +
        `• 💰 <b>Sof foyda: +${smmService.formatUzs(stats.smm?.profitUzs || 0)}</b>\n\n` +
        `📅 <b>Bugungi AI xaridlar:</b> ${stats.todayOrders} ta (${catalogService.formatUzs(stats.todayTurnoverUzs)})`;

      await ctx.replyWithHTML(text);
    } catch (error) {
      console.error('[AdminStats] xatolik:', error);
      await ctx.reply('Statistikani olishda xatolik.');
    }
  });

  // SeenSMS balansi
  bot.action('admin_seensms_balance', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;
    await ctx.answerCbQuery();

    try {
      const bal = await seenSmsApi.getBalance();
      const text = `🚀 <b>SeenSMS SMM Panel hisobi:</b>\n\n` +
        `💰 <b>Mavjud balans:</b> <b>${smmService.formatUzs(bal.balance)}</b>\n` +
        `💵 <b>Valyuta:</b> ${bal.currency}\n` +
        `📈 <b>SMM Foyda koeffitsienti:</b> <code>SEENSMS_PROFIT_MULTIPLIER=${config.seenSms.profitMultiplier}</code>\n\n` +
        `<i>Agar balans kamayib qolsa, seensms.uz orqali hisobingizni to'ldirib qo'yishingiz mumkin.</i>`;

      await ctx.replyWithHTML(text);
    } catch (error) {
      console.error('[AdminSeenSms] xatolik:', error);
      await ctx.reply(`SeenSMS hisobini tekshirishda xatolik: ${error.message}`);
    }
  });

  // Reseller balansi
  bot.action('admin_reseller_balance', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;
    await ctx.answerCbQuery();

    try {
      const me = await resellerApi.getBalance();
      const stats = await resellerApi.getStats();

      const text = `🌐 <b>AIVault Hub Reseller hisobi:</b>\n\n` +
        `💰 <b>Hozirgi hisob:</b> $${me.balance.toFixed(2)} USD\n` +
        `🆔 <b>Reseller Chat ID:</b> <code>${me.chat_id}</code>\n\n` +
        `📊 <b>Reseller API xarajatlari:</b>\n` +
        `• Bugun: $${stats.spending?.today || 0} (${stats.orders?.today || 0} ta buyurtma)\n` +
        `• 7 kun: $${stats.spending?.['7d'] || 0} (${stats.orders?.['7d'] || 0} ta buyurtma)\n` +
        `• Jami davr: $${stats.spending?.all_time || 0} (${stats.orders?.all_time || 0} ta buyurtma)`;

      await ctx.replyWithHTML(text);
    } catch (error) {
      console.error('[AdminReseller] xatolik:', error);
      await ctx.reply(`Reseller hisobini tekshirishda xatolik: ${error.message}`);
    }
  });

  // Omborni yangilash
  bot.action('admin_refresh_stock', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;
    await ctx.answerCbQuery('Ombor yangilanmoqda...');

    try {
      const products = await catalogService.getCatalog(true);
      await ctx.reply(`✅ Ombor yangilandi! Jami ${products.length} ta mahsulot mavjud.`);
    } catch (error) {
      await ctx.reply(`Xatolik: ${error.message}`);
    }
  });

  // Baza zaxira nusxasini (Backup) Telegramga yuborish
  async function sendDatabaseBackup(ctx) {
    if (ctx.from.id !== config.adminId) return;
    try {
      const snap = typeof db.saveSnapshot === 'function' ? db.saveSnapshot() : null;
      if (!snap) {
        return ctx.reply('Zaxira nusxasini yaratishda xatolik.');
      }
      const buf = Buffer.from(JSON.stringify(snap, null, 2), 'utf8');
      const fileName = `sensey_backup_${new Date().toISOString().slice(0, 10)}.json`;
      await ctx.replyWithDocument(
        { source: buf, filename: fileName },
        {
          caption: `💾 <b>Ma'lumotlar bazasi to'liq zaxira nusxasi (Backup)</b>\n\n` +
            `👥 Foydalanuvchilar: ${snap.users.length} ta\n` +
            `🤖 AI Buyurtmalar: ${snap.orders.length} ta\n` +
            `🚀 SMM Buyurtmalar: ${snap.smm_orders.length} ta\n` +
            `💳 Tranzaksiyalar: ${snap.transactions.length} ta`,
          parse_mode: 'HTML'
        }
      );
    } catch (err) {
      await ctx.reply(`Backup xatolik: ${err.message}`);
    }
  }

  bot.action('admin_backup_db', async (ctx) => {
    await ctx.answerCbQuery('Backup tayyorlanmoqda...');
    await sendDatabaseBackup(ctx);
  });

  bot.command('backup', sendDatabaseBackup);

  // Admin: Depozitni tasdiqlash
  bot.action(/^admin_confirm_tx_([0-9]+)$/, async (ctx) => {
    if (ctx.from.id !== config.adminId) return;
    const txId = Number(ctx.match[1]);

    try {
      const tx = repo.getTransaction(txId);
      if (!tx || tx.status !== 'pending') {
        return ctx.answerCbQuery('Ushbu tranzaksiya allaqachon ko\'rib chiqilgan.', { show_alert: true });
      }

      const updatedTx = repo.confirmDeposit(txId);
      const user = repo.getUser(updatedTx.user_id);

      await ctx.answerCbQuery('To\'lov muvaffaqiyatli tasdiqlandi!');

      // Admin xabarini yangilash
      const newCaption = `${ctx.callbackQuery.message.caption || ''}\n\n` +
        `✅ <b>TASDIQLANDI:</b> Foydalanuvchi hisobiga +${catalogService.formatUzs(updatedTx.amount_uzs)} qo'shildi.`;

      try {
        await ctx.editMessageCaption(newCaption, { parse_mode: 'HTML' });
      } catch (e) {
        await ctx.reply(`✅ #TX${txId} to'lovi tasdiqlandi! (+${catalogService.formatUzs(updatedTx.amount_uzs)})`);
      }

      // Foydalanuvchiga xabar yuborish
      try {
        await bot.telegram.sendMessage(
          updatedTx.user_id,
          `🎉 <b>To'lovingiz muvaffaqiyatli tasdiqlandi! (#TX${txId})</b>\n\n` +
          `💰 <b>Qo'shilgan summa:</b> <b>+${catalogService.formatUzs(updatedTx.amount_uzs)}</b>\n` +
          `💳 <b>Joriy balansingiz:</b> <b>${catalogService.formatUzs(user.balance_uzs)}</b>\n\n` +
          `<i>Xaridlar uchun «🚀 SMM & Nakrutka» yoki «🛍 AI & Raqamli Obunalar» bo'limlariga o'tishingiz mumkin!</i>`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}

    } catch (error) {
      console.error('[AdminConfirmTx] xatolik:', error);
      await ctx.reply(`Xatolik: ${error.message}`);
    }
  });

  // Admin: Rad etish sababini tanlash menyusi
  bot.action(/^admin_reject_menu_([0-9]+)$/, async (ctx) => {
    if (ctx.from.id !== config.adminId) return;
    const txId = Number(ctx.match[1]);
    await ctx.answerCbQuery();

    const kb = keyboards.adminRejectReasons(txId);
    try {
      await ctx.editMessageReplyMarkup(kb.reply_markup);
    } catch (e) {}
  });

  // Admin: Rad etishni bekor qilish (orqaga qaytish)
  bot.action(/^admin_rej_cancel_([0-9]+)$/, async (ctx) => {
    if (ctx.from.id !== config.adminId) return;
    const txId = Number(ctx.match[1]);
    await ctx.answerCbQuery();

    const kb = keyboards.adminDepositAction(txId);
    try {
      await ctx.editMessageReplyMarkup(kb.reply_markup);
    } catch (e) {}
  });

  // Admin: Sabab bilan rad etish
  bot.action(/^admin_rej_([0-9]+)_(fake|notreceived|wrongamount)$/, async (ctx) => {
    if (ctx.from.id !== config.adminId) return;
    const txId = Number(ctx.match[1]);
    const reasonKey = ctx.match[2];

    const reasons = {
      fake: {
        title: 'Chek soxta / ishonchsiz deb topildi',
        userMsg: 'Siz yuborgan to\'lov chekiga ishonch bildirilmadi yoki chek soxta deb topildi. Iltimos, haqiqiy to\'lov chekini qaytadan yuboring.'
      },
      notreceived: {
        title: 'Mablag\' hisobimizga kelib tushmadi',
        userMsg: 'Mablag\' bank hisobimizga kelib tushmadi. Iltimos, bankingizdan pul yechilganini tekshirib, to\'g\'ri chekni qaytadan yuboring.'
      },
      wrongamount: {
        title: 'Kiritilgan summa to\'langan summaga mos emas',
        userMsg: 'To\'langan summa botda so\'ralgan summa bilan mos kelmadi. Iltimos, to\'g\'ri summani ko\'rsatib qaytadan urinib ko\'ring.'
      }
    };

    const reason = reasons[reasonKey] || {
      title: 'To\'lov tasdiqlanmadi',
      userMsg: 'To\'lov chekida xatolik aniqlandi. Iltimos, qaytadan urinib ko\'ring yoki adminga murojaat qiling.'
    };

    try {
      const tx = repo.getTransaction(txId);
      if (!tx || tx.status !== 'pending') {
        return ctx.answerCbQuery('Ushbu tranzaksiya allaqachon ko\'rib chiqilgan.', { show_alert: true });
      }

      repo.rejectDeposit(txId, reason.title);
      await ctx.answerCbQuery('To\'lov rad etildi.');

      // Admin xabarini yangilash
      const newCaption = `${ctx.callbackQuery.message.caption || ''}\n\n` +
        `❌ <b>RAD ETILDI:</b> ${reason.title}`;

      try {
        await ctx.editMessageCaption(newCaption, { parse_mode: 'HTML' });
      } catch (e) {
        await ctx.reply(`❌ #TX${txId} to'lovi rad etildi. Sababi: ${reason.title}`);
      }

      // Foydalanuvchiga xabar yuborish
      try {
        await bot.telegram.sendMessage(
          tx.user_id,
          `❌ <b>Kechirasiz, siz yuborgan to'lov cheki (#TX${txId}) rad etildi.</b>\n\n` +
          `📌 <b>Sababi:</b> <i>${reason.userMsg}</i>\n\n` +
          `<i>Qaytadan to'lash uchun «💳 Balansni to'ldirish» bo'limidan foydalanishingiz yoki adminga murojaat qilishingiz mumkin.</i>`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}

    } catch (error) {
      console.error('[AdminRejectTx] xatolik:', error);
      await ctx.reply(`Xatolik: ${error.message}`);
    }
  });

  // Balans qo'shish komandasi: /addbalance <id> <summa>
  bot.command('addbalance', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;

    const parts = ctx.message.text.split(' ');
    if (parts.length < 3) {
      return ctx.reply('Noto\'g\'ri format. Namunaviy foydalanish:\n/addbalance 1118457274 50000');
    }

    const targetUserId = Number(parts[1]);
    const amount = Number(parts[2]);

    if (!targetUserId || isNaN(amount)) {
      return ctx.reply('ID yoki summa noto\'g\'ri kiritildi.');
    }

    try {
      const updatedUser = repo.adjustUserBalance(
        targetUserId,
        amount,
        'admin_adjustment',
        'internal',
        `Admin tomonidan qo'shildi (${ctx.from.id})`
      );

      await ctx.reply(
        `✅ Foydalanuvchiga balans qo'shildi!\n\n` +
        `ID: <code>${targetUserId}</code>\n` +
        `Qo'shilgan summa: ${catalogService.formatUzs(amount)}\n` +
        `Yangi balansi: <b>${catalogService.formatUzs(updatedUser.balance_uzs)}</b>`,
        { parse_mode: 'HTML' }
      );

      // Foydalanuvchiga xabar
      try {
        await bot.telegram.sendMessage(
          targetUserId,
          `💳 <b>Hisobingiz to'ldirildi!</b>\n\n` +
          `Qo'shilgan summa: <b>+${catalogService.formatUzs(amount)}</b>\n` +
          `Joriy balansingiz: <b>${catalogService.formatUzs(updatedUser.balance_uzs)}</b>\n\n` +
          `<i>Xaridlar uchun «🛍 Katalog & Obunalar» bo'limiga o'tishingiz mumkin.</i>`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}
    } catch (error) {
      await ctx.reply(`Xatolik: ${error.message}`);
    }
  });

  // Ommaviy xabar yuborish (broadcast)
  bot.command('broadcast', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;

    const messageText = ctx.message.text.replace('/broadcast', '').trim();
    if (!messageText) {
      return ctx.reply('Xabar matnini kiriting. Masalan:\n/broadcast Bugun barcha obunalarga 20% chegirma!');
    }

    const users = db.prepare('SELECT telegram_id FROM users').all();
    let sentCount = 0;

    await ctx.reply(`📢 Xabar yuborish boshlandi. Jami: ${users.length} ta foydalanuvchi...`);

    for (const u of users) {
      try {
        await bot.telegram.sendMessage(u.telegram_id, messageText, { parse_mode: 'HTML' });
        sentCount++;
        // Telegram flood limitdan saqlanish
        await new Promise(r => setTimeout(r, 40));
      } catch (e) {}
    }

    await ctx.reply(`✅ Xabar muvaffaqiyatli yetkazildi: ${sentCount} ta foydalanuvchiga.`);
  });
}

module.exports = registerAdminHandlers;
