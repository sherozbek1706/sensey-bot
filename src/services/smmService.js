const seenSmsApi = require('./seenSmsApi');
const config = require('../config');

class SmmService {
  constructor() {
    this.cache = null;
    this.lastFetched = 0;
    this.cacheTTL = 5 * 60 * 1000; // 5 daqiqa kesh
  }

  /**
   * Foyda koeffitsientini olish
   * Masalan: 1.5 -> 1.5x (+50% foyda)
   * 0.3 -> 1.3x (+30% foyda)
   * 2.0 -> 2.0x (+100% foyda)
   */
  getMultiplier() {
    let m = config.seenSms.profitMultiplier;
    if (m > 0 && m < 1) {
      return 1 + m;
    }
    return m > 0 ? m : 1.5;
  }

  /**
   * Barcha xizmatlarni olish va narxini hisoblash
   */
  async getAllServices(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cache && (now - this.lastFetched < this.cacheTTL)) {
      return this.cache;
    }

    const raw = await seenSmsApi.getServices();
    const multiplier = this.getMultiplier();

    const services = (raw || []).map(s => {
      const wholesaleRate = Number(s.rate) || 0; // 1000 ta uchun ulgurji narx (so'mda)
      const retailRate = Math.round((wholesaleRate * multiplier) / 100) * 100; // 1000 ta uchun sotuv narxi

      return {
        serviceId: s.service,
        name: s.name,
        type: s.type || '',
        category: s.category || 'Boshqa',
        wholesaleRate,
        retailRate,
        min: Number(s.min) || 10,
        max: Number(s.max) || 100000,
        refill: Boolean(s.refill),
        cancel: Boolean(s.cancel)
      };
    });

    this.cache = services;
    this.lastFetched = now;
    return services;
  }

  /**
   * Platforma bo'yicha saralash
   * platform: 'telegram' | 'instagram' | 'youtube' | 'tiktok' | 'other'
   */
  async getServicesByPlatform(platform) {
    const all = await this.getAllServices();
    return all.filter(s => {
      const text = `${s.category} ${s.name}`.toLowerCase();
      if (platform === 'telegram') return text.includes('telegram') || text.includes('tg') || text.includes('stars');
      if (platform === 'instagram') return text.includes('instagram') || text.includes('ig');
      if (platform === 'youtube') return text.includes('youtube') || text.includes('yt');
      if (platform === 'tiktok') return text.includes('tiktok') || text.includes('tt');
      if (platform === 'other') {
        return !text.includes('telegram') && !text.includes('tg') &&
               !text.includes('instagram') && !text.includes('ig') &&
               !text.includes('youtube') && !text.includes('yt') &&
               !text.includes('tiktok') && !text.includes('tt');
      }
      return true;
    });
  }

  /**
   * Bitta platforma ichidagi kategoriyalar ro'yxatini olish
   */
  async getCategoriesByPlatform(platform) {
    const services = await this.getServicesByPlatform(platform);
    const catMap = new Map();

    for (const s of services) {
      const current = catMap.get(s.category) || { category: s.category, count: 0, minRate: Infinity };
      current.count += 1;
      if (s.retailRate < current.minRate) {
        current.minRate = s.retailRate;
      }
      catMap.set(s.category, current);
    }

    return Array.from(catMap.values());
  }

  /**
   * Aniq kategoriya ichidagi xizmatlarni olish
   */
  async getServicesByCategory(categoryName) {
    const all = await this.getAllServices();
    return all.filter(s => s.category === categoryName);
  }

  /**
   * Bitta xizmatni ID bo'yicha olish
   */
  async getServiceById(serviceId) {
    const all = await this.getAllServices();
    return all.find(s => String(s.serviceId) === String(serviceId)) || null;
  }

  /**
   * Miqdor bo'yicha buyurtma narxi va tannarxini hisoblash
   */
  calculatePrice(service, quantity) {
    const wholesaleCost = Math.round((quantity / 1000) * service.wholesaleRate);
    const retailTotal = Math.round((quantity / 1000) * service.retailRate);
    const profit = retailTotal - wholesaleCost;

    return {
      quantity,
      wholesaleCost,
      retailTotal,
      profit
    };
  }

  /**
   * Pul formatlash (10000 -> 10 000 so'm)
   */
  formatUzs(amount) {
    return new Intl.NumberFormat('uz-UZ').format(amount) + " so'm";
  }
}

module.exports = new SmmService();
