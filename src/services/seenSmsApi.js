const axios = require('axios');
const config = require('../config');

class SeenSmsApiService {
  constructor() {
    this.baseUrl = config.seenSms.baseUrl;
    this.apiKey = config.seenSms.apiKey;
  }

  /**
   * SeenSMS API ga umumiy so'rov yuborish
   */
  async _request(action, params = {}) {
    try {
      const form = new URLSearchParams();
      form.append('key', this.apiKey);
      form.append('action', action);

      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          form.append(key, value);
        }
      }

      const response = await axios.post(this.baseUrl, form.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept-Encoding': 'gzip, deflate'
        },
        timeout: 15000
      });

      if (response.data && response.data.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    } catch (error) {
      const errMsg = error.response?.data?.error || error.message;
      console.error(`[SeenSmsApi] ${action} xatosi:`, errMsg);
      throw new Error(errMsg);
    }
  }

  /**
   * Balansni tekshirish
   * Qaytadi: { balance: 3578.62, currency: "UZS" }
   */
  async getBalance() {
    return this._request('balance');
  }

  /**
   * Barcha SMM xizmatlar ro'yxatini olish
   * Qaytadi: [{ service: 7, name: "IG Like", category: "Instagram Like", rate: 4600, min: 10, max: 1000000, refill: 1, cancel: 1, ... }]
   */
  async getServices() {
    return this._request('services');
  }

  /**
   * Yangi SMM buyurtma berish (Nakrutka yuborish)
   * service: xizmat ID (masalan: 7)
   * link: havola (kanal, post, profil, video)
   * quantity: miqdor (masalan: 500)
   * Qaytadi: { order: 731624 }
   */
  async createOrder({ service, link, quantity }) {
    return this._request('add', {
      service,
      link,
      quantity
    });
  }

  /**
   * Buyurtma holatini tekshirish
   * Qaytadi: { charge: 900, start_count: "1200", status: "In progress", remains: "157", currency: "UZS" }
   */
  async getOrderStatus(orderId) {
    return this._request('status', { order: orderId });
  }

  /**
   * Refill (Kafolatli xizmatlar uchun to'ldirish)
   */
  async refillOrder(orderId) {
    return this._request('refill', { order: orderId });
  }

  /**
   * Buyurtmani bekor qilish (agar xizmat ruxsat bersa)
   */
  async cancelOrder(orderId) {
    return this._request('cancel', { order: orderId });
  }

  /**
   * ⭐️ Telegram Stars va Premium uchun qabul qiluvchi (@username) ni tekshirish
   * Qaytadi: { found: true, username: "durov", name: "Pavel Durov", recipient: "...", avatar: "https://..." }
   */
  async checkTelegramUser(username, type = 'stars') {
    const cleanUsername = String(username || '').replace(/^@/, '').trim();
    return this._request('user_info', { username: cleanUsername, type });
  }

  /**
   * ⭐️ Telegram Stars paketlari va narxlarini olish
   * Qaytadi: [{ quantity: 50, price: 12987 }, ...]
   */
  async getStarsPrices() {
    return this._request('stars_prices');
  }

  /**
   * ⭐️ Telegram Stars sotib olish
   * Qaytadi: { id: 4521, status: "queued", amount: 25974 }
   */
  async buyStars({ username, quantity }) {
    const cleanUsername = String(username || '').replace(/^@/, '').trim();
    return this._request('stars_buy', {
      username: cleanUsername,
      quantity: Number(quantity)
    });
  }

  /**
   * 💎 Telegram Premium narxlarini olish
   * Qaytadi: [{ months: 3, price: 177422 }, { months: 6, price: 236763 }, { months: 12, price: 429170 }]
   */
  async getPremiumPrices() {
    return this._request('premium_prices');
  }

  /**
   * 💎 Telegram Premium sotib olish
   * Qaytadi: { id: 4522, status: "queued", amount: 177422 }
   */
  async buyPremium({ username, months }) {
    const cleanUsername = String(username || '').replace(/^@/, '').trim();
    return this._request('premium_buy', {
      username: cleanUsername,
      months: Number(months)
    });
  }

  /**
   * ⭐️ Stars yoki Premium buyurtma holatini tekshirish
   */
  async getStarsOrderStatus(id) {
    return this._request('stars_status', { id });
  }
}

module.exports = new SeenSmsApiService();
