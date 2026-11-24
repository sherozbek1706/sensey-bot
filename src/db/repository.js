const db = require('./index');

class Repository {
  /**
   * Foydalanuvchini olish yoki yangi ro'yxatdan o'tkazish
   */
  getOrCreateUser(telegramId, username = '', firstName = '') {
    const findStmt = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
    let user = findStmt.get(telegramId);

    if (!user) {
      const insertStmt = db.prepare(`
        INSERT INTO users (telegram_id, username, first_name, balance_uzs)
        VALUES (?, ?, ?, 0)
      `);
      insertStmt.run(telegramId, username, firstName);
      user = findStmt.get(telegramId);
    } else if (username && user.username !== username) {
      // Username yangilangan bo'lsa yangilab qo'yish
      db.prepare('UPDATE users SET username = ?, first_name = ? WHERE telegram_id = ?')
        .run(username, firstName, telegramId);
    }

    return user;
  }

  /**
   * Foydalanuvchini olish
   */
  getUser(telegramId) {
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  }

  /**
   * Balansni o'zgartirish (qo'shish yoki ayirish)
   */
  adjustUserBalance(telegramId, amountUzs, type, paymentMethod = 'internal', details = '') {
    const user = this.getUser(telegramId);
    if (!user) throw new Error('Foydalanuvchi topilmadi');

    const newBalance = user.balance_uzs + amountUzs;
    if (newBalance < 0) {
      throw new Error('Balans yetarli emas');
    }

    const updateStmt = db.prepare('UPDATE users SET balance_uzs = ? WHERE telegram_id = ?');
    const txStmt = db.prepare(`
      INSERT INTO transactions (user_id, amount_uzs, type, payment_method, status, details)
      VALUES (?, ?, ?, ?, 'completed', ?)
    `);

    // Tranzaksiya ichida bajarish
    const runInTransaction = db.transaction(() => {
      updateStmt.run(newBalance, telegramId);
      txStmt.run(telegramId, amountUzs, type, paymentMethod, details);
    });

    runInTransaction();
    if (typeof db.saveSnapshot === 'function') db.saveSnapshot();
    return this.getUser(telegramId);
  }

  /**
   * Yangi buyurtma yaratish
   */
  createOrderRecord({ orderCode, userId, serviceId, serviceName, quantity, totalUzs, costUsd, deliveredProducts, resellerOrderId }) {
    const stmt = db.prepare(`
      INSERT INTO orders (order_code, user_id, service_id, service_name, quantity, total_uzs, cost_usd, status, delivered_products, reseller_order_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'delivered', ?, ?)
    `);

    stmt.run(
      orderCode,
      userId,
      serviceId,
      serviceName,
      quantity,
      totalUzs,
      costUsd,
      JSON.stringify(deliveredProducts),
      resellerOrderId
    );

    return db.prepare('SELECT * FROM orders WHERE order_code = ?').get(orderCode);
  }

  /**
   * Foydalanuvchining oxirgi buyurtmalari
   */
  getUserOrders(userId, limit = 10) {
    return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
  }

  /**
   * Buyurtma kod bo'yicha olish
   */
  getOrderByCode(orderCode) {
    return db.prepare('SELECT * FROM orders WHERE order_code = ?').get(orderCode);
  }

  /**
   * Kutilayotgan depozit tranzaksiyasi yaratish (kartaga to'lov yoki click/payme)
   */
  createPendingDeposit(userId, amountUzs, paymentMethod, details = '') {
    const stmt = db.prepare(`
      INSERT INTO transactions (user_id, amount_uzs, type, payment_method, status, details)
      VALUES (?, ?, 'deposit', ?, 'pending', ?)
    `);
    const info = stmt.run(userId, amountUzs, paymentMethod, details);
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid);
  }

  /**
   * Kutilayotgan depozitni tasdiqlash
   */
  confirmDeposit(txId) {
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
    if (!tx || tx.status !== 'pending') throw new Error('Kutilayotgan tranzaksiya topilmadi');

    const runInTransaction = db.transaction(() => {
      db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(txId);
      db.prepare('UPDATE users SET balance_uzs = balance_uzs + ? WHERE telegram_id = ?').run(tx.amount_uzs, tx.user_id);
    });

    runInTransaction();
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
  }

  /**
   * Kutilayotgan depozitni rad etish
   */
  rejectDeposit(txId, reason = '') {
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
    if (!tx || tx.status !== 'pending') throw new Error('Kutilayotgan tranzaksiya topilmadi');

    db.prepare("UPDATE transactions SET status = 'rejected', details = ? WHERE id = ?")
      .run(reason, txId);

    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
  }

  /**
   * Tranzaksiyani ID bo'yicha olish
   */
  getTransaction(txId) {
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
  }

  /**
   * Yangi SMM buyurtma yozish
   */
  createSmmOrderRecord({ orderCode, userId, seensmsOrderId, serviceId, serviceName, targetLink, quantity, totalUzs, costUzs, profitUzs }) {
    const stmt = db.prepare(`
      INSERT INTO smm_orders (order_code, user_id, seensms_order_id, service_id, service_name, target_link, quantity, total_uzs, cost_uzs, profit_uzs, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'In progress')
    `);

    stmt.run(
      orderCode,
      userId,
      seensmsOrderId,
      serviceId,
      serviceName,
      targetLink,
      quantity,
      totalUzs,
      costUzs,
      profitUzs
    );

    return db.prepare('SELECT * FROM smm_orders WHERE order_code = ?').get(orderCode);
  }

  /**
   * Foydalanuvchining SMM buyurtmalari
   */
  getUserSmmOrders(userId, limit = 10) {
    return db.prepare('SELECT * FROM smm_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
  }

  /**
   * SMM buyurtmani yangilash
   */
  updateSmmOrderStatus(seensmsOrderId, status, startCount = null, remains = null) {
    return db.prepare(`
      UPDATE smm_orders 
      SET status = ?, start_count = COALESCE(?, start_count), remains = COALESCE(?, remains)
      WHERE seensms_order_id = ?
    `).run(status, startCount, remains, seensmsOrderId);
  }

  /**
   * Admin uchun umumiy statistika
   */
  getBotStats() {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalOrders = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(total_uzs), 0) as turnover, COALESCE(SUM(cost_usd), 0) as cost_usd FROM orders').get();
    const todayOrders = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(total_uzs), 0) as turnover FROM orders WHERE date(created_at) = date('now')").get();

    const smmStats = db.prepare(`
      SELECT 
        COUNT(*) as count, 
        COALESCE(SUM(total_uzs), 0) as turnover, 
        COALESCE(SUM(cost_uzs), 0) as cost_uzs, 
        COALESCE(SUM(profit_uzs), 0) as profit_uzs 
      FROM smm_orders
    `).get();

    return {
      totalUsers,
      totalOrders: totalOrders.count,
      totalTurnoverUzs: totalOrders.turnover,
      totalCostUsd: totalOrders.cost_usd,
      todayOrders: todayOrders.count,
      todayTurnoverUzs: todayOrders.turnover,
      smm: {
        totalOrders: smmStats.count,
        turnoverUzs: smmStats.turnover,
        costUzs: smmStats.cost_uzs,
        profitUzs: smmStats.profit_uzs
      }
    };
  }
}

module.exports = new Repository();
