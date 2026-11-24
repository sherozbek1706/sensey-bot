const keyboards = require('../keyboards');
const repo = require('../../db/repository');
const catalogService = require('../../services/catalogService');
const config = require('../../config');

const seenSmsApi = require('../../services/seenSmsApi');
const smmService = require('../../services/smmService');

// Foydalanuvchilarning kutilayotgan holati (masalan, chek kutish)
const userStates = new Map();

function registerProfileHandlers(bot) {
  // Profil & Balans
  bot.hears('👤 Profil & Balans', async (ctx) => {
    try {
      const user = repo.getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
      const orders = repo.getUserOrders(ctx.from.id, 100);

      const text = `👤 <b>Sizning profilingiz:</b>\n\n` +
        `🆔 <b>Telegram ID:</b> <code>${ctx.from.id}</code>\n` +
        `👤 <b>Ism:</b> ${ctx.from.first_name}\n` +
        `💰 <b>Balansingiz:</b> <b>${catalogService.formatUzs(user.balance_uzs)}</b>\n` +
        `📦 <b>Jami xaridlar:</b> ${orders.length} ta\n\n` +
        `<i>Balansingizni to'ldirish uchun «💳 Balansni to'ldirish» tugmasidan foydalaning.</i>`;

      await ctx.replyWithHTML(text, keyboards.depositMethods());
    } catch (error) {
      console.error('[Profile] xatolik:', error);
      await ctx.reply('Profil ma\'lumotlarini yuklashda xatolik yuz berdi.');
    }
  });

  // Buyurtmalarim
  bot.hears('📦 Mening buyurtmalarim', async (ctx) => {
    try {
      const orders = repo.getUserOrders(ctx.from.id, 5);
      const smmOrders = repo.getUserSmmOrders(ctx.from.id, 5);

      if ((!orders || orders.length === 0) && (!smmOrders || smmOrders.length === 0)) {
        return ctx.reply('Sizda hali xarid qilingan buyurtmalar mavjud emas.');
      }

      let text = `📦 <b>Sizning oxirgi buyurtmalaringiz:</b>\n\n`;

      if (smmOrders && smmOrders.length > 0) {
        text += `🚀 <b>SMM & Nakrutka buyurtmalari:</b>\n`;
        smmOrders.forEach((sord, i) => {
          text += `<b>${i + 1}. ${sord.service_name}</b>\n` +
            `🔢 Miqdor: ${sord.quantity} ta | 💰 ${smmService.formatUzs(sord.total_uzs)}\n` +
            `🔗 Havola: ${sord.target_link}\n` +
            `📊 Holati: <b>${sord.status}</b>\n` +
            `🆔 SeenSMS ID: <code>${sord.seensms_order_id}</code>\n\n`;
        });
      }

      if (orders && orders.length > 0) {
        text += `🛍 <b>AI va Raqamli obunalar:</b>\n`;
        orders.forEach((ord, i) => {
          let codes = [];
          try {
            codes = JSON.parse(ord.delivered_products || '[]');
          } catch (e) {
            codes = [ord.delivered_products];
          }

          text += `<b>${i + 1}. ${ord.service_name}</b>\n` +
            `💰 Narxi: ${catalogService.formatUzs(ord.total_uzs)}\n` +
            `📅 Vaqti: ${ord.created_at}\n` +
            `🔑 Kod/Link: <code>${codes.join(', ')}</code>\n\n`;
        });
      }

      await ctx.replyWithHTML(text);
    } catch (error) {
      console.error('[UserOrders] xatolik:', error);
      await ctx.reply('Buyurtmalarni yuklashda xatolik yuz berdi.');
    }
  });

  // Balansni to'ldirish
  bot.hears('💳 Balansni to\'ldirish', async (ctx) => {
    await sendDepositInstructions(ctx);
  });

  bot.action('action_topup', async (ctx) => {
    await ctx.answerCbQuery();
    await sendDepositInstructions(ctx);
  });

  async function sendDepositInstructions(ctx) {
    const text = `💳 <b>Hisobni to'ldirish usulini tanlang:</b>\n\n` +
      `Siz hisobingizni Uzcard/Humo kartasi yoki to'lov tizimlari orqali to'ldirishingiz mumkin:`;
    if (ctx.callbackQuery) {
      await ctx.replyWithHTML(text, keyboards.depositMethods());
    } else {
      await ctx.replyWithHTML(text, keyboards.depositMethods());
    }
  }

  // Hisob to'ldirish usullari tanlanganda summa so'rash
  bot.action(['dep_card', 'dep_click', 'dep_payme'], async (ctx) => {
    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, { step: 'awaiting_deposit_amount' });

    await ctx.replyWithHTML(
      `💰 <b>Hisobingizni qancha summaga to'ldirmoqchisiz?</b>\n\n` +
      `Iltimos, summani so'mda yozib yuboring (masalan: <code>50000</code> yoki <code>100000</code>):\n` +
      `<i>(Minimal to'ldirish summasi: 5 000 so'm)</i>\n\n` +
      `<i>Bekor qilish uchun /cancel deb yozing.</i>`
    );
  });

  // Matnli xabarlar (Summa kiritilganda)
  bot.on('text', async (ctx, next) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return next();

    if (state.step === 'awaiting_deposit_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);

      if (isNaN(amount) || amount < 5000) {
        return ctx.reply('⚠️ Minimal to\'ldirish summasi 5 000 so\'m. Iltimos, qaytadan kiriting (masalan: 50000):');
      }

      userStates.set(ctx.from.id, { step: 'awaiting_receipt', amount });

      const text = `💳 <b>Karta orqali to'lov:</b>\n\n` +
        `💰 <b>To'ldirish summasi:</b> <b>${catalogService.formatUzs(amount)}</b>\n` +
        `💳 <b>Karta raqami:</b> <code>${config.paymentCard.number}</code>\n` +
        `👤 <b>Karta egasi:</b> <b>${config.paymentCard.holder}</b>\n\n` +
        `📌 <b>Ko'rsatma:</b>\n` +
        `1. Yuqoridagi kartaga <b>${catalogService.formatUzs(amount)}</b> o'tkazing.\n` +
        `2. To'lov amalga oshirilgach, to'lov chekini (skrinshot yoki rasmini) <b>ushbu botga yuboring</b>.\n\n` +
        `⏳ <i>Admin to'lovni tekshirib, 1–5 daqiqa ichida hisobingizga qo'shib beradi.</i>`;

      return ctx.replyWithHTML(text);
    }

    return next();
  });

  // Rasmli cheklarni qabul qilish
  bot.on(['photo', 'document'], async (ctx, next) => {
    const state = userStates.get(ctx.from.id);
    if (!state || state.step !== 'awaiting_receipt') {
      return next();
    }

    try {
      const depositAmount = state.amount || 0;
      userStates.delete(ctx.from.id);

      // Kutilayotgan tranzaksiya yaratish
      const tx = repo.createPendingDeposit(ctx.from.id, depositAmount, 'card_manual', `Mijoz so'ragan summa: ${depositAmount} so'm`);

      await ctx.replyWithHTML(
        `✅ <b>To'lov cheki qabul qilindi! (#TX${tx.id})</b>\n\n` +
        `💰 <b>Kutilayotgan summa:</b> <b>${catalogService.formatUzs(depositAmount)}</b>\n\n` +
        `To'lov ma'lumotlari adminga tekshirish uchun yuborildi. Tasdiqlanishi bilan hisobingizga tushadi va sizga xabar beriladi.`
      );

      // Adminga xabar va rasm yuborish
      const adminCaption = `📥 <b>Yangi to'lov cheki keldi! (#TX${tx.id})</b>\n\n` +
        `👤 <b>Foydalanuvchi:</b> ${ctx.from.first_name} (@${ctx.from.username || 'yoq'})\n` +
        `🆔 <b>Telegram ID:</b> <code>${ctx.from.id}</code>\n` +
        `💰 <b>So'ralgan summa:</b> <b>${catalogService.formatUzs(depositAmount)}</b>\n\n` +
        `👇 <i>To'lovni tekshirib, quyidagi tugmalar orqali tasdiqlang yoki rad eting:</i>`;

      const kb = keyboards.adminDepositAction(tx.id);

      if (ctx.message.photo) {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        await bot.telegram.sendPhoto(config.adminId, fileId, {
          caption: adminCaption,
          parse_mode: 'HTML',
          ...kb
        });
      } else if (ctx.message.document) {
        await bot.telegram.sendDocument(config.adminId, ctx.message.document.file_id, {
          caption: adminCaption,
          parse_mode: 'HTML',
          ...kb
        });
      }
    } catch (error) {
      console.error('[ReceiptProcess] xatolik:', error);
      await ctx.reply('Chekni qabul qilishda xatolik yuz berdi. Iltimos, adminga to\'g\'ridan-to\'g\'ri yuboring.');
    }
  });
}

module.exports = registerProfileHandlers;
