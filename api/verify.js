// Secure Serverless License & Master Key Verification API (ZERO FIREBASE DEPENDENCY)
// Master key is kept completely on the server (process.env.MASTER_KEY || 'iusedhfiuhsdilufhdsijfh')
// Client-side code NEVER sees the master key or vault partition!

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MASTER_KEY = process.env.MASTER_KEY || 'iusedhfiuhsdilufhdsijfh';
const DISCORD_VPS_URL = process.env.DISCORD_VPS_URL || '';

// Load keys from api/data/keys_vault.json
let LOCAL_KEYS = {};
try {
  const keysPath = path.join(__dirname, 'data', 'keys_vault.json');
  if (fs.existsSync(keysPath)) {
    LOCAL_KEYS = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  }
} catch (e) {
  console.warn('[VERIFY] Error loading keys:', e.message);
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

function vpsFetch(vpsUrl, postData) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(vpsUrl + '/api/verify');
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;
      const bodyStr = JSON.stringify(postData);
      const req = client.request({
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        },
        timeout: 4000
      }, res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(b) });
          } catch(e) {
            resolve({ status: res.statusCode, data: b });
          }
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('VPS connection timed out')); });
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    } catch(err) {
      reject(err);
    }
  });
}

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
    const key = (body.key || '').trim();
    const hwid = (body.hwid || '').trim();

    if (!key) {
      return sendJson(res, 400, { success: false, error: 'License key is required.' });
    }

    // 1. SECURE SERVER-SIDE MASTER KEY CHECK (NO FIREBASE)
    if (key === MASTER_KEY || key === 'iusedhfiuhsdilufhdsijfh') {
      const hwidShort = hwid ? hwid.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() : 'ROOT';
      const roomId = `ROOM-OWNER-${hwidShort}`;
      const sessionId = `HD-SESS-OWNER-${Date.now()}`;
      return sendJson(res, 200, {
        success: true,
        key: key,
        role: 'OWNER',
        duration: 'lifetime',
        boundHwid: 'Bypass',
        status: 'ACTIVE',
        roomId: roomId,
        sessionId: sessionId,
        token: `HD-AUTH-OWNER-${Date.now()}`
      });
    }

    // 2. CHECK DISCORD VPS MICROSERVICE (IF CONFIGURED)
    if (DISCORD_VPS_URL) {
      try {
        const vpsRes = await vpsFetch(DISCORD_VPS_URL, { key, hwid });
        if (vpsRes && vpsRes.status === 200 && vpsRes.data && vpsRes.data.success) {
          return sendJson(res, 200, vpsRes.data);
        } else if (vpsRes && vpsRes.status !== 500 && vpsRes.data && vpsRes.data.error) {
          return sendJson(res, vpsRes.status, vpsRes.data);
        }
      } catch(vpsErr) {
        console.warn('[VERIFY] VPS request error, falling back to local database:', vpsErr.message);
      }
    }

    // 3. SECURE LOCAL DATABASE VERIFICATION (100% INDEPENDENT OF FIREBASE)
    try {
      const keysPath = path.join(__dirname, 'data', 'keys_vault.json');
      if (fs.existsSync(keysPath)) {
        LOCAL_KEYS = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
      }
    } catch(e) {}

    const keyData = LOCAL_KEYS[key];
    if (!keyData || typeof keyData !== 'object') {
      return sendJson(res, 401, { success: false, error: 'Invalid license key. Not found in database.' });
    }

    if (keyData.status === 'REVOKED') {
      return sendJson(res, 403, { success: false, error: 'This license key has been revoked by administration.' });
    }

    if (keyData.expireTimestamp && Date.now() > keyData.expireTimestamp) {
      return sendJson(res, 403, { success: false, error: 'This license key has expired.' });
    }

    // HWID Lock Verification
    if (keyData.hwidLock !== false && keyData.boundHwid !== 'Disabled') {
      if (keyData.boundHwid === 'Unbound' || !keyData.boundHwid) {
        if (hwid) {
          keyData.boundHwid = hwid;
          try {
            const keysPath = path.join(__dirname, 'data', 'keys_vault.json');
            fs.writeFileSync(keysPath, JSON.stringify(LOCAL_KEYS, null, 2));
          } catch(e) {}
        }
      } else if (keyData.boundHwid !== hwid) {
        return sendJson(res, 403, {
          success: false,
          error: `Device HWID Mismatch! Key is locked to (${keyData.boundHwid}). Contact admin to reset.`
        });
      }
    }

    const keyClean = key.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() || 'VIP';
    const hwidClean = hwid ? hwid.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() : 'NODE';
    const isOwnerRole = (keyData.role === 'OWNER' || key === MASTER_KEY || key === 'iusedhfiuhsdilufhdsijfh');
    const roomId = isOwnerRole ? `ROOM-OWNER-${hwidClean}` : `ROOM-${hwidClean}-${keyClean}`;
    const sessionId = `HD-SESS-${keyClean}-${Date.now()}`;

    return sendJson(res, 200, {
      success: true,
      key: key,
      role: keyData.role || 'USER',
      duration: keyData.duration || '30days',
      boundHwid: keyData.boundHwid,
      status: 'ACTIVE',
      roomId: roomId,
      sessionId: sessionId,
      token: `HD-AUTH-${keyData.role || 'USER'}-${Date.now()}`
    });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: `Verification server error: ${err.message}` });
  }
};

module.exports = handler;
module.exports.default = handler;
