const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const SYSTEM_FILE = path.join(DATA_DIR, 'system.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Atomic file writer to prevent corruption during writes
function safeWriteJson(filePath, data) {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function safeReadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      safeWriteJson(filePath, fallback);
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch(e) {
    console.error(`[DB READ ERROR] Failed to parse ${filePath}:`, e.message);
    return fallback;
  }
}

class LocalDatabase {
  constructor() {
    this.keys = safeReadJson(KEYS_FILE, {});
    this.system = safeReadJson(SYSTEM_FILE, {
      maintenance: { enabled: false, reason: '', updatedAt: Date.now() },
      announcement: { active: false, text: '', timestamp: Date.now() },
      control: { timestamp: Date.now(), reason: '' }
    });
    this.stats = safeReadJson(STATS_FILE, { totalVisits: 0, activeUsers: {} });
  }

  // --- KEYS OPERATIONS ---
  getAllKeys() {
    return { ...this.keys };
  }

  getKey(key) {
    if (!key) return null;
    return this.keys[key] || null;
  }

  setKey(key, keyData) {
    if (!key || !keyData) return false;
    this.keys[key] = keyData;
    this.persistKeys();
    return true;
  }

  deleteKey(key) {
    if (!key || !this.keys[key]) return false;
    delete this.keys[key];
    this.persistKeys();
    return true;
  }

  updateKey(key, patch) {
    if (!key || !this.keys[key]) return false;
    this.keys[key] = { ...this.keys[key], ...patch };
    this.persistKeys();
    return true;
  }

  persistKeys() {
    safeWriteJson(KEYS_FILE, this.keys);
  }

  // --- SYSTEM OPERATIONS ---
  getMaintenance() {
    return this.system.maintenance || { enabled: false };
  }

  setMaintenance(mObj) {
    this.system.maintenance = {
      enabled: mObj.enabled === true,
      reason: mObj.reason || '',
      updatedAt: Date.now(),
      author: mObj.author || 'OWNER'
    };
    safeWriteJson(SYSTEM_FILE, this.system);
    return this.system.maintenance;
  }

  getAnnouncement() {
    return this.system.announcement || { active: false };
  }

  setAnnouncement(aObj) {
    this.system.announcement = {
      active: aObj.active === true,
      text: aObj.text || '',
      type: aObj.type || 'info',
      timestamp: Date.now(),
      author: aObj.author || 'OWNER'
    };
    safeWriteJson(SYSTEM_FILE, this.system);
    return this.system.announcement;
  }

  getControl() {
    return this.system.control || { timestamp: Date.now() };
  }

  setControl(cObj) {
    this.system.control = {
      timestamp: Date.now(),
      reason: cObj.reason || 'Remote Refresh',
      author: cObj.author || 'OWNER'
    };
    safeWriteJson(SYSTEM_FILE, this.system);
    return this.system.control;
  }

  // --- STATS OPERATIONS ---
  getStats() {
    return { ...this.stats };
  }

  incrementVisits() {
    this.stats.totalVisits = (this.stats.totalVisits || 0) + 1;
    safeWriteJson(STATS_FILE, this.stats);
    return this.stats.totalVisits;
  }

  touchUser(hwid) {
    if (!hwid) return;
    if (!this.stats.activeUsers) this.stats.activeUsers = {};
    this.stats.activeUsers[hwid] = { lastSeen: Date.now() };
    // Prune stale users older than 15 mins
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [h, u] of Object.entries(this.stats.activeUsers)) {
      if (u.lastSeen < cutoff) delete this.stats.activeUsers[h];
    }
    safeWriteJson(STATS_FILE, this.stats);
  }
}

module.exports = new LocalDatabase();

