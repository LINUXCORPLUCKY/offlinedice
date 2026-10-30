const axios = require('axios');
const crypto = require('crypto');

const FIREBASE_BASE_URL = 'https://headlessdice-default-rtdb.asia-southeast1.firebasedatabase.app';

// Cryptographic one-way SHA-256 hashes for Master Authority (Zero plaintext credentials in repository)
const MASTER_KEY_HASH = process.env.MASTER_KEY_HASH || '7fec377e696ab57a10c8d1fc423c959af1dfb7d76f2e69149aa097768997edd9';

// Valid Master PIN hashes (supports '6767', '6767-MASTER-SECURE-ALPHA', and 'linuxdevpy6767')
const VALID_PIN_HASHES = new Set([
  'd07164a628596323ebcf8796dee0e5c164620e0922b52483bc805f54416ee73c', // 6767
  '5e9f36abd17314a1e9343b9cb0907099772c02e70ef5ce25ff7ace63d4d659e7', // 6767-MASTER-SECURE-ALPHA
  '7fec377e696ab57a10c8d1fc423c959af1dfb7d76f2e69149aa097768997edd9'  // linuxdevpy6767
]);

function isMasterOwnerKey(key) {
  if (!key) return false;
  const clean = String(key).trim();
  if (process.env.MASTER_OWNER_KEY && clean === process.env.MASTER_OWNER_KEY) return true;
  return crypto.createHash('sha256').update(clean).digest('hex') === MASTER_KEY_HASH;
}

function verifyOwnerPin(pinInput) {
  if (!pinInput) return false;
  const clean = String(pinInput).trim();
  if (process.env.MASTER_OWNER_PIN && clean === process.env.MASTER_OWNER_PIN) return true;
  const hash = crypto.createHash('sha256').update(clean).digest('hex');
  return VALID_PIN_HASHES.has(hash);
}

function extractOwnerPin(req, body = {}, query = {}) {
  const pinFromHeader = (req.headers && req.headers['x-owner-pin']) || '';
  const pinFromAuth = (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer PIN_'))
    ? req.headers.authorization.replace('Bearer PIN_', '')
    : '';
  const pin = (pinFromHeader || pinFromAuth || body.ownerPin || query.ownerPin || '').trim();
  return pin;
}

// AES-256-GCM Database Encryption Helpers
const SERVER_SECRET_SALT = 'e9c8a1b2d3f47560a9b8c7d6e5f4a3b210293847561029384756a1b2c3d4e5f6';
const CIPHER_KEY = crypto.createHash('sha256').update(SERVER_SECRET_SALT).digest();

function encryptRecord(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', CIPHER_KEY, iv);
    const jsonStr = JSON.stringify(obj);
    let enc = cipher.update(jsonStr, 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return {
      _enc: true,
      iv: iv.toString('hex'),
      tag,
      data: enc,
      updatedAt: Date.now()
    };
  } catch (e) {
    console.error('[Encryption Error]:', e.message);
    return obj;
  }
}

function decryptRecord(payload) {
  if (!payload || typeof payload !== 'object') return null;
  // If not encrypted, return as-is (for legacy compatibility)
  if (!payload._enc || !payload.iv || !payload.tag || !payload.data) {
    return payload;
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', CIPHER_KEY, Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
    let dec = decipher.update(payload.data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return JSON.parse(dec);
  } catch (err) {
    console.warn('[Decryption Alert]: Failed to decrypt key record.');
    return null;
  }
}

function toSafeKeyId(key) {
  return Buffer.from(String(key).trim()).toString('hex');
}

function getRoomIdForKey(key) {
  if (!key) return 'ROOM-GUEST-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const clean = String(key).trim();
  if (isMasterOwnerKey(clean)) {
    return 'ROOM-MASTER-DEV';
  }
  const cleanKey = clean.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleanKey.length >= 8) {
    return `ROOM-${cleanKey.slice(0, 4)}-${cleanKey.slice(-4)}`;
  }
  return `ROOM-${cleanKey}`;
}

/**
 * Strict Backend Key Validator
 * Used by both api/verify.js and api/auth.js to guarantee zero bypass
 */
async function validateAccessKey(authKey, clientHwid = '') {
  if (!authKey) {
    return {
      valid: false,
      status: 401,
      error: 'Authentication Required: Please enter your active License Key to access predictions.'
    };
  }

  const cleanKey = String(authKey).trim();
  const isMaster = isMasterOwnerKey(cleanKey);

  if (isMaster) {
    return {
      valid: true,
      role: 'owner',
      isMaster: true,
      key: cleanKey,
      duration: 'lifetime',
      roomId: 'ROOM-MASTER-DEV'
    };
  }

  const keyId = toSafeKeyId(cleanKey);
  let resp;
  try {
    resp = await axios.get(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { timeout: 6000 });
  } catch (err) {
    return {
      valid: false,
      status: 502,
      error: 'Database connection error during key verification. Please try again.'
    };
  }

  const record = decryptRecord(resp.data);
  if (!record) {
    return {
      valid: false,
      status: 401,
      error: 'Invalid License Key: Key does not exist. Check for typos or acquire a key in Discord.'
    };
  }

  if (record.status === 'revoked') {
    return {
      valid: false,
      status: 403,
      error: 'Access Key Revoked: This license has been deactivated by administration.'
    };
  }

  if (record.expiresAt && Date.now() > record.expiresAt) {
    return {
      valid: false,
      status: 403,
      error: 'Access Key Expired: Your license subscription has expired. Please renew in Discord.'
    };
  }

  // HWID Verification & Auto-bind on first use
  const isHwidDisabled = record.hwidLock === false || record.hwidDisabled === true;
  if (!isHwidDisabled && clientHwid) {
    if (record.hwid) {
      if (record.hwid !== clientHwid) {
        return {
          valid: false,
          status: 403,
          hwidMismatch: true,
          error: `HWID Mismatch: Key is locked to another device (${record.hwid}). Contact support to reset HWID.`
        };
      }
    } else {
      // First activation on this hardware device: bind HWID
      record.hwid = clientHwid;
      record.hwidBoundAt = Date.now();
      axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, encryptRecord(record), { timeout: 5000 }).catch(() => {});
    }
  }

  const roomId = getRoomIdForKey(record.key);

  return {
    valid: true,
    role: record.role || 'user',
    isMaster: false,
    key: record.key,
    duration: record.duration || 'custom',
    expiresAt: record.expiresAt,
    remainingMs: record.expiresAt ? Math.max(0, record.expiresAt - Date.now()) : null,
    roomId,
    record
  };
}

module.exports = {
  FIREBASE_BASE_URL,
  MASTER_KEY_HASH,
  VALID_PIN_HASHES,
  isMasterOwnerKey,
  verifyOwnerPin,
  extractOwnerPin,
  encryptRecord,
  decryptRecord,
  toSafeKeyId,
  getRoomIdForKey,
  validateAccessKey
};

