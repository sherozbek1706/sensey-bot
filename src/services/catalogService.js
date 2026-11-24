const resellerApi = require('./resellerApi');
const config = require('../config');

// Default belgilangan chakana narxlar (so'mda)
// Agar biror mahsulot bu ro'yxatda bo'lmasa, formula bo'yicha hisoblanadi
const FIXED_RETAIL_PRICES_UZS = {
  'service_1789191781': 35000,   // Adobe Express 12M (tannarxi $0.10 ~ 1300 so'm)
  'service_adobe_express_6m': 25000, // Adobe Express 6M (tannarxi $0.07 ~ 900 so'm)
  'service_duolingo_12m': 49000, // Duolingo Super 12M (tannarxi $0.25 ~ 3250 so'm)
  'service_gemini_plus_6m': 59000, // Gemini Plus 6M + 400GB (tannarxi $0.40 ~ 5200 so'm)
  'service_1789191878': 39000,   // Apple Music 5M (tannarxi $0.40 ~ 5200 so'm)
  'service_capcut_1m': 45000,    // CapCut Pro 1M (tannarxi $1.43 ~ 18600 so'm)
  'service_uned_mail': 65000,    // UNED Student Email .edu (tannarxi $0.70 ~ 9100 so'm)
  'service_notion_plus': 69000,  // Notion Edu Plus 12M (tannarxi $1.50 ~ 19500 so'm)
  'service_ilovepdf_1y': 35000,  // iLovePDF 1Y (tannarxi $0.60 ~ 7800 so'm)
  'service_ilovepdf_nw': 25000,  // iLovePDF NW (tannarxi $0.25 ~ 3250 so'm)
  'service_proton_vpn': 39000,   // Proton VPN (tannarxi $0.70 ~ 9100 so'm)
  'service_udemy_1m': 39000,     // Udemy 1M (tannarxi $0.80 ~ 10400 so'm)
  'service_chatgpt_plus_1m': 149000, // ChatGPT Plus 1M (tannarxi $6.00 ~ 78000 so'm)
  'service_chatgpt_plus_1m_fw': 149000,
  'service_chatgpt_codex_2500': 159000
};

class CatalogService {
  constructor() {
    this.cache = null;
    this.lastFetched = 0;
    this.cacheTTL = 3 * 60 * 1000; // 3 daqiqa kesh
  }

  /**
   * Ombordagi mahsulotlarni keshlab olish
   */
  async getCatalog(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cache && (now - this.lastFetched < this.cacheTTL)) {
      return this.cache;
    }

    const raw = await resellerApi.getProducts();
    const products = (raw.products || []).map(p => {
      const wholesaleUsd = (p.pricing_tiers && p.pricing_tiers.length > 0)
        ? p.pricing_tiers[0].price
        : 1.0;

      // Multiplier hisoblash:
      // Agar < 1 kiritilgan bo'lsa (masalan 0.3), bu +30% ustama deb olinadi (1 + 0.3 = 1.3x)
      // Agar >= 1 bo'lsa (masalan 1, 1.5, 2, 3), to'g'ridan-to'g'ri ko'paytiriladi
      let multiplier = config.currency.profitMultiplier;
      if (multiplier > 0 && multiplier < 1) {
        multiplier = 1 + multiplier;
      }

      const calculated = wholesaleUsd * config.currency.usdToUzsRate * multiplier;
      const retailUzs = Math.round(calculated / 100) * 100;

      return {
        serviceId: p.service_id,
        name: p.name,
        stock: p.stock,
        inStock: p.stock > 0,
        wholesaleUsd,
        retailPriceUzs: retailUzs,
        description: p.description || '',
        instructions: p.instructions || '',
        maxPerOrder: p.max_per_order || 10
      };
    });

    this.cache = products;
    this.lastFetched = now;
    return products;
  }

  /**
   * Bitta mahsulot ma'lumotini olish
   */
  async getProductById(serviceId) {
    const catalog = await this.getCatalog();
    return catalog.find(p => p.serviceId === serviceId) || null;
  }

  /**
   * Pul formatlash (1234567 -> 1 234 567 so'm)
   */
  formatUzs(amount) {
    return new Intl.NumberFormat('uz-UZ').format(amount) + " so'm";
  }
}

module.exports = new CatalogService();
