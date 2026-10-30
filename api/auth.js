const axios = require('axios');

const FIREBASE_BASE_URL = 'https://headlessdice-default-rtdb.asia-southeast1.firebasedatabase.app';
const MASTER_OWNER_KEYS = ['deofc3ey'];

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
      canRevokeKeys: false,
      canResetHWID: true
    };
  } catch {
    return {
      canCreate1Day: true,
      canCreate30Days: true,
      canCreate60Days: false,
      canCreate90Days: false,
      canCreateLifetime: false,
      canRevokeKeys: false,
      canResetHWID: true
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
    // ACTION: VERIFY KEY WITH HWID LOCK
    // -------------------------------------------------------------
    if (action === 'verify') {
      const keyInput = (query.key || body.key || '').trim();
      const clientHwid = (body.hwid || query.hwid || '').trim();

      if (!keyInput) {
        return res.status(400).json({ success: false, valid: false, error: 'Access Key is required.' });
      }

      // 1. Check Master Owner Key: deofc3ey (Bypasses HWID lock)
      if (MASTER_OWNER_KEYS.includes(keyInput)) {
        return res.json({
          success: true,
          valid: true,
          key: keyInput,
          role: 'owner',
          duration: 'lifetime',
          expiresAt: null,
          remainingMs: null,
          label: 'Sole Master Owner Authority (Private)',
          isMaster: true,
          hwid: 'MASTER-BYPASS'
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
        axios.patch(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { status: 'expired' }).catch(() => {});
        return res.status(403).json({
          success: false,
          valid: false,
          error: 'This access key has expired. Please renew your subscription.'
        });
      }

      // 3. HWID Lock Validation & Auto-Binding
      if (clientHwid) {
        if (record.hwid) {
          // Already bound: verify match
          if (record.hwid !== clientHwid) {
            return res.status(403).json({
              success: false,
              valid: false,
              hwidMismatch: true,
              error: `HWID Mismatch: This key is bound to another device (${record.hwid}). Contact Discord support to request an HWID reset.`
            });
          }
        } else {
          // First use on device: bind HWID
          await axios.patch(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, {
            hwid: clientHwid,
            hwidBoundAt: Date.now()
          }, { timeout: 6000 });
          record.hwid = clientHwid;
        }
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
        hwid: record.hwid || null,
        isMaster: false
      });
    }

    // -------------------------------------------------------------
    // ACTION: RESET HWID (Owner & permitted Admin)
    // -------------------------------------------------------------
    if (action === 'reset_hwid') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }

      if (callerRole === 'admin') {
        const perms = await getAdminPermissions();
        if (!perms.canResetHWID) {
          return res.status(403).json({ success: false, error: 'Admin HWID reset permission is disabled by Owner.' });
        }
      }

      const targetKey = (body.targetKey || query.targetKey || '').trim();
      if (!targetKey) {
        return res.status(400).json({ success: false, error: 'Target key is required.' });
      }

      const keyId = toSafeKeyId(targetKey);
      await axios.patch(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, {
        hwid: null,
        hwidBoundAt: null
      }, { timeout: 6000 });

      return res.json({
        success: true,
        message: `HWID lock for key '${targetKey}' has been reset. The key is now unbound and will lock to the next device used.`
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
        hwid: null,
        hwidBoundAt: null,
        label: label || `Created via ${callerRole.toUpperCase()} Panel`,
        createdBy: callerRole
      };

      await axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, newRecord, { timeout: 7000 });

      return res.json({
        success: true,
        message: 'Key generated successfully with HWID protection.',
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
          hwid: k.hwid || null,
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
        return res.status(400).json({ success: false, error: 'Master Owner Key cannot be revoked.' });
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
        return res.status(400).json({ success: false, error: 'Master Owner Key cannot be deleted.' });
      }

      const keyId = toSafeKeyId(targetKey);
      await axios.delete(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { timeout: 6000 });

      return res.json({ success: true, message: `Key '${targetKey}' permanently deleted.` });
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
        canRevokeKeys: Boolean(newPerms.canRevokeKeys),
        canResetHWID: Boolean(newPerms.canResetHWID)
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
