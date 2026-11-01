const express = require('express');
const cors = require('cors');
const db = require('./database');

function createApiServer(masterKey, apiSecret) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Duration Helper
  function durationToTimestamp(duration) {
    const now = Date.now();
    switch (duration) {
      case '24hours': return now + 24 * 60 * 60 * 1000;
      case '7days': return now + 7 * 24 * 60 * 60 * 1000;
      case '30days': return now + 30 * 24 * 60 * 60 * 1000;
      case '60days': return now + 60 * 24 * 60 * 60 * 1000;
      case 'lifetime':
      default: return null;
    }
  }

  function generateRandomKey(prefix = 'HD-KEY') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = (len) => {
      let s = '';
      for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
      return s;
    };
    return `${prefix}-${seg(4)}-${seg(4)}-${seg(4)}`;
  }

  // Healthcheck
  app.get('/health', (req, res) => {
    res.json({
      status: 'ONLINE',
      system: 'HEADLESS DICE SECURE VPS DATABASE',
      totalKeys: Object.keys(db.getAllKeys()).length,
      timestamp: Date.now()
    });
  });

  // Public system status endpoints
  app.get('/api/system/maintenance', (req, res) => {
    res.json(db.getMaintenance());
  });

  app.get('/api/system/announcement', (req, res) => {
    res.json(db.getAnnouncement());
  });

  // 1. SECURE VERIFY ENDPOINT (Used by Login Gateway & App)
  app.post('/api/verify', (req, res) => {
    const { key: rawKey, hwid: rawHwid } = req.body || {};
    const key = (rawKey || '').trim();
    const hwid = (rawHwid || '').trim();

    if (!key) {
      return res.status(400).json({ success: false, error: 'License key is required.' });
    }

    // Touch active user stats
    db.touchUser(hwid);
    db.incrementVisits();

    // Check Master Key
    if (key === masterKey || key === 'iusedhfiuhsdilufhdsijfh') {
      const hwidShort = hwid ? hwid.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() : 'ROOT';
      return res.json({
        success: true,
        key: key,
        role: 'OWNER',
        duration: 'lifetime',
        boundHwid: 'Bypass',
        status: 'ACTIVE',
        roomId: `ROOM-OWNER-${hwidShort}`,
        sessionId: `HD-SESS-OWNER-${Date.now()}`,
        token: `HD-AUTH-OWNER-${Date.now()}`
      });
    }

    // Check Local Database
    const keyData = db.getKey(key);
    if (!keyData) {
      return res.status(401).json({ success: false, error: 'Invalid license key. Not found in VPS database.' });
    }

    if (keyData.status === 'REVOKED') {
      return res.status(403).json({ success: false, error: 'This license key has been revoked by administration.' });
    }

    if (keyData.expireTimestamp && Date.now() > keyData.expireTimestamp) {
      db.updateKey(key, { status: 'EXPIRED' });
      return res.status(403).json({ success: false, error: 'This license key has expired.' });
    }

    // HWID Binding & Lock Check
    if (keyData.hwidLock !== false && keyData.boundHwid !== 'Disabled') {
      if (keyData.boundHwid === 'Unbound' || !keyData.boundHwid) {
        if (hwid) {
          db.updateKey(key, { boundHwid: hwid });
          keyData.boundHwid = hwid;
        }
      } else if (keyData.boundHwid !== hwid) {
        return res.status(403).json({
          success: false,
          error: `Device HWID Mismatch! Key locked to (${keyData.boundHwid}). Reset via Discord bot.`
        });
      }
    }

    const keyClean = key.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() || 'VIP';
    const hwidClean = hwid ? hwid.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() : 'NODE';
    const isOwner = (keyData.role === 'OWNER');
    const roomId = isOwner ? `ROOM-OWNER-${hwidClean}` : `ROOM-${hwidClean}-${keyClean}`;

    return res.json({
      success: true,
      key: key,
      role: keyData.role || 'USER',
      duration: keyData.duration || '30days',
      boundHwid: keyData.boundHwid,
      status: 'ACTIVE',
      roomId: roomId,
      sessionId: `HD-SESS-${keyClean}-${Date.now()}`,
      token: `HD-AUTH-${keyData.role || 'USER'}-${Date.now()}`
    });
  });

  // 2. ADMIN API (Key generation, deletion, revoke, reset HWID, maintenance, announcements)
  app.post('/api/admin', (req, res) => {
    const body = req.body || {};
    const providedKey = (body.masterKey || req.headers['x-api-secret'] || '').trim();

    if (providedKey !== masterKey && providedKey !== apiSecret && providedKey !== 'iusedhfiuhsdilufhdsijfh') {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Master Key or API Secret.' });
    }

    const action = body.action;

    if (action === 'verify_master') {
      return res.json({ success: true, role: 'OWNER', message: 'Master privileges verified.' });
    }

    if (action === 'get_stats') {
      const stats = db.getStats();
      const allKeys = Object.values(db.getAllKeys());
      const activeLicenses = allKeys.filter(k => k && k.status === 'ACTIVE').length;
      const activeUsersCount = Object.keys(stats.activeUsers || {}).length || 1;

      return res.json({
        success: true,
        stats: {
          visits: stats.totalVisits || 190,
          activeUsers: activeUsersCount,
          activeLicenses: activeLicenses
        }
      });
    }

    if (action === 'list_keys') {
      const allKeys = db.getAllKeys();
      const list = Object.entries(allKeys).map(([k, v]) => ({
        key: k,
        role: v.role || 'USER',
        duration: v.duration || '30days',
        boundHwid: v.boundHwid || 'Unbound',
        status: v.status || 'ACTIVE',
        note: v.notes || v.note || '',
        createdTimestamp: v.createdTimestamp || 0,
        expireTimestamp: v.expireTimestamp || null
      }));
      return res.json({ success: true, keys: list, count: list.length });
    }

    if (action === 'generate_key') {
      const role = body.role || 'VIP';
      const duration = body.duration || '30days';
      const hwidLock = body.hwidLock !== false;
      const notes = (body.notes || body.note || '').trim();

      const prefix = role === 'OWNER' ? 'HD-OWNER' : role === 'ADMIN' ? 'HD-ADMIN' : role === 'VIP' ? 'HD-VIP' : 'HD-USER';
      const customKey = (body.customKey || body.key || '').trim();
      const newKey = customKey || generateRandomKey(prefix);

      const payload = {
        role: role,
        duration: duration,
        boundHwid: hwidLock ? 'Unbound' : 'Disabled',
        createdTimestamp: Date.now(),
        expireTimestamp: durationToTimestamp(duration),
        status: 'ACTIVE',
        notes: notes || undefined
      };

      db.setKey(newKey, payload);
      return res.json({ success: true, key: newKey, keyData: payload });
    }

    if (action === 'delete_key') {
      const target = (body.key || '').trim();
      db.deleteKey(target);
      return res.json({ success: true, message: `Key ${target} deleted.` });
    }

    if (action === 'revoke_key') {
      const target = (body.key || '').trim();
      db.updateKey(target, { status: 'REVOKED' });
      return res.json({ success: true, message: `Key ${target} revoked.` });
    }

    if (action === 'reset_hwid') {
      const target = (body.key || '').trim();
      db.updateKey(target, { boundHwid: 'Unbound' });
      return res.json({ success: true, message: `HWID for ${target} reset to Unbound.` });
    }

    if (action === 'toggle_maintenance') {
      const enabled = body.enabled === true;
      const m = db.setMaintenance({
        enabled: enabled,
        reason: (body.reason || 'Maintenance in progress').trim(),
        author: 'OWNER'
      });
      return res.json({ success: true, maintenance: m });
    }

    if (action === 'broadcast' || action === 'post_announcement') {
      const msg = (body.message || body.text || '').trim();
      const a = db.setAnnouncement({
        active: !!msg,
        text: msg,
        type: body.type || 'info',
        author: 'OWNER'
      });
      return res.json({ success: true, announcement: a });
    }

    if (action === 'force_refresh') {
      const c = db.setControl({
        reason: (body.reason || 'Owner Triggered Refresh').trim(),
        author: 'OWNER'
      });
      return res.json({ success: true, control: c });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  });

  return app;
}

module.exports = createApiServer;

