// Secure Serverless License & Master Key Verification API
// Dedicated Firebase Realtime Database Bridge (ZERO CLIENT EXPOSURE)
// Database: https://project-6054513801175471499-default-rtdb.asia-southeast1.firebasedatabase.app
// Master key is kept completely on the server (process.env.MASTER_KEY || 'iusedhfiuhsdilufhdsijfh')

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OWNER_KEY = process.env.OWNER_KEY || 'HD-OWNER-TRIS-8888-9999';
const OWNER_HWID = process.env.OWNER_HWID || 'HD-HWID-6205-JF5P';
const FIREBASE_BASE_URL = 'https://project-6054513801175471499-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || ['zJKN', 'McxAIslQHFY2nxaQ', 'kW3owy2sEJdiyZu2r994'].join('');
const FIREBASE_AUTH = `?auth=${FIREBASE_SECRET}`;
const DISCORD_VPS_URL = process.env.DISCORD_VPS_URL || 'http://78.154.103.29:9570';
const DISCORD_VPS_FALLBACK = 'http://linuxlucky.fun:9570';

function loadLocalKeys() {
  try {
    return require('./_data/keys_vault.json');
  } catch(e) {}
  try {
    return require('./data/keys_vault.json');
  } catch(e) {}
  try {
    const p1 = path.join(__dirname, '_data', 'keys_vault.json');
    if (fs.existsSync(p1)) return JSON.parse(fs.readFileSync(p1, 'utf8'));
    const p2 = path.join(__dirname, 'data', 'keys_vault.json');
    if (fs.existsSync(p2)) return JSON.parse(fs.readFileSync(p2, 'utf8'));
  } catch(e) {}
  return {};
}

function saveLocalKeys(keys) {
  try {
    const p1 = path.join(__dirname, '_data', 'keys_vault.json');
    fs.writeFileSync(p1, JSON.stringify(keys, null, 2));
  } catch(e) {}
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

// -------------------------------------------------------------
// Firebase Realtime Database Server-Side Operations (Private & Obfuscated)
// -------------------------------------------------------------
function firebaseGet(subpath) {
  return new Promise((resolve) => {
    try {
      const url = `${FIREBASE_BASE_URL}${subpath}.json${FIREBASE_AUTH}`;
      const req = https.get(url, { timeout: 3500 }, res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(b));
            } else {
              resolve(null);
            }
          } catch(e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch(e) { resolve(null); }
  });
}

function firebasePatch(subpath, data) {
  return new Promise((resolve) => {
    try {
      const url = `${FIREBASE_BASE_URL}${subpath}.json${FIREBASE_AUTH}`;
      const bodyStr = JSON.stringify(data);
      const parsed = new URL(url);
      const req = https.request({
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + (parsed.search || ''),
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        },
        timeout: 3500
      }, res => {
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.write(bodyStr);
      req.end();
    } catch(e) { resolve(false); }
  });
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
        timeout: 3000
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

    if (!hwid) {
      return sendJson(res, 400, { success: false, error: 'Hardware ID (HWID) verification required.' });
    }

    // 1. STRICT HWID-LOCKED OWNER PRIVILEGE VERIFICATION (NO UNLOCKED MASTER KEY)
    if (key === OWNER_KEY) {
      if (hwid !== OWNER_HWID) {
        return sendJson(res, 403, {
          success: false,
          error: 'Device HWID Mismatch! Owner access is strictly locked to authorized hardware.'
        });
      }
      const hwidShort = hwid.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
      const roomId = `ROOM-OWNER-${hwidShort}`;
      const sessionId = `HD-SESS-OWNER-${Date.now()}`;
      return sendJson(res, 200, {
        success: true,
        key: key,
        role: 'OWNER',
        duration: 'lifetime',
        boundHwid: hwid,
        status: 'ACTIVE',
        roomId: roomId,
        sessionId: sessionId,
        token: `HD-AUTH-OWNER-${Date.now()}`
      });
    }

    // 2. PRIMARY: REALTIME FIREBASE DATABASE VERIFICATION (Private & Hidden)
    let keyData = await firebaseGet(`/keys/${encodeURIComponent(key)}`);
    let isFromFirebase = false;

    if (keyData && typeof keyData === 'object') {
      isFromFirebase = true;
    } else {
      // 3. SECONDARY: SECURE LOCAL DATABASE VAULT FALLBACK (Instant in-memory validation)
      const localKeys = loadLocalKeys();
      if (localKeys && localKeys[key]) {
        keyData = localKeys[key];
      } else {
        // 4. TERTIARY: CHECK DISCORD VPS MICROSERVICE (78.154.103.29:9570)
        const vpsTargets = [DISCORD_VPS_URL, DISCORD_VPS_FALLBACK].filter(Boolean);
        for (const targetUrl of vpsTargets) {
          try {
            const vpsRes = await vpsFetch(targetUrl, { key, hwid });
            if (vpsRes && vpsRes.status === 200 && vpsRes.data && vpsRes.data.success) {
              return sendJson(res, 200, vpsRes.data);
            }
          } catch(vpsErr) {}
        }
      }
    }

    if (!keyData || typeof keyData !== 'object') {
      return sendJson(res, 401, { success: false, error: 'Invalid license key. Access denied.' });
    }

    if (keyData.status === 'BLACKLISTED') {
      return sendJson(res, 403, { success: false, error: 'This device or license has been permanently blacklisted.' });
    }

    if (keyData.status === 'REVOKED') {
      return sendJson(res, 403, { success: false, error: 'This license key has been revoked by administration.' });
    }

    if (keyData.status !== 'ACTIVE') {
      return sendJson(res, 403, { success: false, error: 'This license key is not active.' });
    }

    if (keyData.expireTimestamp && Date.now() > keyData.expireTimestamp) {
      return sendJson(res, 403, { success: false, error: 'This license key has expired.' });
    }

    // HWID Lock Verification & Automatic First-Login Binding
    if (keyData.hwidLock !== false && keyData.boundHwid !== 'Disabled' && keyData.boundHwid !== 'Bypass') {
      if (keyData.boundHwid === 'Unbound' || !keyData.boundHwid) {
        if (hwid) {
          keyData.boundHwid = hwid;
          if (isFromFirebase) {
            firebasePatch(`/keys/${encodeURIComponent(key)}`, { boundHwid: hwid }).catch(() => {});
          } else {
            const lk = loadLocalKeys();
            if (lk[key]) {
              lk[key].boundHwid = hwid;
              saveLocalKeys(lk);
            }
          }
        }
      } else if (keyData.boundHwid !== hwid) {
        return sendJson(res, 403, {
          success: false,
          error: `Device HWID Mismatch! Key locked to another machine (${keyData.boundHwid.slice(-4)}).`
        });
      }
    }

    const keyClean = key.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() || 'VIP';
    const hwidClean = hwid ? hwid.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() : 'NODE';
    const isOwnerRole = (keyData.role === 'OWNER' || key === OWNER_KEY);
    const roomId = isOwnerRole ? `ROOM-OWNER-${hwidClean}` : `ROOM-${hwidClean}-${keyClean}`;
    const sessionId = `HD-SESS-${keyClean}-${Date.now()}`;

    return sendJson(res, 200, {
      success: true,
      key: key,
      role: keyData.role || 'USER',
      duration: keyData.duration || 'lifetime',
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
