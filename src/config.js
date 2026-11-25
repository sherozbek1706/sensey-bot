require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  botToken: process.env.BOT_TOKEN,
  adminId: process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : 1118457274,
  resellerApi: {
    baseUrl: process.env.AIVAULTHUB_BASE_URL || 'https://reseller.aivaulthub.store',
    apiKey: process.env.AIVAULTHUB_API_KEY || 'rsk_vgDZjLFNugRlRqNB0VBtneToMzUNlDTyvVAe4zeEtX0'
  },
  seenSms: {
    baseUrl: process.env.SEENSMS_BASE_URL || 'https://seensms.uz/api/v1',
    apiKey: process.env.SEENSMS_API_KEY || 'TUJxv3Vh0jWztlIEi28jZfx2EEQyQcRQ',
    profitMultiplier: Number(process.env.SEENSMS_PROFIT_MULTIPLIER) || 1.5,
    starsProfitMultiplier: Number(process.env.STARS_PROFIT_MULTIPLIER) || 1.15
  },
  currency: {
    usdToUzsRate: Number(process.env.USD_TO_UZS_RATE) || 13000,
    profitMultiplier: Number(process.env.DEFAULT_PROFIT_MULTIPLIER) || 3.0
  },
  paymentCard: {
    number: process.env.PAYMENT_CARD_NUMBER || '8600 0000 0000 0000',
    holder: process.env.PAYMENT_CARD_HOLDER || 'ISMI FAMILIYASI'
  },
  salesChannelId: process.env.SALES_CHANNEL_ID || '',
  webappUrl: process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL || ''
};
