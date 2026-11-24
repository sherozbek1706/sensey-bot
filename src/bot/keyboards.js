const { Markup } = require('telegraf');
const config = require('../config');
const catalogService = require('../services/catalogService');

/**
 * Emoji va UTF-16 surrogatlarni buzmasdan xavfsiz qisqartirish
 */
function safeTruncate(str, maxLength = 30) {
  if (!str) return '';
  const chars = Array.from(str);
  if (chars.length <= maxLength) return str;
  return chars.slice(0, maxLength - 3).join('') + '...';
}

const keyboards = {
  /**
   * Asosiy menyu (Pastdagi doimiy tugmalar)
   */
  mainMenu(isAdmin = false) {
    const buttons = [
      ['🚀 SMM & Nakrutka', '🛍 AI & Raqamli Obunalar'],
      ['👤 Profil & Balans', '💳 Balansni to\'ldirish'],
      ['📦 Mening buyurtmalarim', 'ℹ️ Qo\'llanma & Yordam']
    ];

    if (isAdmin) {
      buttons.push(['👑 Admin Boshqaruv']);
    }

    return Markup.keyboard(buttons).resize();
  },

  /**
   * SMM platformalari tanlovi
   */
  smmPlatforms() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('📱 Telegram', 'smm_plat_telegram'),
        Markup.button.callback('📸 Instagram', 'smm_plat_instagram')
      ],
      [
        Markup.button.callback('▶️ YouTube', 'smm_plat_youtube'),
        Markup.button.callback('🎵 TikTok', 'smm_plat_tiktok')
      ],
      [
        Markup.button.callback('🌐 Boshqa tarmoqlar (FB, Twitter, ...) ', 'smm_plat_other')
      ],
      [
        Markup.button.callback('⬅️ Bosh menyuga qaytish', 'back_to_main')
      ]
    ]);
  },

  /**
   * SMM kategoriyalari ro'yxati (har bir platforma uchun)
   */
  smmCategories(platform, categories, page = 0, limit = 8) {
    const start = page * limit;
    const pageItems = categories.slice(start, start + limit);
    const rows = [];

    pageItems.forEach((cat, index) => {
      const globalIndex = start + index;
      const catName = safeTruncate(cat.category, 32);
      rows.push([
        Markup.button.callback(`${catName} (${cat.count} ta)`, `smm_cat_${platform}_${globalIndex}`)
      ]);
    });

    // Navigatsiya tugmalari (Pagination)
    const navButtons = [];
    if (page > 0) {
      navButtons.push(Markup.button.callback('⬅️ Oldingi', `smm_catpage_${platform}_${page - 1}`));
    }
    if (start + limit < categories.length) {
      navButtons.push(Markup.button.callback('Keyingi ➡️', `smm_catpage_${platform}_${page + 1}`));
    }
    if (navButtons.length > 0) {
      rows.push(navButtons);
    }

    rows.push([Markup.button.callback('⬅️ Platformalar tanloviga qaytish', 'smm_platforms')]);
    return Markup.inlineKeyboard(rows);
  },

  /**
   * Kategoriya ichidagi xizmatlar ro'yxati
   */
  smmServices(services, platform, catIndex, page = 0, limit = 6) {
    const start = page * limit;
    const pageItems = services.slice(start, start + limit);
    const rows = [];

    pageItems.forEach(s => {
      const price1k = catalogService.formatUzs(s.retailRate);
      const name = safeTruncate(s.name, 28);
      rows.push([
        Markup.button.callback(`${name} — ${price1k}/1k`, `smm_srv_${s.serviceId}_${platform}_${catIndex}`)
      ]);
    });

    const navButtons = [];
    if (page > 0) {
      navButtons.push(Markup.button.callback('⬅️ Oldingi', `smm_srvpage_${platform}_${catIndex}_${page - 1}`));
    }
    if (start + limit < services.length) {
      navButtons.push(Markup.button.callback('Keyingi ➡️', `smm_srvpage_${platform}_${catIndex}_${page + 1}`));
    }
    if (navButtons.length > 0) {
      rows.push(navButtons);
    }

    rows.push([Markup.button.callback('⬅️ Kategoriyalarga qaytish', `smm_plat_${platform}`)]);
    return Markup.inlineKeyboard(rows);
  },

  /**
   * Bitta xizmat sahifasi
   */
  smmServiceDetail(serviceId, platform, catIndex) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('⚡️ Buyurtma berish', `smm_order_start_${serviceId}`)],
      [Markup.button.callback('⬅️ Xizmatlar ro\'yxatiga qaytish', `smm_cat_${platform}_${catIndex}`)]
    ]);
  },

  /**
   * SMM Buyurtmani tasdiqlash
   */
  smmConfirmOrder() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('✅ Ha, tasdiqlayman', 'smm_order_confirm')],
      [Markup.button.callback('❌ Bekor qilish', 'smm_order_cancel')]
    ]);
  },

  /**
   * Katalog inline menyusi (Mahsulotlar ro'yxati)
   */
  catalogKeyboard(products) {
    const rows = products.map(p => {
      const stockBadge = p.inStock ? `(${p.stock} ta)` : '❌ Qolmagan';
      const label = `${p.name} — ${catalogService.formatUzs(p.retailPriceUzs)} ${stockBadge}`;
      return [Markup.button.callback(label, `prod_${p.serviceId}`)];
    });

    rows.push([Markup.button.callback('🔄 Yangilash', 'refresh_catalog')]);
    return Markup.inlineKeyboard(rows);
  },

  /**
   * Mahsulot sahifasi tugmalari
   */
  productDetail(serviceId, inStock = true) {
    const buttons = [];
    if (inStock) {
      buttons.push([Markup.button.callback('⚡️ Sotib olish', `buy_${serviceId}`)]);
    }
    buttons.push([Markup.button.callback('⬅️ Katalogga qaytish', 'back_to_catalog')]);
    return Markup.inlineKeyboard(buttons);
  },

  /**
   * Xaridni tasdiqlash
   */
  confirmPurchase(serviceId) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('✅ Ha, xarid qilaman', `confirm_buy_${serviceId}`)],
      [Markup.button.callback('❌ Bekor qilish', `prod_${serviceId}`)]
    ]);
  },

  /**
   * Balans yetarli bo'lmaganda
   */
  insufficientBalance() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('💳 Balansni to\'ldirish', 'action_topup')],
      [Markup.button.callback('⬅️ Katalogga qaytish', 'back_to_catalog')]
    ]);
  },

  /**
   * To'lov usullari (Balans to'ldirish uchun)
   */
  depositMethods() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('💳 Karta orqali o\'tkazma (P2P)', 'dep_card')],
      [Markup.button.callback('⚡️ Click', 'dep_click'), Markup.button.callback('🔹 Payme', 'dep_payme')],
      [Markup.button.callback('⬅️ Orqaga', 'back_to_main')]
    ]);
  },

  /**
   * Admin uchun depozitni tasdiqlash tugmalari
   */
  adminDepositAction(txId) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Tasdiqlash (+Balans)', `admin_confirm_tx_${txId}`),
        Markup.button.callback('❌ Rad etish', `admin_reject_menu_${txId}`)
      ]
    ]);
  },

  /**
   * Admin uchun rad etish sabablari ro'yxati
   */
  adminRejectReasons(txId) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('⚠️ Chek soxta / ishonchsiz', `admin_rej_${txId}_fake`)],
      [Markup.button.callback('📉 Pul hisobimizga tushmadi', `admin_rej_${txId}_notreceived`)],
      [Markup.button.callback('🔢 Kiritilgan summa mos emas', `admin_rej_${txId}_wrongamount`)],
      [Markup.button.callback('⬅️ Bekor qilish (Orqaga)', `admin_rej_cancel_${txId}`)]
    ]);
  },

  /**
   * Admin boshqaruv menyusi
   */
  adminMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('📊 Umumiy statistika', 'admin_stats')],
      [
        Markup.button.callback('🌐 AIVault Hub (AI)', 'admin_reseller_balance'),
        Markup.button.callback('🚀 SeenSMS (SMM)', 'admin_seensms_balance')
      ],
      [
        Markup.button.callback('🔄 Omborni yangilash', 'admin_refresh_stock'),
        Markup.button.callback('💾 Baza Backup', 'admin_backup_db')
      ]
    ]);
  }
};

module.exports = keyboards;
