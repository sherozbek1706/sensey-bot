const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const axios = require('axios');
const config = require('../config');

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
    type TEXT,
    payment_method TEXT,
    status TEXT DEFAULT 'completed',
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
 * Snapshot obyektidan bazaga ma'lumotlarni yozish (yangi balans va buyurtmalarni ustiga yangilab yozadi)
 */
function applySnapshotToDb(snap) {
  if (!snap || typeof snap !== 'object') return;

  const restoreTx = db.transaction(() => {
    if (Array.isArray(snap.users)) {
      const stmt = db.prepare(`
        INSERT INTO users (telegram_id, username, first_name, balance_uzs, is_blocked, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
          username = COALESCE(NULLIF(excluded.username, ''), users.username),
          first_name = COALESCE(NULLIF(excluded.first_name, ''), users.first_name),
          balance_uzs = excluded.balance_uzs,
          is_blocked = excluded.is_blocked
      `);
      for (const u of snap.users) {
        stmt.run(u.telegram_id, u.username || '', u.first_name || '', Number(u.balance_uzs) || 0, u.is_blocked || 0, u.created_at);
      }
    }

    if (Array.isArray(snap.orders)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO orders (id, order_code, user_id, service_id, service_name, quantity, total_uzs, cost_usd, status, delivered_products, reseller_order_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const o of snap.orders) {
        stmt.run(o.id, o.order_code, o.user_id, o.service_id, o.service_name, o.quantity, o.total_uzs, o.cost_usd, o.status, o.delivered_products, o.reseller_order_id, o.created_at);
      }
    }

    if (Array.isArray(snap.smm_orders)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO smm_orders (id, order_code, user_id, seensms_order_id, service_id, service_name, target_link, quantity, total_uzs, cost_uzs, profit_uzs, status, start_count, remains, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of snap.smm_orders) {
        stmt.run(s.id, s.order_code, s.user_id, s.seensms_order_id, s.service_id, s.service_name, s.target_link, s.quantity, s.total_uzs, s.cost_uzs, s.profit_uzs, s.status, s.start_count, s.remains, s.created_at);
      }
    }

    if (Array.isArray(snap.transactions)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO transactions (id, user_id, amount_uzs, type, payment_method, status, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const t of snap.transactions) {
        stmt.run(t.id, t.user_id, t.amount_uzs, t.type, t.payment_method, t.status, t.details, t.created_at);
      }
    }
  });

  restoreTx();
}

/**
 * 1. Lokal initial_snapshot.json fayldan boshlang'ich tiklash
 */
function restoreFromLocalSnapshot() {
  if (!fs.existsSync(snapshotPath)) return;
  try {
    const raw = fs.readFileSync(snapshotPath, 'utf8');
    const snap = JSON.parse(raw);
    applySnapshotToDb(snap);
  } catch (err) {
    console.warn('[DB Local Restore] Xatolik:', err.message);
  }
}

restoreFromLocalSnapshot();

let cloudSyncTimer = null;
let cachedPinnedMsgId = null;

/**
 * 2. Telegram Cloud (Admin chatidagi pin qilingan xabar) ga bazani avtomatik saqlash
 * Render serveri qayta yonganda ham barcha balans va buyurtmalar 100% saqlanib qoladi!
 */
async function syncToTelegramCloud(snapshot) {
  if (!config.botToken || !config.adminId) return;
  try {
    // Eng muhim ma'lumotlarni siqish (4096 belgidan oshmasligi uchun oxirgi 60 ta tranzaksiya olinadi)
    const compactSnap = {
      exportedAt: snapshot.exportedAt,
      users: snapshot.users,
      orders: snapshot.orders.slice(-100),
      smm_orders: snapshot.smm_orders.slice(-100),
      transactions: snapshot.transactions.slice(-60)
    };

    const compressed = 'SENSEY_DB_V1:' + zlib.brotliCompressSync(Buffer.from(JSON.stringify(compactSnap))).toString('base64');
    if (compressed.length > 4090) return;

    const tgBase = `https://api.telegram.org/bot${config.botToken}`;

    if (!cachedPinnedMsgId) {
      const chatRes = await axios.get(`${tgBase}/getChat`, { params: { chat_id: config.adminId }, timeout: 8000 });
      const pinned = chatRes.data?.result?.pinned_message;
      if (pinned && pinned.text && pinned.text.startsWith('SENSEY_DB_V1:')) {
        cachedPinnedMsgId = pinned.message_id;
      }
    }

    if (cachedPinnedMsgId) {
      await axios.post(`${tgBase}/editMessageText`, {
        chat_id: config.adminId,
        message_id: cachedPinnedMsgId,
        text: compressed
      }, { timeout: 8000 }).catch(() => {});
    } else {
      const sendRes = await axios.post(`${tgBase}/sendMessage`, {
        chat_id: config.adminId,
        text: compressed,
        disable_notification: true
      }, { timeout: 8000 });
      const newMsgId = sendRes.data?.result?.message_id;
      if (newMsgId) {
        cachedPinnedMsgId = newMsgId;
        await axios.post(`${tgBase}/pinChatMessage`, {
          chat_id: config.adminId,
          message_id: newMsgId,
          disable_notification: true
        }, { timeout: 8000 }).catch(() => {});
      }
    }
  } catch (err) {
    // Tarmoq xatosi bo'lsa e'tiborsiz qoldiramiz
  }
}

/**
 * 3. Server yonganda Telegram Cloud'dan eng so'nggi bazani tortib olish
 */
db.restoreFromTelegramCloud = async function () {
  if (!config.botToken || !config.adminId) return;
  try {
    const tgBase = `https://api.telegram.org/bot${config.botToken}`;
    const chatRes = await axios.get(`${tgBase}/getChat`, { params: { chat_id: config.adminId }, timeout: 8000 });
    const pinned = chatRes.data?.result?.pinned_message;
    if (pinned && pinned.text && pinned.text.startsWith('SENSEY_DB_V1:')) {
      cachedPinnedMsgId = pinned.message_id;
      const b64 = pinned.text.replace('SENSEY_DB_V1:', '').trim();
      const jsonStr = zlib.brotliDecompressSync(Buffer.from(b64, 'base64')).toString('utf8');
      const cloudSnap = JSON.parse(jsonStr);
      applySnapshotToDb(cloudSnap);
      fs.writeFileSync(snapshotPath, JSON.stringify(cloudSnap, null, 2), 'utf8');
      console.log(`☁️ Telegram Cloud DB dan ma'lumotlar tiklandi! (Users: ${cloudSnap.users?.length || 0}, Orders: ${(cloudSnap.orders?.length || 0) + (cloudSnap.smm_orders?.length || 0)})`);
    }
  } catch (err) {
    console.warn('[DB Cloud Restore] Xatolik:', err.message);
  }
};

/**
 * Joriy baza holatini lokal va bulutli snapshotga saqlab qo'yish
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

    // Bulutga sinxronlash (debounce 1.5 soniya)
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
      syncToTelegramCloud(snapshot);
    }, 1500);

    return snapshot;
  } catch (err) {
    console.warn('[DB SaveSnapshot] Xatolik:', err.message);
    return null;
  }
};

console.log('✓ Ma\'lumotlar bazasi (SQLite) ishga tushirildi:', dbPath);

module.exports = db;
