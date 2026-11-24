const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const defaultDataDir = path.join(__dirname, '../../data');
const dataDir = process.env.DATA_DIR || defaultDataDir;
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'sensey_bot.sqlite');
const snapshotPath = path.join(defaultDataDir, 'initial_snapshot.json');
const db = new Database(dbPath);

// WAL rejimini yoqish (yuqori tezlik va barqarorlik uchun)
db.pragma('journal_mode = WAL');

// Jadvallarni yaratish
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    balance_uzs INTEGER DEFAULT 0,
    is_blocked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE,
    user_id INTEGER,
    service_id TEXT,
    service_name TEXT,
    quantity INTEGER DEFAULT 1,
    total_uzs INTEGER,
    cost_usd REAL,
    status TEXT DEFAULT 'delivered',
    delivered_products TEXT,
    reseller_order_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(telegram_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    amount_uzs INTEGER,
    type TEXT, -- 'deposit', 'purchase', 'refund', 'admin_adjustment'
    payment_method TEXT, -- 'click', 'payme', 'card_manual', 'internal'
    status TEXT DEFAULT 'completed', -- 'pending', 'completed', 'rejected'
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(telegram_id)
  );

  CREATE TABLE IF NOT EXISTS smm_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE,
    user_id INTEGER,
    seensms_order_id INTEGER,
    service_id INTEGER,
    service_name TEXT,
    target_link TEXT,
    quantity INTEGER,
    total_uzs INTEGER,
    cost_uzs INTEGER,
    profit_uzs INTEGER,
    status TEXT DEFAULT 'Pending',
    start_count TEXT,
    remains TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(telegram_id)
  );
`);

/**
 * Zaxira (snapshot) fayldan ma'lumotlarni avtomatik tiklash
 * (Render yoki yangi serverga yuklanganda foydalanuvchilar va buyurtmalar o'chib ketmasligi uchun)
 */
function restoreFromSnapshotIfNeeded() {
  if (!fs.existsSync(snapshotPath)) return;

  try {
    const raw = fs.readFileSync(snapshotPath, 'utf8');
    const snap = JSON.parse(raw);

    const restoreTx = db.transaction(() => {
      if (Array.isArray(snap.users)) {
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO users (telegram_id, username, first_name, balance_uzs, is_blocked, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const u of snap.users) {
          stmt.run(u.telegram_id, u.username, u.first_name, u.balance_uzs, u.is_blocked || 0, u.created_at);
        }
      }

      if (Array.isArray(snap.orders)) {
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO orders (id, order_code, user_id, service_id, service_name, quantity, total_uzs, cost_usd, status, delivered_products, reseller_order_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const o of snap.orders) {
          stmt.run(o.id, o.order_code, o.user_id, o.service_id, o.service_name, o.quantity, o.total_uzs, o.cost_usd, o.status, o.delivered_products, o.reseller_order_id, o.created_at);
        }
      }

      if (Array.isArray(snap.smm_orders)) {
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO smm_orders (id, order_code, user_id, seensms_order_id, service_id, service_name, target_link, quantity, total_uzs, cost_uzs, profit_uzs, status, start_count, remains, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of snap.smm_orders) {
          stmt.run(s.id, s.order_code, s.user_id, s.seensms_order_id, s.service_id, s.service_name, s.target_link, s.quantity, s.total_uzs, s.cost_uzs, s.profit_uzs, s.status, s.start_count, s.remains, s.created_at);
        }
      }

      if (Array.isArray(snap.transactions)) {
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO transactions (id, user_id, amount_uzs, type, payment_method, status, details, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of snap.transactions) {
          stmt.run(t.id, t.user_id, t.amount_uzs, t.type, t.payment_method, t.status, t.details, t.created_at);
        }
      }
    });

    restoreTx();
  } catch (err) {
    console.warn('[DB Snapshot Restore] Xatolik:', err.message);
  }
}

restoreFromSnapshotIfNeeded();

/**
 * Joriy baza holatini JSON snapshotga saqlab qo'yish
 */
db.saveSnapshot = function () {
  try {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      users: db.prepare('SELECT * FROM users').all(),
      orders: db.prepare('SELECT * FROM orders').all(),
      smm_orders: db.prepare('SELECT * FROM smm_orders').all(),
      transactions: db.prepare('SELECT * FROM transactions').all()
    };
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
    return snapshot;
  } catch (err) {
    console.warn('[DB SaveSnapshot] Xatolik:', err.message);
    return null;
  }
};

console.log('✓ Ma\'lumotlar bazasi (SQLite) ishga tushirildi:', dbPath);

module.exports = db;
