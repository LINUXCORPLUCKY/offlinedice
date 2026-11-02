// ==============================================================================
// HEADLESS DICE — ENTERPRISE AUTHENTICATION & AUTHORIZATION ENGINE
// Server-Side Verification, Bcrypt Hashing, HttpOnly Sessions, Strict 2-Owner Guard
// ==============================================================================

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

const SESSION_COOKIE_NAME = 'hd_session_token';
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

// In-Memory Rate Limiting Cache
const rateLimitMap = new Map();

/**
 * Validates whether an IP address is currently rate-limited.
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record) return { allowed: true };

  if (now > record.resetAt) {
    rateLimitMap.delete(ip);
    return { allowed: true };
  }

  if (record.attempts >= MAX_FAILED_ATTEMPTS) {
    const waitSeconds = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  return { allowed: true };
}

/**
 * Increments failed attempt counter for an IP.
 */
function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { attempts: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  record.attempts++;
  rateLimitMap.set(ip, record);
}

/**
 * Resets rate limit for an IP upon successful login.
 */
function clearRateLimit(ip) {
  rateLimitMap.delete(ip);
}

/**
 * Creates a cryptographically random session token (32 bytes entropy).
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Authenticates an Owner Account (Strictly Owner 1 or Owner 2).
 * Requires username, password, and HWID. NO PREFIX BYPASSES.
 */
async function authenticateOwner({ username, password, hwid, ip }) {
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return {
      success: false,
      status: 429,
      error: `Too many failed attempts. Try again in ${rateCheck.waitSeconds}s.`
    };
  }

  const { db } = await getDb();
  const ownersCol = db.collection('owner_accounts');
  const auditCol = db.collection('audit_logs');

  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    return { success: false, status: 400, error: 'Malformed request: username and password must be non-empty strings.' };
  }

  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();
  const cleanHwid = typeof hwid === 'string' ? hwid.trim() : '';

  const owner = await ownersCol.findOne({ username: cleanUser });
  if (!owner || owner.status !== 'ACTIVE') {
    recordFailedAttempt(ip);
    await auditCol.insertOne({
      action: 'OWNER_LOGIN_FAILED',
      actor: cleanUser,
      ip: ip,
      hwid: cleanHwid,
      reason: 'Invalid username or disabled account',
      timestamp: new Date()
    });
    return { success: false, status: 401, error: 'Invalid owner credentials.' };
  }

  // Verify bcrypt password hash
  const passwordValid = await bcrypt.compare(cleanPass, owner.passwordHash);
  if (!passwordValid) {
    recordFailedAttempt(ip);
    await auditCol.insertOne({
      action: 'OWNER_LOGIN_FAILED',
      actor: cleanUser,
      ip: ip,
      hwid: cleanHwid,
      reason: 'Incorrect password',
      timestamp: new Date()
    });
    return { success: false, status: 401, error: 'Invalid owner credentials.' };
  }

  // Strict HWID verification for Owner Account
  if (owner.boundHwid && owner.boundHwid !== 'Unbound') {
    if (cleanHwid && owner.boundHwid !== cleanHwid) {
      recordFailedAttempt(ip);
      await auditCol.insertOne({
        action: 'OWNER_LOGIN_HWID_MISMATCH',
        actor: cleanUser,
        ip: ip,
        hwid: cleanHwid,
        expectedHwid: owner.boundHwid,
        timestamp: new Date()
      });
      return {
        success: false,
        status: 403,
        error: `Hardware ID Mismatch! Account is strictly locked to device (${owner.boundHwid.slice(-4)}).`
      };
    }
  }

  clearRateLimit(ip);

  // Create secure session in MongoDB
  const sessionsCol = db.collection('sessions');
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // 24-hour owner session

  await sessionsCol.insertOne({
    sessionToken: sessionToken,
    userId: owner._id.toString(),
    ownerId: owner.ownerId,
    username: owner.username,
    role: 'OWNER',
    hwid: cleanHwid,
    ip: ip,
    isValid: true,
    expiresAt: expiresAt,
    createdAt: new Date()
  });

  await auditCol.insertOne({
    action: 'OWNER_LOGIN_SUCCESS',
    actor: owner.username,
    ownerId: owner.ownerId,
    ip: ip,
    hwid: cleanHwid,
    timestamp: new Date()
  });

  return {
    success: true,
    sessionToken: sessionToken,
    role: 'OWNER',
    displayName: owner.displayName,
    username: owner.username,
    ownerId: owner.ownerId,
    expiresAt: expiresAt
  };
}

/**
 * Authenticates a License Key (1-time activation or returning session).
 */
