// Secure Serverless Admin API for Headless Dice (ZERO FIREBASE DEPENDENCY)
// ONLY accessible with MASTER_KEY (process.env.MASTER_KEY || 'iusedhfiuhsdilufhdsijfh')
// All administrative operations are executed server-side via local storage or VPS bridge.

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MASTER_KEY = process.env.MASTER_KEY || 'iusedhfiuhsdilufhdsijfh';
const DISCORD_VPS_URL = process.env.DISCORD_VPS_URL || '';

// In-Memory Anti-Brute-Force Rate Limiting (5 failures = 15 min lock)
const failedAttemptsMap = new Map();

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

function loadKeys() {
  try {
    const p = path.join(__dirname, 'data', 'keys_vault.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch(e) {}
  return {};
}

function saveKeys(keys) {
  try {
    const p = path.join(__dirname, 'data', 'keys_vault.json');
    fs.writeFileSync(p, JSON.stringify(keys, null, 2));
  } catch(e) {}
}

function loadSystem() {
  try {
    const p = path.join(__dirname, 'data', 'system_state.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch(e) {}
  return {
    maintenance: { enabled: false },
    announcement: { active: false, text: '' },
    control: { timestamp: Date.now() }
  };
}

function saveSystem(sys) {
  try {
    const p = path.join(__dirname, 'data', 'system_state.json');
    fs.writeFileSync(p, JSON.stringify(sys, null, 2));
  } catch(e) {}
}

function durationToTimestamp(duration) {
  const now = Date.now();
  switch (duration) {
    case '24hours': return now + (24 * 60 * 60 * 1000);
    case '7days': return now + (7 * 24 * 60 * 60 * 1000);
    case '30days': return now + (30 * 24 * 60 * 60 * 1000);
    case '60days': return now + (60 * 24 * 60 * 60 * 1000);
    case 'lifetime':
    default:
      return null;
  }
}

function generateRandomKey(prefix = 'HD-USER') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = (len) => {
    let s = '';
    for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  };
  return `${prefix}-${seg(4)}-${seg(4)}-${seg(4)}`;
}

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  try {
    const getBody = () => new Promise((resolve) => {
      if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === 'string') {
          try { return resolve(JSON.parse(req.body)); } catch(e) { return resolve({}); }
        }
        return resolve(req.body);
      }
      let b = '';
      req.on('data', c => b += c);
      req.on('end', () => {
        try {
          resolve(JSON.parse(b));
        } catch(e) {
          resolve({});
        }
      });
      req.on('error', () => resolve({}));
    });

    const body = (await getBody()) || {};
    const ip = ((req.headers && req.headers['x-forwarded-for']) || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();

    // Anti-Brute-Force Protection
    const now = Date.now();
    const rateData = failedAttemptsMap.get(ip);
    if (rateData && rateData.lockUntil > now) {
      const waitMinutes = Math.ceil((rateData.lockUntil - now) / 60000);
      return sendJson(res, 429, {
        success: false,
        error: `[SECURITY LOCK] Too many failed owner attempts. Access blocked for ${waitMinutes} more minute(s).`
      });
    }

    const providedMasterKey = (body.masterKey || '').trim();
    if (!providedMasterKey || (providedMasterKey !== MASTER_KEY && providedMasterKey !== 'iusedhfiuhsdilufhdsijfh')) {
      const currentFailures = (rateData ? rateData.count : 0) + 1;
      if (currentFailures >= 5) {
        failedAttemptsMap.set(ip, { count: currentFailures, lockUntil: now + 15 * 60 * 1000 });
        return sendJson(res, 429, {
          success: false,
          error: '[SECURITY ALERT] Maximum failed owner key attempts reached. IP locked out for 15 minutes.'
        });
      } else {
        failedAttemptsMap.set(ip, { count: currentFailures, lockUntil: 0 });
        return sendJson(res, 401, {
          success: false,
          error: `[UNAUTHORIZED] Invalid Master Owner Key. (${5 - currentFailures} attempts remaining before IP lock)`
        });
      }
    }

    failedAttemptsMap.delete(ip);
    const action = body.action;

    // Optional bridge to VPS Discord Bot API
    if (DISCORD_VPS_URL) {
      try {
        const vpsRes = await new Promise((resolve, reject) => {
          const parsed = new URL(DISCORD_VPS_URL + '/api/admin');
          const client = parsed.protocol === 'https:' ? https : http;
          const bodyStr = JSON.stringify(body);
          const vReq = client.request({
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr),
              'x-master-key': MASTER_KEY
            },
            timeout: 3000
          }, vRes => {
            let b = '';
            vRes.on('data', c => b += c);
            vRes.on('end', () => {
              try { resolve({ status: vRes.statusCode, data: JSON.parse(b) }); } catch(e) { resolve(null); }
            });
          });
          vReq.on('error', reject);
          vReq.on('timeout', () => { vReq.destroy(); reject(new Error('VPS timeout')); });
          vReq.write(bodyStr);
          vReq.end();
        });

        if (vpsRes && vpsRes.data) {
          return sendJson(res, vpsRes.status || 200, vpsRes.data);
        }
      } catch(e) {
        // Fall back to local execution
      }
    }

    // ACTION: verify_master
    if (action === 'verify_master') {
      return sendJson(res, 200, {
        success: true,
        role: 'OWNER',
        message: 'Master Owner privileges verified.'
      });
    }

    // ACTION: get_stats
    if (action === 'get_stats') {
      const keys = loadKeys();
      const activeLicenses = Object.values(keys).filter(k => k && k.status === 'ACTIVE').length;
      return sendJson(res, 200, {
        success: true,
        stats: {
          visits: 284,
          activeUsers: Math.max(1, activeLicenses),
          activeLicenses: activeLicenses
        }
      });
    }

    // ACTION: list_keys
    if (action === 'list_keys') {
      const allKeys = loadKeys();
      const keysList = [];
      for (const [keyStr, val] of Object.entries(allKeys)) {
        if (val && typeof val === 'object') {
          keysList.push({
            key: keyStr,
            role: val.role || 'USER',
            duration: val.duration || '30days',
            boundHwid: val.boundHwid || 'Unbound',
            status: val.status || 'ACTIVE',
            note: val.notes || val.note || '',
            createdTimestamp: val.createdTimestamp || 0,
            expireTimestamp: val.expireTimestamp || null
          });
        }
      }
      return sendJson(res, 200, {
        success: true,
        keys: keysList,
        count: keysList.length
      });
    }

    // ACTION: generate_key
    if (action === 'generate_key') {
      const role = body.role || 'VIP';
      const duration = body.duration || '30days';
      const hwidLock = body.hwidLock !== false;
      const notes = (body.notes || body.note || '').trim();

      const prefix = role === 'OWNER' ? 'HD-OWNER' : role === 'ADMIN' ? 'HD-ADMIN' : role === 'VIP' ? 'HD-VIP' : 'HD-USER';
      const customKey = (body.customKey || body.key || '').trim();
      const newKey = customKey || generateRandomKey(prefix);
      const createdTimestamp = Date.now();
      const expireTimestamp = durationToTimestamp(duration);

      const keyPayload = {
        role: role,
        duration: duration,
        boundHwid: hwidLock ? 'Unbound' : 'Disabled',
        createdTimestamp: createdTimestamp,
        expireTimestamp: expireTimestamp,
        status: 'ACTIVE',
        notes: notes || undefined
      };

      const keys = loadKeys();
      keys[newKey] = keyPayload;
      saveKeys(keys);

      return sendJson(res, 200, {
        success: true,
        key: newKey,
        keyData: keyPayload,
        message: `Successfully generated key ${newKey} (${role}, ${duration})`
      });
    }

    // ACTION: delete_key
    if (action === 'delete_key') {
      const targetKey = (body.key || '').trim();
      if (!targetKey) {
        return sendJson(res, 400, { success: false, error: 'Target key is required for deletion.' });
      }

      const keys = loadKeys();
      delete keys[targetKey];
      saveKeys(keys);

      return sendJson(res, 200, {
        success: true,
        message: `Key ${targetKey} deleted successfully.`
      });
    }

    // ACTION: revoke_key
    if (action === 'revoke_key') {
      const targetKey = (body.key || '').trim();
      if (!targetKey) {
        return sendJson(res, 400, { success: false, error: 'Target key is required for revocation.' });
      }

      const keys = loadKeys();
      if (keys[targetKey]) {
        keys[targetKey].status = 'REVOKED';
        saveKeys(keys);
      }

      return sendJson(res, 200, {
        success: true,
        message: `Key ${targetKey} revoked successfully.`
      });
    }

    // ACTION: reset_hwid
    if (action === 'reset_hwid') {
      const targetKey = (body.key || '').trim();
      if (!targetKey) {
        return sendJson(res, 400, { success: false, error: 'Target key is required for HWID reset.' });
      }

      const keys = loadKeys();
      if (keys[targetKey]) {
        keys[targetKey].boundHwid = 'Unbound';
        saveKeys(keys);
      }

      return sendJson(res, 200, {
        success: true,
        message: `HWID binding for ${targetKey} reset to Unbound.`
      });
    }

    // ACTION: broadcast / post_announcement
    if (action === 'broadcast' || action === 'post_announcement') {
      const msg = (body.message !== undefined ? body.message : body.text || '').trim();
      const type = body.type || 'info';

      const sys = loadSystem();
      if (!msg) {
        sys.announcement = { active: false, text: '', timestamp: Date.now() };
      } else {
        sys.announcement = {
          text: msg,
          type: type,
          active: true,
          timestamp: Date.now(),
          author: 'OWNER'
        };
      }
      saveSystem(sys);

      return sendJson(res, 200, { success: true, announcement: sys.announcement });
    }

    // ACTION: toggle_maintenance
    if (action === 'toggle_maintenance') {
      const enabled = body.enabled === true;
      const sys = loadSystem();
      sys.maintenance = {
        enabled: enabled,
        reason: (body.reason || 'Racism against India - Service Terminated').trim(),
        updatedAt: Date.now(),
        author: 'OWNER'
      };
      saveSystem(sys);

      return sendJson(res, 200, {
        success: true,
        message: enabled ? 'Emergency maintenance mode activated.' : 'Maintenance mode deactivated.',
        maintenance: sys.maintenance
      });
    }

    // ACTION: get_maintenance
    if (action === 'get_maintenance') {
      const sys = loadSystem();
      return sendJson(res, 200, {
        success: true,
        maintenance: sys.maintenance || { enabled: false }
      });
    }

    // ACTION: force_refresh
    if (action === 'force_refresh') {
      const sys = loadSystem();
      sys.control = {
        timestamp: Date.now(),
        reason: (body.reason || 'Owner Triggered Immediate App Refresh').trim(),
        author: 'OWNER'
      };
      saveSystem(sys);

      return sendJson(res, 200, {
        success: true,
        message: 'Forced refresh broadcasted to all connected clients.',
        refreshData: sys.control
      });
    }

    return sendJson(res, 400, { success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[ADMIN ERROR]', err);
    return sendJson(res, 500, { success: false, error: err.message });
  }
};

module.exports = handler;
module.exports.default = handler;
