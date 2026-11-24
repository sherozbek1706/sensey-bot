const axios = require('axios');
const config = require('../config');

class ResellerApiService {
  constructor() {
    this.client = axios.create({
      baseURL: config.resellerApi.baseUrl,
      timeout: 15000,
      headers: {
        'X-API-Key': config.resellerApi.apiKey,
        'User-Agent': 'Mozilla/5.0 (compatible; SenseyBot/1.0; Node.js)',
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Reseller balansi va profilini olish
   */
  async getBalance() {
    try {
      const response = await this.client.get('/api/v1/me');
      return response.data;
    } catch (error) {
      this._handleError('getBalance', error);
    }
  }

  /**
   * Ombordagi barcha mahsulotlar va narxlarni olish
   */
  async getProducts() {
    try {
      const response = await this.client.get('/api/v1/products');
      return response.data;
    } catch (error) {
      this._handleError('getProducts', error);
    }
  }

  /**
   * Xarid qilishdan oldin narxni va balansni tekshirish
   */
  async getQuote(serviceId, quantity = 1) {
    try {
      const response = await this.client.get('/api/v1/quote', {
        params: {
          service_id: serviceId,
          quantity
        }
      });
      return response.data;
    } catch (error) {
      this._handleError('getQuote', error);
    }
  }

  /**
   * Buyurtma berish (avtomatik yetkazib berish)
   * externalOrderId - dublikat bo'lmasligi uchun noyob kalit (idempotency)
   */
  async createOrder({ serviceId, quantity = 1, externalOrderId, acceptNormalPrice = true }) {
    try {
      const payload = {
        service_id: serviceId,
        quantity,
        external_order_id: externalOrderId || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        accept_normal_price: acceptNormalPrice
      };
      const response = await this.client.post('/api/v1/order', payload);
      return response.data;
    } catch (error) {
      this._handleError('createOrder', error);
    }
  }

  /**
   * Bitta buyurtma holatini va berilgan kalit/kodlarni ko'rish
   */
  async getOrder(orderId) {
    try {
      const response = await this.client.get(`/api/v1/order/${orderId}`);
      return response.data;
    } catch (error) {
      this._handleError('getOrder', error);
    }
  }

  /**
   * Reseller buyurtmalar tarixi
   */
  async getOrders(page = 1, limit = 20) {
    try {
      const response = await this.client.get('/api/v1/orders', {
        params: { page, limit }
      });
      return response.data;
    } catch (error) {
      this._handleError('getOrders', error);
    }
  }

  /**
   * Umumiy xarajat va buyurtmalar statistikasi
   */
  async getStats() {
    try {
      const response = await this.client.get('/api/v1/stats');
      return response.data;
    } catch (error) {
      this._handleError('getStats', error);
    }
  }

  _handleError(method, error) {
    const errorDetails = error.response ? {
      status: error.response.status,
      data: error.response.data
    } : { message: error.message };

    console.error(`[ResellerApi] ${method} xatolik:`, errorDetails);
    
    // Server qaytargan xabar bo'lsa uni uzatish
    const message = error.response?.data?.error || error.response?.data?.message || error.message;
    const err = new Error(message);
    err.status = error.response?.status;
    err.details = errorDetails;
    throw err;
  }
}

module.exports = new ResellerApiService();
