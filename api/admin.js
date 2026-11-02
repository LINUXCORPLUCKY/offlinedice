// ==============================================================================
// HEADLESS DICE — ENTERPRISE OWNER AUTHORITY & ADMINISTRATION API
// Strictly Locked to Provisioned Owner Accounts & MongoDB Atlas
// ==============================================================================

const { authenticateOwner, validateSession, SESSION_COOKIE_NAME } = require('../lib/auth');
const { getDb } = require('../lib/db');
const {
  getSystemState,
  setMaintenanceState,
  triggerForceRefresh,
  setAnnouncement
} = require('../lib/system_manager');

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  const origin = reqOrigin(res.req);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.end(JSON.stringify(data));
}

function reqOrigin(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const clientOrigin = req && req.headers ? req.headers.origin : null;
  if (!clientOrigin) return '*';
  if (allowed.length === 0 || allowed.includes(clientOrigin)) return clientOrigin;
  return allowed[0] || '*';
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

function durationToTimestamp(dur) {
  const now = Date.now();
  switch (dur) {
    case '24hours': return now + 24 * 3600 * 1000;
    case '7days': return now + 7 * 86400 * 1000;
    case '30days': return now + 30 * 86400 * 1000;
    case '60days': return now + 60 * 86400 * 1000;
    case 'lifetime':
    default: return null;
  }
}

module.exports = async (req, res) => {
  res.req = req;
  const origin = reqOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

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
        try { resolve(JSON.parse(b)); } catch(e) { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });

    const body = (await getBody()) || {};
    const action = body.action || '';
    const clientIp = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || '127.0.0.1';

    // 1. OWNER LOGIN (Does not require prior session)
    if (action === 'owner_login') {
      const username = body.username;
      const password = body.password;
      const hwid = body.hwid;

      const authRes = await authenticateOwner({ username, password, hwid, ip: clientIp });
      if (!authRes.success) {
        return sendJson(res, authRes.status || 401, { success: false, error: authRes.error });
      }

      // Issue HttpOnly Owner Cookie
      const isProd = process.env.NODE_ENV === 'production';
      const cookieHeader = `${SESSION_COOKIE_NAME}=${authRes.sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${86400}${isProd ? '; Secure' : ''}`;
      res.setHeader('Set-Cookie', cookieHeader);

      return sendJson(res, 200, {
        success: true,
        role: 'OWNER',
        displayName: authRes.displayName,
        username: authRes.username,
        ownerId: authRes.ownerId,
        sessionToken: authRes.sessionToken,
        message: 'Owner privileges unlocked'
      });
    }

    // 2. ALL OTHER ACTIONS REQUIRE VALID OWNER SESSION
    const session = await validateSession(req);
    if (!session || session.role !== 'OWNER') {
      return sendJson(res, 401, {
        success: false,
        error: 'Unauthorized: Valid Owner Authority Session Required.'
      });
    }

    const { db } = await getDb();
    const licensesCol = db.collection('licenses');
    const usersCol = db.collection('users');
    const roomsCol = db.collection('user_rooms');
    const auditCol = db.collection('audit_logs');

    // VERIFY OWNER SESSION
    if (action === 'verify_owner') {
      return sendJson(res, 200, {
        success: true,
        role: 'OWNER',
        username: session.username || 'Owner'
      });
    }

    // OWNER DASHBOARD METRICS
    if (action === 'get_stats') {
      const totalLicenses = await licensesCol.countDocuments({});
      const activeLicenses = await licensesCol.countDocuments({ status: 'ACTIVE' });
      const boundLicenses = await licensesCol.countDocuments({ boundHwid: { $nin: ['Unbound', null, ''] } });
      const revokedLicenses = await licensesCol.countDocuments({ status: 'REVOKED' });
      const totalUsers = await usersCol.countDocuments({});
      const activeRooms = await roomsCol.countDocuments({});

      const sysState = await getSystemState();

      return sendJson(res, 200, {
        success: true,
        stats: {
          totalUsers: Math.max(totalUsers, activeLicenses),
          activeUsers: Math.max(1, activeLicenses),
          totalLicenses: totalLicenses,
          activeLicenses: activeLicenses,
          boundLicenses: boundLicenses,
          revokedLicenses: revokedLicenses,
          activeRooms: activeRooms,
          maintenance: sysState.maintenance.enabled
        }
      });
    }

    // LIST / SEARCH LICENSES
    if (action === 'list_keys') {
      const search = (body.search || '').trim();
      const query = {};
      if (search) {
        query.key = { $regex: search, $options: 'i' };
      }
      const keys = await licensesCol.find(query).sort({ createdAt: -1 }).limit(100).toArray();

      const mapped = {};
      keys.forEach(k => {
        mapped[k.key] = {
          role: k.role,
          boundHwid: k.boundHwid,
          status: k.status,
          duration: k.duration,
          createdTimestamp: k.createdTimestamp,
          expireTimestamp: k.expireTimestamp,
          notes: k.notes
        };
      });

      return sendJson(res, 200, { success: true, keys: mapped });
    }

    // GENERATE NEW LICENSE KEY
    if (action === 'generate_key') {
      const role = (body.role || 'USER').toUpperCase();
      const duration = body.duration || 'lifetime';
      const notes = body.notes || 'Admin Generated';
      const keyPrefix = role === 'VIP' ? 'HD-VIP' : 'HD-USER';
      const newKey = generateRandomKey(keyPrefix);
      const expireTs = durationToTimestamp(duration);

      await licensesCol.insertOne({
        key: newKey,
        role: role,
        boundHwid: 'Unbound',
        status: 'ACTIVE',
        duration: duration,
        hwidLock: true,
        isRedeemed: false,
        createdTimestamp: Date.now(),
        expireTimestamp: expireTs,
        notes: notes,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await auditCol.insertOne({
        action: 'LICENSE_GENERATED',
        actor: session.username || 'OWNER',
        details: { key: newKey, role, duration },
        timestamp: new Date()
      });

      return sendJson(res, 200, {
        success: true,
        key: newKey,
        message: 'License key created'
      });
    }

    // RESET HWID TO UNBOUND
    if (action === 'reset_hwid') {
      const targetKey = (body.key || '').trim().toUpperCase();
      if (!targetKey) {
        return sendJson(res, 400, { success: false, error: 'Target key required' });
      }

      await licensesCol.updateOne(
        { key: targetKey },
        { $set: { boundHwid: 'Unbound', isRedeemed: false, updatedAt: new Date() } }
      );

      await auditCol.insertOne({
        action: 'HWID_RESET',
        actor: session.username || 'OWNER',
        details: { targetKey },
        timestamp: new Date()
      });

      return sendJson(res, 200, { success: true, message: `HWID unbound for ${targetKey}` });
    }

    // UPDATE STATUS (REVOKE / ACTIVATE)
    if (action === 'update_status') {
      const targetKey = (body.key || '').trim().toUpperCase();
      const nextStatus = (body.status || 'ACTIVE').toUpperCase();

      await licensesCol.updateOne(
        { key: targetKey },
        { $set: { status: nextStatus, updatedAt: new Date() } }
      );

      return sendJson(res, 200, { success: true, message: `Key status set to ${nextStatus}` });
    }

    // DELETE LICENSE
    if (action === 'delete_key') {
      const targetKey = (body.key || '').trim().toUpperCase();
      await licensesCol.deleteOne({ key: targetKey });
      return sendJson(res, 200, { success: true, message: `Key ${targetKey} deleted` });
    }

    // PURGE EXPIRED LICENSES
    if (action === 'purge_expired') {
      const now = Date.now();
      const resPurge = await licensesCol.deleteMany({
        expireTimestamp: { $ne: null, $lt: now }
      });
      return sendJson(res, 200, {
        success: true,
        purgedCount: resPurge.deletedCount || 0
      });
    }

    // SYSTEM MAINTENANCE TOGGLE
    if (action === 'toggle_maintenance') {
      const nextState = Boolean(body.enabled);
      const reason = body.reason || 'Upgrading prediction models and algorithms';
      const mState = await setMaintenanceState(nextState, reason, session.username || 'OWNER');
      return sendJson(res, 200, { success: true, maintenance: mState });
    }

    // BROADCAST FORCE REFRESH
    if (action === 'force_refresh') {
      const cState = await triggerForceRefresh(body.reason || 'Admin force refresh', session.username || 'OWNER');
      return sendJson(res, 200, { success: true, control: cState });
    }

    // BROADCAST ANNOUNCEMENT
    if (action === 'set_announcement') {
      const text = body.text || '';
      const type = body.type || 'info';
      const ann = await setAnnouncement(text, type, session.username || 'OWNER');
      return sendJson(res, 200, { success: true, announcement: ann });
    }

    // SECURITY AUDIT LOGS
    if (action === 'get_audit_logs') {
      const logs = await auditCol.find({}).sort({ timestamp: -1 }).limit(50).toArray();
      return sendJson(res, 200, { success: true, logs });
    }

    return sendJson(res, 400, { success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: 'Admin server error' });
  }
};
