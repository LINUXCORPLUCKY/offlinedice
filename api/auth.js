const axios = require('axios');

const FIREBASE_BASE_URL = 'https://headlessdice-default-rtdb.asia-southeast1.firebasedatabase.app';
const MASTER_OWNER_KEYS = ['linuxdevpyowner', 'deofc3ey'];

// Duration definitions in milliseconds
const DURATION_MAP = {
  '1day': 1 * 24 * 60 * 60 * 1000,
  '30days': 30 * 24 * 60 * 60 * 1000,
  '1month': 30 * 24 * 60 * 60 * 1000,
  '60days': 60 * 24 * 60 * 60 * 1000,
  '2months': 60 * 24 * 60 * 60 * 1000,
  '90days': 90 * 24 * 60 * 60 * 1000,
  '3months': 90 * 24 * 60 * 60 * 1000,
  'lifetime': null
};

// Safe key encoding for Firebase RTDB path
function toSafeKeyId(key) {
  return Buffer.from(String(key).trim()).toString('hex');
}

// Generate random formatted key
function generateRandomKey(prefix = 'HD') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${segment(4)}-${segment(4)}-${segment(4)}`;
}

// Verify caller permission helper
async function verifyCallerRole(authKey) {
  if (!authKey) return null;
  const cleanKey = String(authKey).trim();
  if (MASTER_OWNER_KEYS.includes(cleanKey)) {
    return 'owner';
  }

  try {
    const keyId = toSafeKeyId(cleanKey);
    const resp = await axios.get(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { timeout: 6000 });
    const data = resp.data;
    if (!data || data.status === 'revoked') return null;
    if (data.expiresAt && Date.now() > data.expiresAt) return null;
    return data.role || 'user';
  } catch (err) {
    return null;
  }
}

// Fetch Admin Permissions configuration
async function getAdminPermissions() {
  try {
    const resp = await axios.get(`${FIREBASE_BASE_URL}/settings/adminPermissions.json`, { timeout: 6000 });
    return resp.data || {
      canCreate1Day: true,
      canCreate30Days: true,
      canCreate60Days: false,
      canCreate90Days: false,
      canCreateLifetime: false,
      canViewVisitors: true,
      canRevokeKeys: false
    };
  } catch {
    return {
      canCreate1Day: true,
      canCreate30Days: true,
      canCreate60Days: false,
      canCreate90Days: false,
      canCreateLifetime: false,
      canViewVisitors: true,
      canRevokeKeys: false
    };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const query = req.query || {};

  const action = (query.action || body.action || '').trim().toLowerCase();
  const authKey = (body.authKey || query.authKey || '').trim();

  try {
    // -------------------------------------------------------------
    // ACTION: VERIFY KEY
    // -------------------------------------------------------------
    if (action === 'verify') {
      const keyInput = (req.query.key || body.key || '').trim();
      if (!keyInput) {
        return res.status(400).json({ success: false, valid: false, error: 'Access Key is required.' });
      }

      // 1. Check Master Owner Keys (Bypass / Always Valid)
      if (MASTER_OWNER_KEYS.includes(keyInput)) {
        return res.json({
          success: true,
          valid: true,
          key: keyInput,
          role: 'owner',
          duration: 'lifetime',
          expiresAt: null,
          remainingMs: null,
          label: 'Master Owner Authority (Private)',
          isMaster: true
        });
      }

      // 2. Query Firebase RTDB
      const keyId = toSafeKeyId(keyInput);
      const resp = await axios.get(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { timeout: 7000 });
      const record = resp.data;

      if (!record) {
        return res.status(404).json({
          success: false,
          valid: false,
          error: 'Access Key does not exist. Check for typos or acquire a key in Discord.'
        });
      }

      if (record.status === 'revoked') {
        return res.status(403).json({
          success: false,
          valid: false,
          error: 'This access key has been revoked by administration.'
        });
      }

      // Check Expiration
      if (record.expiresAt && Date.now() > record.expiresAt) {
        // Mark as expired asynchronously
        axios.patch(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { status: 'expired' }).catch(() => {});
        return res.status(403).json({
          success: false,
          valid: false,
          error: 'This access key has expired. Please renew your subscription.'
        });
      }

      const remainingMs = record.expiresAt ? Math.max(0, record.expiresAt - Date.now()) : null;

      return res.json({
        success: true,
        valid: true,
        key: record.key,
        role: record.role || 'user',
        duration: record.duration || 'custom',
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        remainingMs,
        label: record.label || '',
        isMaster: false
      });
    }

    // -------------------------------------------------------------
    // ACTION: CREATE KEY (Owner & Admin)
    // -------------------------------------------------------------
    if (action === 'create_key') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Unauthorized: Owner or Admin key required.' });
      }

      const roleToCreate = (body.role || 'user').trim().toLowerCase();
      const duration = (body.duration || '30days').trim().toLowerCase();
      const label = (body.label || '').trim();
      const customKey = (body.customKey || '').trim();

      // Permission checks for Admin
      if (callerRole === 'admin') {
        if (roleToCreate !== 'user') {
          return res.status(403).json({ success: false, error: 'Admins are only permitted to generate User keys.' });
        }
        const perms = await getAdminPermissions();
        if (duration === '1day' && !perms.canCreate1Day) {
          return res.status(403).json({ success: false, error: 'Admin permission to create 1-Day keys is disabled by Owner.' });
        }
        if ((duration === '30days' || duration === '1month') && !perms.canCreate30Days) {
          return res.status(403).json({ success: false, error: 'Admin permission to create 30-Day keys is disabled by Owner.' });
        }
        if ((duration === '60days' || duration === '2months') && !perms.canCreate60Days) {
          return res.status(403).json({ success: false, error: 'Admin permission to create 2-Month keys is disabled by Owner.' });
        }
        if ((duration === '90days' || duration === '3months') && !perms.canCreate90Days) {
          return res.status(403).json({ success: false, error: 'Admin permission to create 3-Month keys is disabled by Owner.' });
        }
        if (duration === 'lifetime' && !perms.canCreateLifetime) {
          return res.status(403).json({ success: false, error: 'Admin permission to create Lifetime keys is disabled by Owner.' });
        }
      }

      // Calculate expiration
      const durationMs = DURATION_MAP.hasOwnProperty(duration) 
        ? DURATION_MAP[duration] 
        : (parseInt(duration, 10) > 0 ? parseInt(duration, 10) * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000);

      const now = Date.now();
      const expiresAt = durationMs ? now + durationMs : null;

      let finalKeyString = customKey;
      if (!finalKeyString) {
        const prefix = roleToCreate === 'owner' ? 'HD-OWNER' : (roleToCreate === 'admin' ? 'HD-ADMIN' : 'HD-KEY');
        finalKeyString = generateRandomKey(prefix);
      }

      const keyId = toSafeKeyId(finalKeyString);
      const newRecord = {
        key: finalKeyString,
        role: roleToCreate,
        duration: duration,
        createdAt: now,
        expiresAt,
        status: 'active',
        label: label || `Created via ${callerRole.toUpperCase()} Panel`,
        createdBy: callerRole
      };

      await axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, newRecord, { timeout: 7000 });

      return res.json({
        success: true,
        message: 'Key generated successfully.',
        key: newRecord
      });
    }

    // -------------------------------------------------------------
    // ACTION: LIST KEYS (Owner & Admin)
    // -------------------------------------------------------------
    if (action === 'list_keys') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Unauthorized: Owner or Admin key required.' });
      }

      const resp = await axios.get(`${FIREBASE_BASE_URL}/keys.json`, { timeout: 7000 });
      const rawData = resp.data || {};

      let keyList = Object.values(rawData).map(k => {
        const isMaster = MASTER_OWNER_KEYS.includes(k.key);
        const isExpired = k.expiresAt && Date.now() > k.expiresAt;
        const currentStatus = k.status === 'revoked' ? 'revoked' : (isExpired ? 'expired' : k.status || 'active');
        return {
          ...k,
          status: currentStatus,
          isMaster
        };
      });

      // If caller is admin, hide owner keys and mask master keys
      if (callerRole === 'admin') {
        keyList = keyList.filter(k => k.role !== 'owner' && !k.isMaster);
      }

      // Sort newest first
      keyList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      return res.json({
        success: true,
        callerRole,
        total: keyList.length,
        keys: keyList
      });
    }

    // -------------------------------------------------------------
    // ACTION: REVOKE KEY
    // -------------------------------------------------------------
    if (action === 'revoke_key') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }

      if (callerRole === 'admin') {
        const perms = await getAdminPermissions();
        if (!perms.canRevokeKeys) {
          return res.status(403).json({ success: false, error: 'Admin key revocation is disabled by Owner.' });
        }
      }

      const targetKey = (body.targetKey || query.targetKey || '').trim();
      if (!targetKey) {
        return res.status(400).json({ success: false, error: 'Target key is required.' });
      }

      if (MASTER_OWNER_KEYS.includes(targetKey)) {
        return res.status(400).json({ success: false, error: 'Master Owner Keys cannot be revoked.' });
      }

      const keyId = toSafeKeyId(targetKey);
      await axios.patch(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { status: 'revoked' }, { timeout: 6000 });

      return res.json({ success: true, message: `Key '${targetKey}' revoked.` });
    }

    // -------------------------------------------------------------
    // ACTION: DELETE KEY
    // -------------------------------------------------------------
    if (action === 'delete_key') {
      const callerRole = await verifyCallerRole(authKey);
      if (callerRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Only Owner can permanently delete keys.' });
      }

      const targetKey = (body.targetKey || query.targetKey || '').trim();
      if (!targetKey) {
        return res.status(400).json({ success: false, error: 'Target key is required.' });
      }

      if (MASTER_OWNER_KEYS.includes(targetKey)) {
        return res.status(400).json({ success: false, error: 'Master Owner Keys cannot be deleted.' });
      }

      const keyId = toSafeKeyId(targetKey);
      await axios.delete(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { timeout: 6000 });

      return res.json({ success: true, message: `Key '${targetKey}' permanently deleted.` });
    }

    // -------------------------------------------------------------
    // ACTION: LOG VISITOR
    // -------------------------------------------------------------
    if (action === 'log_visit') {
      const headers = req.headers || {};
      const keyUsed = (body.key || 'Anonymous').trim();
      const role = (body.role || 'visitor').trim();
      const userAgent = (body.userAgent || headers['user-agent'] || 'Unknown').slice(0, 160);
      const ip = (headers['x-forwarded-for'] || req.socket?.remoteAddress || 'Hidden').split(',')[0].trim();

      const visitRecord = {
        timestamp: Date.now(),
        key: MASTER_OWNER_KEYS.includes(keyUsed) ? '[MASTER_KEY]' : keyUsed,
        role,
        userAgent,
        ip
      };

      // Push asynchronously to Firebase
      axios.post(`${FIREBASE_BASE_URL}/visitors.json`, visitRecord, { timeout: 4000 }).catch(() => {});

      return res.json({ success: true });
    }

    // -------------------------------------------------------------
    // ACTION: GET VISITORS (Owner & permitted Admin)
    // -------------------------------------------------------------
    if (action === 'get_visitors') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }

      if (callerRole === 'admin') {
        const perms = await getAdminPermissions();
        if (!perms.canViewVisitors) {
          return res.status(403).json({ success: false, error: 'Visitor logs access disabled for Admins.' });
        }
      }

      const resp = await axios.get(`${FIREBASE_BASE_URL}/visitors.json`, { timeout: 7000 });
      const rawData = resp.data || {};
      const visits = Object.values(rawData);

      // Sort newest first, keep last 100
      visits.sort((a, b) => b.timestamp - a.timestamp);
      const recentVisits = visits.slice(0, 100);

      // Metrics
      const totalVisits = visits.length;
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const visits24h = visits.filter(v => v.timestamp > oneDayAgo).length;
      const uniqueKeys = new Set(visits.map(v => v.key).filter(k => k && k !== 'Anonymous')).size;

      return res.json({
        success: true,
        stats: {
          totalVisits,
          visits24h,
          uniqueKeys
        },
        visitors: recentVisits
      });
    }

    // -------------------------------------------------------------
    // ACTION: ADMIN PERMISSIONS (Get & Save)
    // -------------------------------------------------------------
    if (action === 'get_admin_perms') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }

      const perms = await getAdminPermissions();
      return res.json({ success: true, permissions: perms, callerRole });
    }

    if (action === 'save_admin_perms') {
      const callerRole = await verifyCallerRole(authKey);
      if (callerRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Only Owner can change Admin permissions.' });
      }

      const newPerms = body.permissions || {};
      const cleanPerms = {
        canCreate1Day: Boolean(newPerms.canCreate1Day),
        canCreate30Days: Boolean(newPerms.canCreate30Days),
        canCreate60Days: Boolean(newPerms.canCreate60Days),
        canCreate90Days: Boolean(newPerms.canCreate90Days),
        canCreateLifetime: Boolean(newPerms.canCreateLifetime),
        canViewVisitors: Boolean(newPerms.canViewVisitors),
        canRevokeKeys: Boolean(newPerms.canRevokeKeys)
      };

      await axios.put(`${FIREBASE_BASE_URL}/settings/adminPermissions.json`, cleanPerms, { timeout: 6000 });

      return res.json({ success: true, message: 'Admin permissions updated.', permissions: cleanPerms });
    }

    return res.status(400).json({ success: false, error: `Unrecognized action '${action}'.` });

  } catch (err) {
    console.error('[Auth API Error]:', err.message);
    return res.status(500).json({
      success: false,
      error: `Auth service error: ${err.message}`
    });
  }
};
