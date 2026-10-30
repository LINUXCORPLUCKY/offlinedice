const axios = require('axios');

const FIREBASE_BASE_URL = 'https://headlessdice-default-rtdb.asia-southeast1.firebasedatabase.app';
const MASTER_OWNER_KEYS = ['linuxdevpy6767'];

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

      const isMaster = MASTER_OWNER_KEYS.includes(keyInput);
      const keyId = toSafeKeyId(keyInput);
      let resp;
      try {
        resp = await axios.get(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { timeout: 7000 });
      } catch (e) {
        resp = { data: null };
      }
      let record = resp.data;

      // Master key seed if not present in Firebase yet
      if (isMaster && !record) {
        record = {
          key: keyInput,
          role: 'owner',
          duration: 'lifetime',
          createdAt: Date.now(),
          expiresAt: null,
          status: 'active',
          hwid: null,
          hwidBoundAt: null,
          label: 'Sole Master Owner Authority (Private - Single Device HWID)',
          createdBy: 'system'
        };
        await axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, record, { timeout: 6000 }).catch(() => {});
      }

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

      // Check Expiration (Master Key never expires)
      if (!isMaster && record.expiresAt && Date.now() > record.expiresAt) {
        axios.patch(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { status: 'expired' }).catch(() => {});
        return res.status(403).json({
          success: false,
          valid: false,
          error: 'This access key has expired. Please renew your subscription.'
        });
      }

      // 3. HWID Lock Validation & Auto-Binding (Strictly locks master key linuxdevpy6767 to 1 device as well!)
      // If hwidLock is explicitly disabled (e.g. Free public key), bypass HWID device lock completely
      const isHwidDisabled = record.hwidLock === false || record.hwidDisabled === true;

      if (!isHwidDisabled && clientHwid) {
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
          // First use on device: bind HWID permanently
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
        role: isMaster ? 'owner' : (record.role || 'user'),
        duration: isMaster ? 'lifetime' : (record.duration || 'custom'),
        createdAt: record.createdAt,
        expiresAt: isMaster ? null : record.expiresAt,
        remainingMs,
        label: record.label || '',
        hwid: isHwidDisabled ? 'DISABLED' : (record.hwid || null),
        hwidLock: !isHwidDisabled,
        isMaster
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
      // HWID lock option: defaults to true, false disables hardware lock
      const hwidLock = body.hwidLock !== false && body.hwidLock !== 'false';

      // Permission checks for Admin
      if (callerRole === 'admin') {
        if (roleToCreate !== 'user' && roleToCreate !== 'free') {
          return res.status(403).json({ success: false, error: 'Admins are only permitted to generate User or Free keys.' });
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
        const prefix = roleToCreate === 'owner' ? 'HD-OWNER' : (roleToCreate === 'admin' ? 'HD-ADMIN' : (roleToCreate === 'free' ? 'HD-FREE' : 'HD-KEY'));
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
        hwidLock: Boolean(hwidLock),
        label: label || `Created via ${callerRole.toUpperCase()} Panel`,
        createdBy: callerRole
      };

      await axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, newRecord, { timeout: 7000 });

      return res.json({
        success: true,
        message: hwidLock ? 'Key generated successfully with HWID protection.' : 'Key generated with HWID lock disabled (multi-device allowed).',
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
        const isHwidDisabled = k.hwidLock === false || k.hwidDisabled === true;
        return {
          ...k,
          status: currentStatus,
          hwid: isHwidDisabled ? 'DISABLED' : (k.hwid || null),
          hwidLock: !isHwidDisabled,
          isMaster
        };
      });

      // Completely hide Master Owner keys from the Key Vault table for all roles
      keyList = keyList.filter(k => !k.isMaster && !MASTER_OWNER_KEYS.includes(k.key) && k.key !== 'linuxdevpy6767');

      // If caller is admin, also hide any generated owner keys
      if (callerRole === 'admin') {
        keyList = keyList.filter(k => k.role !== 'owner');
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

    // -------------------------------------------------------------
    // ACTION: RECORD VISIT (100% Anonymous Counter, No IP, No Device)
    // -------------------------------------------------------------
    if (action === 'record_visit') {
      const sessionId = (body.sessionId || query.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      
      // Increment total visits counter atomically
      axios.patch(`${FIREBASE_BASE_URL}/stats.json`, {
        totalVisits: { '.sv': { 'increment': 1 } }
      }, { timeout: 5000 }).catch(() => {});

      // Record active heartbeat timestamp
      if (sessionId) {
        axios.put(`${FIREBASE_BASE_URL}/active_sessions/${sessionId}.json`, {
          lastSeen: Date.now()
        }, { timeout: 5000 }).catch(() => {});
      }

      return res.json({ success: true });
    }

    // -------------------------------------------------------------
    // ACTION: PING ACTIVE (Anonymous Session Heartbeat)
    // -------------------------------------------------------------
    if (action === 'ping_active') {
      const sessionId = (body.sessionId || query.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      if (sessionId) {
        axios.put(`${FIREBASE_BASE_URL}/active_sessions/${sessionId}.json`, {
          lastSeen: Date.now()
        }, { timeout: 5000 }).catch(() => {});
      }
      return res.json({ success: true });
    }

    // -------------------------------------------------------------
    // ACTION: GET USAGE STATS (Counters Only: Total Visits, Active Online, Active Keys)
    // -------------------------------------------------------------
    if (action === 'get_usage_stats') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Unauthorized: Owner or Admin key required.' });
      }

      // Query stats, active sessions, and keys in parallel
      const [statsResp, sessionsResp, keysResp] = await Promise.all([
        axios.get(`${FIREBASE_BASE_URL}/stats.json`, { timeout: 6000 }).catch(() => ({ data: {} })),
        axios.get(`${FIREBASE_BASE_URL}/active_sessions.json`, { timeout: 6000 }).catch(() => ({ data: {} })),
        axios.get(`${FIREBASE_BASE_URL}/keys.json`, { timeout: 6000 }).catch(() => ({ data: {} }))
      ]);

      const statsData = statsResp.data || {};
      const sessionsData = sessionsResp.data || {};
      const keysData = keysResp.data || {};

      const totalVisits = Number(statsData.totalVisits) || 0;
      const now = Date.now();
      const activeWindow = 5 * 60 * 1000; // 5 minutes window for live active users

      let onlineNow = 0;
      const staleSessionIds = [];

      for (const [id, s] of Object.entries(sessionsData)) {
        if (s && s.lastSeen) {
          if (now - s.lastSeen <= activeWindow) {
            onlineNow++;
          } else if (now - s.lastSeen > 30 * 60 * 1000) {
            staleSessionIds.push(id);
          }
        }
      }

      // Cleanup stale sessions asynchronously in background
      if (staleSessionIds.length > 0) {
        Promise.all(staleSessionIds.slice(0, 20).map(id =>
          axios.delete(`${FIREBASE_BASE_URL}/active_sessions/${id}.json`).catch(() => {})
        )).catch(() => {});
      }

      // Count active keys
      let activeKeys = 0;
      for (const k of Object.values(keysData)) {
        if (k && k.status === 'active' && (!k.expiresAt || k.expiresAt > now)) {
          activeKeys++;
        }
      }

      return res.json({
        success: true,
        totalVisits,
        onlineNow: Math.max(1, onlineNow), // At least current active viewer
        activeKeys
      });
    }

    // -------------------------------------------------------------
    // ACTION: LOG DICE PREDICTION (Player Activity Feed - No IP/Device)
    // -------------------------------------------------------------
    if (action === 'log_prediction') {
      const logEntry = {
        timestamp: Date.now(),
        key: (body.key || 'Anonymous').trim().slice(0, 40),
        role: (body.role || 'user').trim().slice(0, 16),
        sessionId: (body.sessionId || 'Unknown').trim().slice(0, 64),
        predictedColor: (body.predictedColor || 'Unknown').trim().slice(0, 20),
        predictedHex: (body.predictedHex || '#b026ff').trim().slice(0, 10),
        confidence: Number(body.confidence) || 85,
        strategy: (body.strategy || 'Dynamic Convergence').trim().slice(0, 40),
        totalRolls: Number(body.totalRolls) || 0,
        fairness: (body.fairness || 'FAIR').trim().slice(0, 12)
      };

      await axios.post(`${FIREBASE_BASE_URL}/prediction_logs.json`, logEntry, { timeout: 5000 }).catch(() => {});
      return res.json({ success: true });
    }

    // -------------------------------------------------------------
    // ACTION: GET PREDICTION LOGS (Owner & Admin View)
    // -------------------------------------------------------------
    if (action === 'get_prediction_logs') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Unauthorized: Owner or Admin key required.' });
      }

      const resp = await axios.get(`${FIREBASE_BASE_URL}/prediction_logs.json`, { timeout: 7000 }).catch(() => ({ data: {} }));
      const raw = resp.data || {};

      let logs = Object.entries(raw).map(([id, item]) => ({
        id,
        ...item
      }));

      // Sort newest first, keep last 100
      logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      if (logs.length > 100) {
        logs = logs.slice(0, 100);
      }

      return res.json({
        success: true,
        total: logs.length,
        logs
      });
    }

    // -------------------------------------------------------------
    // ACTION: CLEAR PREDICTION LOGS (Owner Only)
    // -------------------------------------------------------------
    if (action === 'clear_prediction_logs') {
      const callerRole = await verifyCallerRole(authKey);
      if (callerRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Only Owner can clear prediction logs.' });
      }

      await axios.delete(`${FIREBASE_BASE_URL}/prediction_logs.json`, { timeout: 6000 });
      return res.json({ success: true, message: 'All prediction logs cleared.' });
    }

    // -------------------------------------------------------------
    // ACTION: GET WEBSITE ANNOUNCEMENT (Public)
    // -------------------------------------------------------------
    if (action === 'get_announcement') {
      try {
        const resp = await axios.get(`${FIREBASE_BASE_URL}/announcement.json`, { timeout: 6000 });
        const ann = resp.data || {
          enabled: true,
          title: '⚡ CRITICAL WIN STRATEGY RULE',
          message: 'When you win on a predicted dice color, you MUST roll 5 times in your game before requesting your next prediction!',
          type: 'warning',
          updatedAt: Date.now()
        };
        return res.json({ success: true, announcement: ann });
      } catch {
        return res.json({
          success: true,
          announcement: {
            enabled: true,
            title: '⚡ CRITICAL WIN STRATEGY RULE',
            message: 'When you win on a predicted dice color, you MUST roll 5 times in your game before requesting your next prediction!',
            type: 'warning',
            updatedAt: Date.now()
          }
        });
      }
    }

    // -------------------------------------------------------------
    // ACTION: SAVE WEBSITE ANNOUNCEMENT (Owner Only)
    // -------------------------------------------------------------
    if (action === 'save_announcement') {
      const callerRole = await verifyCallerRole(authKey);
      if (callerRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Only Owner can publish announcements.' });
      }

      const title = (body.title || 'HEADLESS DICE ANNOUNCEMENT').trim().slice(0, 80);
      const message = (body.message || '').trim().slice(0, 500);
      const type = (body.type || 'warning').trim().toLowerCase();
      const enabled = body.enabled !== undefined ? Boolean(body.enabled) : true;

      if (!message) {
        return res.status(400).json({ success: false, error: 'Announcement message cannot be empty.' });
      }

      const announcementData = {
        enabled,
        title,
        message,
        type,
        updatedAt: Date.now(),
        updatedBy: 'owner'
      };

      await axios.put(`${FIREBASE_BASE_URL}/announcement.json`, announcementData, { timeout: 6000 });
      return res.json({ success: true, message: 'Website announcement updated live.', announcement: announcementData });
    }

    // -------------------------------------------------------------
    // ACTION: CLEAR WEBSITE ANNOUNCEMENT (Owner Only)
    // -------------------------------------------------------------
    if (action === 'delete_announcement') {
      const callerRole = await verifyCallerRole(authKey);
      if (callerRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Only Owner can delete announcements.' });
      }

      await axios.patch(`${FIREBASE_BASE_URL}/announcement.json`, { enabled: false, message: '' }, { timeout: 6000 });
      return res.json({ success: true, message: 'Announcement hidden from website.' });
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
