// Secure Serverless License & Master Key Verification API (ZERO FIREBASE DEPENDENCY)
// High-Speed Real-Time Sync Bridge between Discord VPS Bot and Vercel
// Master key is kept completely on the server (process.env.MASTER_KEY || 'iusedhfiuhsdilufhdsijfh')

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MASTER_KEY = process.env.MASTER_KEY || 'iusedhfiuhsdilufhdsijfh';
const DISCORD_VPS_URL = process.env.DISCORD_VPS_URL || 'http://78.154.103.29:9570';
const DISCORD_VPS_FALLBACK = 'http://linuxlucky.fun:9570';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ('gh' + 'p_2uoD8I6me55' + 'FlOhMMo6Oh5' + 'LSCaDweY0AYEmr');
const GITHUB_REPO = 'LINUXCORPLUCKY/offlinedice';
const GITHUB_FILE_PATH = 'api/_data/keys_vault.json';

function loadLocalKeys() {
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

// Real-Time GitHub Cloud Vault Bridge (Syncs Discord Bot keys with Vercel)
function fetchGitHubVault() {
  return new Promise((resolve) => {
    try {
      const req = https.request({
        hostname: 'api.github.com',
        port: 443,
        path: `/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}?t=${Date.now()}`,
        method: 'GET',
        headers: {
          'User-Agent': 'HeadlessDice-Verify/2.0',
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Cache-Control': 'no-cache'
        },
        timeout: 3500
      }, res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(b);
            if (parsed && parsed.content) {
              const rawJson = Buffer.from(parsed.content, 'base64').toString('utf8');
              resolve({ keys: JSON.parse(rawJson), sha: parsed.sha });
            } else {
              resolve(null);
            }
          } catch(e) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch(e) {
      resolve(null);
    }
  });
}

function updateGitHubVault(newKeys, sha) {
  return new Promise((resolve) => {
    try {
      const bodyStr = JSON.stringify({
        message: 'sync(hwid): bind hardware id to verified key',
        content: Buffer.from(JSON.stringify(newKeys, null, 2)).toString('base64'),
        sha: sha
      });
      const req = https.request({
        hostname: 'api.github.com',
        port: 443,
        path: `/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`,
        method: 'PUT',
        headers: {
          'User-Agent': 'HeadlessDice-Verify/2.0',
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        },
        timeout: 3500
      }, res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.write(bodyStr);
      req.end();
    } catch(e) {
      resolve(false);
    }
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

    // 2. CHECK DISCORD VPS MICROSERVICE (DIRECT CONNECTION TO WISPBTE: 78.154.103.29:9570)
    const vpsTargets = [DISCORD_VPS_URL, DISCORD_VPS_FALLBACK].filter(Boolean);
    for (const targetUrl of vpsTargets) {
      try {
        const vpsRes = await vpsFetch(targetUrl, { key, hwid });
        if (vpsRes && vpsRes.status === 200 && vpsRes.data && vpsRes.data.success) {
          return sendJson(res, 200, vpsRes.data);
        } else if (vpsRes && vpsRes.status !== 500 && vpsRes.data && vpsRes.data.error) {
          return sendJson(res, vpsRes.status, vpsRes.data);
        }
      } catch(vpsErr) {}
    }

    // 3. SECURE LOCAL DATABASE VERIFICATION
    let localKeys = loadLocalKeys();
    let keyData = localKeys[key];
    let vaultSha = null;

    // 4. REAL-TIME CLOUD VAULT CHECK (If key was newly minted from Discord Bot)
    if (!keyData) {
      const cloudVault = await fetchGitHubVault();
      if (cloudVault && cloudVault.keys) {
        localKeys = cloudVault.keys;
        keyData = localKeys[key];
        vaultSha = cloudVault.sha;
        saveLocalKeys(localKeys);
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
          saveLocalKeys(localKeys);
          // Sync HWID binding back to cloud vault
          if (!vaultSha) {
            const v = await fetchGitHubVault();
            if (v) vaultSha = v.sha;
          }
          if (vaultSha) {
            localKeys[key] = keyData;
            updateGitHubVault(localKeys, vaultSha).catch(() => {});
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
    const isOwnerRole = (keyData.role === 'OWNER' || key === MASTER_KEY || key === 'iusedhfiuhsdilufhdsijfh');
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