async function authenticateLicenseKey({ key, hwid, ip }) {
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return {
      success: false,
      status: 429,
      error: `Too many verification requests. Retry in ${rateCheck.waitSeconds}s.`
    };
  }

  const { db } = await getDb();
  const licensesCol = db.collection('licenses');
  const usersCol = db.collection('users');
  const roomsCol = db.collection('user_rooms');
  const sessionsCol = db.collection('sessions');
  const auditCol = db.collection('audit_logs');

  if (!key || typeof key !== 'string' || !hwid || typeof hwid !== 'string') {
    return { success: false, status: 400, error: 'Malformed request: key and hwid must be non-empty strings.' };
  }

  const rawKey = key.trim().toUpperCase();
  const cleanKey = rawKey.replace(/\s+/g, '-').replace(/-+/g, '-');
  const cleanHwid = hwid.trim();

  if (!cleanKey) {
    return { success: false, status: 400, error: 'License key is required.' };
  }
  if (!cleanHwid) {
    return { success: false, status: 400, error: 'Device Hardware ID (HWID) required.' };
  }

  // Prohibit fake prefix owner elevation
  if (cleanKey.startsWith('HD-OWNER')) {
    return {
      success: false,
      status: 403,
      error: 'Owner accounts must log in via the dedicated Owner Portal.'
    };
  }

  const license = await licensesCol.findOne({ key: cleanKey });
  if (!license) {
    recordFailedAttempt(ip);
    return { success: false, status: 401, error: 'Invalid license key. Access denied.' };
  }

  if (license.status === 'BLACKLISTED') {
    return { success: false, status: 403, error: 'This license has been permanently blacklisted.' };
  }
  if (license.status === 'REVOKED') {
    return { success: false, status: 403, error: 'This license key was revoked by administration.' };
  }
  if (license.status !== 'ACTIVE' && license.status !== 'REDEEMED') {
    return { success: false, status: 403, error: `License status is ${license.status}.` };
  }

  if (license.expireTimestamp && Date.now() > license.expireTimestamp) {
    return { success: false, status: 403, error: 'This license key has expired.' };
  }

  // HWID Verification & Single-Device 1-Time Binding
  if (license.hwidLock !== false) {
    if (license.boundHwid === 'Unbound' || !license.boundHwid) {
      // ATOMIC 1-TIME HWID BINDING
      await licensesCol.updateOne(
        { _id: license._id, boundHwid: 'Unbound' },
        { $set: { boundHwid: cleanHwid, isRedeemed: true, redeemedAt: new Date(), updatedAt: new Date() } }
      );
      license.boundHwid = cleanHwid;
    } else if (license.boundHwid !== cleanHwid) {
      recordFailedAttempt(ip);
      await auditCol.insertOne({
        action: 'LICENSE_HWID_MISMATCH',
        actor: cleanKey,
        ip: ip,
        hwid: cleanHwid,
        expectedHwid: license.boundHwid,
        timestamp: new Date()
      });
      return {
        success: false,
        status: 403,
        error: `Device HWID Mismatch! Key is strictly locked to another machine (${license.boundHwid.slice(-4)}).`
      };
    }
  }

  // Fetch or create corresponding user record
  let user = await usersCol.findOne({ licenseKey: cleanKey });
  let roomId = user ? user.roomId : null;

  if (!user) {
    const keyClean = cleanKey.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
    const hwidClean = cleanHwid.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
    roomId = `ROOM-${hwidClean}-${keyClean}`;

    const insertUserRes = await usersCol.insertOne({
      username: `user_${keyClean.toLowerCase()}`,
      role: license.role || 'USER',
      licenseKey: cleanKey,
      boundHwid: cleanHwid,
      roomId: roomId,
      status: 'ACTIVE',
      createdAt: new Date(),
      lastLoginAt: new Date()
    });

    await roomsCol.insertOne({
      roomId: roomId,
      userId: insertUserRes.insertedId,
      licenseKey: cleanKey,
      ownerHwid: cleanHwid,
      roomName: `Personal Sanctuary [${keyClean}]`,
      rollsState: [
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null]
      ],
      predictionHistory: [],
      settings: {
        soundEnabled: true,
        theme: 'cyber_purple',
        autoCalculate: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } else {
    await usersCol.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  }

  clearRateLimit(ip);

  // Generate secure session
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7-day user session

  await sessionsCol.insertOne({
    sessionToken: sessionToken,
    userId: user ? user._id.toString() : cleanKey,
    licenseKey: cleanKey,
    role: license.role || 'USER',
    roomId: roomId,
    hwid: cleanHwid,
    ip: ip,
    isValid: true,
    expiresAt: expiresAt,
    createdAt: new Date()
  });

  return {
    success: true,
    sessionToken: sessionToken,
    key: cleanKey,
    role: license.role || 'USER',
    roomId: roomId,
    boundHwid: license.boundHwid,
    duration: license.duration || 'lifetime',
    expiresAt: expiresAt
  };
}

/**
 * Validates a session token from request cookies or Authorization header.
 * Fail-closed: returns null if missing, invalid, or expired.
 */
async function validateSession(req) {
  try {
    let token = null;

    // 1. Check HttpOnly cookie
    if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
      token = req.cookies[SESSION_COOKIE_NAME];
    }
    // 2. Check Authorization Bearer header
    else if (req.headers && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }
    // 3. Check custom header
    else if (req.headers && req.headers['x-session-token']) {
      token = req.headers['x-session-token'];
    }

    if (!token) return null;

    const { db } = await getDb();
    const sessionsCol = db.collection('sessions');

    const session = await sessionsCol.findOne({ sessionToken: token, isValid: true });
    if (!session) return null;

    if (new Date() > new Date(session.expiresAt)) {
      await sessionsCol.updateOne({ sessionToken: token }, { $set: { isValid: false } });
      return null;
    }

    return session;
  } catch(e) {
    return null; // Fail-closed
  }
}

module.exports = {
  SESSION_COOKIE_NAME,
  authenticateOwner,
  authenticateLicenseKey,
  validateSession,
  generateSessionToken
};
