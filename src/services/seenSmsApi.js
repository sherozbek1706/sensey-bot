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
}

module.exports = new SeenSmsApiService();
