const axios = require('axios');
const crypto = require('crypto');
const {
  FIREBASE_BASE_URL,
  isMasterOwnerKey,
  verifyOwnerPin: checkPinValid,
  extractOwnerPin,
  encryptRecord,
  decryptRecord,
  toSafeKeyId,
  getRoomIdForKey
} = require('./_security');

function verifyOwnerPin(req, body, query) {
  const pin = extractOwnerPin(req, body, query);
  return checkPinValid(pin);
}

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

// Generate random formatted key
function generateRandomKey(prefix = 'HD') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${segment(4)}-${segment(4)}-${segment(4)}`;
}

// Verify caller permission helper with strict owner immunity
async function verifyCallerRole(authKey) {
  if (!authKey) return null;
  const cleanKey = String(authKey).trim();
  // ONLY hardcoded master keys can EVER have 'owner' role
  if (isMasterOwnerKey(cleanKey)) {
    return 'owner';
  }

  try {
    const keyId = toSafeKeyId(cleanKey);
    const resp = await axios.get(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { timeout: 6000 });
    const rawData = resp.data;
    if (!rawData) return null;
    const data = decryptRecord(rawData);
    if (!data || data.status === 'revoked') return null;
    if (data.expiresAt && Date.now() > data.expiresAt) return null;

    // FORTRESS SECURITY: Database keys can NEVER be owner under any circumstance
    if (data.role === 'owner') {
      return 'user';
    }
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Owner-Pin');

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

      const isMaster = isMasterOwnerKey(keyInput);
      const keyId = toSafeKeyId(keyInput);
      let resp;
      try {
        resp = await axios.get(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { timeout: 7000 });
      } catch (e) {
        resp = { data: null };
      }
      let rawData = resp.data;
      let record = decryptRecord(rawData);

      // Master key seed if not present in Firebase yet (always stored encrypted)
      if (isMaster && !record) {
        record = {
          key: keyInput,
          role: 'owner',
          duration: 'lifetime',
          createdAt: Date.now(),
          expiresAt: null,
          status: 'active',
          hwid: clientHwid || null,
          hwidBoundAt: clientHwid ? Date.now() : null,
          label: 'Sole Master Owner Authority (Private - Single Device HWID)',
          createdBy: 'system'
        };
        await axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, encryptRecord(record), { timeout: 6000 }).catch(() => {});
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
        record.status = 'expired';
        axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, encryptRecord(record)).catch(() => {});
        return res.status(403).json({
          success: false,
          valid: false,
          error: 'This access key has expired. Please renew your subscription.'
        });
      }

      // HWID Device Lock (Master Owners are exempt from single-hardware lockouts)
      const isHwidDisabled = isMaster || record.role === 'owner' || record.hwidLock === false || record.hwidDisabled === true;

      if (!isHwidDisabled && clientHwid) {
        if (record.hwid) {
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
          record.hwid = clientHwid;
          record.hwidBoundAt = Date.now();
          await axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, encryptRecord(record), { timeout: 6000 }).catch(() => {});
        }
      }

      const remainingMs = record.expiresAt ? Math.max(0, record.expiresAt - Date.now()) : null;
      const userRoomId = getRoomIdForKey(record.key);

      // Auto-register dedicated user room metadata in Firebase RTDB
      axios.patch(`${FIREBASE_BASE_URL}/user_rooms/${userRoomId}/meta.json`, {
        roomId: userRoomId,
        role: isMaster ? 'owner' : (record.role || 'user'),
        lastActive: Date.now(),
        isolationMode: 'DEDICATED_ISOLATED_ENVIRONMENT',
        zeroCollisions: true
      }, { timeout: 3500 }).catch(() => {});

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
        isMaster,
        roomId: userRoomId
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

      if (callerRole === 'owner' && !verifyOwnerPin(req, body, query)) {
        return res.status(403).json({ success: false, error: 'SECURITY LOCKDOWN: Master Owner Security PIN required.' });
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
      const resp = await axios.get(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { timeout: 6000 }).catch(() => ({ data: null }));
      if (!resp.data) {
        return res.status(404).json({ success: false, error: 'Key not found.' });
      }

      const record = decryptRecord(resp.data);
      if (record) {
        record.hwid = null;
        record.hwidBoundAt = null;
        await axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, encryptRecord(record), { timeout: 6000 });
      }

      return res.json({
        success: true,
        message: `HWID lock for key '${targetKey}' has been reset. The key will lock to the next device used.`
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

      // SECURITY FORTRESS: Generating any key via Owner authority requires Master Owner PIN!
      if (callerRole === 'owner' && !verifyOwnerPin(req, body, query)) {
        return res.status(403).json({
          success: false,
          error: 'SECURITY LOCKDOWN: Master Owner Security PIN is required to generate keys.'
        });
      }

      const roleToCreate = (body.role || 'user').trim().toLowerCase();
      // NO ONE can create another 'owner' key!
      if (roleToCreate === 'owner') {
        return res.status(403).json({ success: false, error: 'Creation of Owner keys is permanently prohibited.' });
      }

      // Admin role creation strictly requires Owner PIN
      if (roleToCreate === 'admin' && !verifyOwnerPin(req, body, query)) {
        return res.status(403).json({ success: false, error: 'Only Master Owner with Security PIN can generate Admin keys.' });
      }

      const duration = (body.duration || '30days').trim().toLowerCase();
      const label = (body.label || '').trim();
      const customKey = (body.customKey || '').trim();
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

      // Calculate duration & expiration
      let durationMs = null;
      let durationLabel = duration;

      const customDaysNum = parseInt(body.customDays || body.days, 10);
      if (duration === 'custom' && customDaysNum > 0) {
        durationMs = customDaysNum * 24 * 60 * 60 * 1000;
        durationLabel = `${customDaysNum} ${customDaysNum === 1 ? 'day' : 'days'}`;
      } else if (DURATION_MAP.hasOwnProperty(duration)) {
        durationMs = DURATION_MAP[duration];
        durationLabel = duration;
      } else {
        const parsedDays = parseInt(duration, 10);
        if (parsedDays > 0) {
          durationMs = parsedDays * 24 * 60 * 60 * 1000;
          durationLabel = `${parsedDays} ${parsedDays === 1 ? 'day' : 'days'}`;
        } else {
          durationMs = 30 * 24 * 60 * 60 * 1000;
          durationLabel = '30days';
        }
      }

      const now = Date.now();
      const expiresAt = durationMs ? now + durationMs : null;

      let finalKeyString = customKey;
      if (!finalKeyString) {
        const prefix = roleToCreate === 'admin' ? 'HD-ADMIN' : (roleToCreate === 'free' ? 'HD-FREE' : 'HD-KEY');
        finalKeyString = generateRandomKey(prefix);
      }

      const keyId = toSafeKeyId(finalKeyString);
      const newRecord = {
        key: finalKeyString,
        role: roleToCreate,
        duration: durationLabel,
        createdAt: now,
        expiresAt,
        status: 'active',
        hwid: null,
        hwidBoundAt: null,
        hwidLock: Boolean(hwidLock),
        label: label || `Created via ${callerRole.toUpperCase()} Portal`,
        createdBy: callerRole
      };

      // Encrypt before saving to Firebase RTDB
      await axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, encryptRecord(newRecord), { timeout: 7000 });

      return res.json({
        success: true,
        message: hwidLock ? 'Key generated successfully with HWID protection.' : 'Key generated with HWID lock disabled.',
        key: newRecord
      });
    }

    // -------------------------------------------------------------
    // ACTION: LIST KEYS (Requires Master Owner PIN)
    // -------------------------------------------------------------
    if (action === 'list_keys') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Unauthorized: Owner or Admin key required.' });
      }

      // SECURITY FORTRESS: Accessing the vault requires Master Owner PIN!
      if (!verifyOwnerPin(req, body, query)) {
        return res.status(403).json({
          success: false,
          error: 'SECURITY LOCKDOWN: Master Owner Security PIN is required to access Keys Vault.'
        });
      }

      const resp = await axios.get(`${FIREBASE_BASE_URL}/keys.json`, { timeout: 8000 });
      const rawData = resp.data || {};

      let keyList = Object.entries(rawData).map(([kId, rawVal]) => {
        const k = decryptRecord(rawVal);
        if (!k || !k.key) return null;

        const isMaster = isMasterOwnerKey(k.key);
        const isExpired = k.expiresAt && Date.now() > k.expiresAt;
        const currentStatus = k.status === 'revoked' ? 'revoked' : (isExpired ? 'expired' : k.status || 'active');
        const isHwidDisabled = k.hwidLock === false || k.hwidDisabled === true;

        return {
          id: kId,
          key: k.key,
          role: k.role || 'user',
          duration: k.duration || 'custom',
          createdAt: k.createdAt,
          expiresAt: k.expiresAt,
          status: currentStatus,
          hwid: isHwidDisabled ? 'DISABLED' : (k.hwid || null),
          hwidLock: !isHwidDisabled,
          label: k.label || '',
          createdBy: k.createdBy || 'system',
          isMaster
        };
      }).filter(Boolean);

      // Hide Master Owner key from vault
      keyList = keyList.filter(k => !k.isMaster && !isMasterOwnerKey(k.key));

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

      if (callerRole === 'owner' && !verifyOwnerPin(req, body, query)) {
        return res.status(403).json({ success: false, error: 'SECURITY LOCKDOWN: Master Owner Security PIN required.' });
      }

      const targetKey = (body.targetKey || query.targetKey || '').trim();
      if (!targetKey) {
        return res.status(400).json({ success: false, error: 'Target key is required.' });
      }

      if (isMasterOwnerKey(targetKey)) {
        return res.status(400).json({ success: false, error: 'Master Owner Key cannot be revoked.' });
      }

      const keyId = toSafeKeyId(targetKey);
      const resp = await axios.get(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, { timeout: 6000 }).catch(() => ({ data: null }));
      const record = decryptRecord(resp.data);
      if (record) {
        record.status = 'revoked';
        await axios.put(`${FIREBASE_BASE_URL}/keys/${keyId}.json`, encryptRecord(record), { timeout: 6000 });
      }

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

      if (!verifyOwnerPin(req, body, query)) {
        return res.status(403).json({ success: false, error: 'SECURITY LOCKDOWN: Master Owner Security PIN required.' });
      }

      const targetKey = (body.targetKey || query.targetKey || '').trim();
      if (!targetKey) {
        return res.status(400).json({ success: false, error: 'Target key is required.' });
      }

      if (isMasterOwnerKey(targetKey)) {
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

      if (!verifyOwnerPin(req, body, query)) {
        return res.status(403).json({ success: false, error: 'SECURITY LOCKDOWN: Master Owner Security PIN required.' });
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
    // ACTION: RECORD VISIT & PING ACTIVE
    // -------------------------------------------------------------
    if (action === 'record_visit') {
      const sessionId = (body.sessionId || query.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      axios.patch(`${FIREBASE_BASE_URL}/stats.json`, {
        totalVisits: { '.sv': { 'increment': 1 } }
      }, { timeout: 5000 }).catch(() => {});

      if (sessionId) {
        axios.put(`${FIREBASE_BASE_URL}/active_sessions/${sessionId}.json`, { lastSeen: Date.now() }, { timeout: 5000 }).catch(() => {});
      }
      return res.json({ success: true });
    }

    if (action === 'ping_active') {
      const sessionId = (body.sessionId || query.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      if (sessionId) {
        axios.put(`${FIREBASE_BASE_URL}/active_sessions/${sessionId}.json`, { lastSeen: Date.now() }, { timeout: 5000 }).catch(() => {});
      }
      return res.json({ success: true });
    }

    // -------------------------------------------------------------
    // ACTION: GET USAGE STATS
    // -------------------------------------------------------------
    if (action === 'get_usage_stats') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }

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
      const activeWindow = 5 * 60 * 1000;

      let onlineNow = 0;
      for (const [id, s] of Object.entries(sessionsData)) {
        if (s && s.lastSeen && now - s.lastSeen <= activeWindow) {
          onlineNow++;
        }
      }

      let activeKeys = 0;
      for (const rawVal of Object.values(keysData)) {
        const k = decryptRecord(rawVal);
        if (k && k.status === 'active' && (!k.expiresAt || k.expiresAt > now)) {
          activeKeys++;
        }
      }

      return res.json({
        success: true,
        totalVisits,
        onlineNow: Math.max(1, onlineNow),
        activeKeys
      });
    }

    // -------------------------------------------------------------
    // ACTION: LOG PREDICTION
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
    // ACTION: GET PREDICTION LOGS
    // -------------------------------------------------------------
    if (action === 'get_prediction_logs') {
      const callerRole = await verifyCallerRole(authKey);
      if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }

      const resp = await axios.get(`${FIREBASE_BASE_URL}/prediction_logs.json`, { timeout: 7000 }).catch(() => ({ data: {} }));
      const raw = resp.data || {};

      let logs = Object.entries(raw).map(([id, item]) => ({ id, ...item }));
      logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      if (logs.length > 100) logs = logs.slice(0, 100);

      return res.json({ success: true, total: logs.length, logs });
    }

    // -------------------------------------------------------------
    // ACTION: CLEAR PREDICTION LOGS
    // -------------------------------------------------------------
    if (action === 'clear_prediction_logs') {
      const callerRole = await verifyCallerRole(authKey);
      if (callerRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Only Owner can clear prediction logs.' });
      }
      if (!verifyOwnerPin(req, body, query)) {
        return res.status(403).json({ success: false, error: 'SECURITY LOCKDOWN: Master Owner Security PIN required.' });
      }

      await axios.delete(`${FIREBASE_BASE_URL}/prediction_logs.json`, { timeout: 6000 });
      return res.json({ success: true, message: 'All prediction logs cleared.' });
    }

    // -------------------------------------------------------------
    // ACTION: GET & SAVE WEBSITE ANNOUNCEMENT
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

    if (action === 'save_announcement') {
      const callerRole = await verifyCallerRole(authKey);
      if (callerRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Only Owner can publish announcements.' });
      }
      if (!verifyOwnerPin(req, body, query)) {
        return res.status(403).json({ success: false, error: 'SECURITY LOCKDOWN: Master Owner Security PIN required.' });
      }

      const title = (body.title || 'HEADLESS DICE ANNOUNCEMENT').trim().slice(0, 80);
      const message = (body.message || '').trim().slice(0, 500);
      const type = (body.type || 'warning').trim().toLowerCase();
      const enabled = body.enabled !== undefined ? Boolean(body.enabled) : true;

      if (!message) {
        return res.status(400).json({ success: false, error: 'Announcement message cannot be empty.' });
      }

      const announcementData = { enabled, title, message, type, updatedAt: Date.now(), updatedBy: 'owner' };
      await axios.put(`${FIREBASE_BASE_URL}/announcement.json`, announcementData, { timeout: 6000 });
      return res.json({ success: true, message: 'Website announcement updated live.', announcement: announcementData });
    }

    if (action === 'delete_announcement') {
      const callerRole = await verifyCallerRole(authKey);
      if (callerRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Only Owner can delete announcements.' });
      }
      if (!verifyOwnerPin(req, body, query)) {
        return res.status(403).json({ success: false, error: 'SECURITY LOCKDOWN: Master Owner Security PIN required.' });
      }

      await axios.patch(`${FIREBASE_BASE_URL}/announcement.json`, { enabled: false, message: '' }, { timeout: 6000 });
      return res.json({ success: true, message: 'Announcement hidden from website.' });
    }

    // -------------------------------------------------------------
    // ACTION: GET & SET MAINTENANCE MODE
    // -------------------------------------------------------------
    if (action === 'get_maintenance') {
      try {
        const resp = await axios.get(`${FIREBASE_BASE_URL}/maintenance.json`, { timeout: 6000 });
        const m = resp.data || {
          enabled: false,
          title: 'Headless Dice',
          headline: 'SYSTEM OPERATIONAL',
          message: 'Website is fully operational.'
        };
        return res.json({ success: true, maintenance: m });
      } catch {
        return res.json({
          success: true,
          maintenance: {
            enabled: false,
            title: 'Headless Dice',
            headline: 'SYSTEM OPERATIONAL',
            message: 'Website is fully operational.'
          }
        });
      }
    }

    if (action === 'set_maintenance') {
      const callerRole = await verifyCallerRole(authKey);
      if (callerRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Only Owner can change maintenance state.' });
      }
      if (!verifyOwnerPin(req, body, query)) {
        return res.status(403).json({ success: false, error: 'SECURITY LOCKDOWN: Master Owner Security PIN required.' });
      }

      const enabled = body.enabled !== undefined ? Boolean(body.enabled) : true;
      const durationMinutes = Math.max(1, parseInt(body.durationMinutes || 60, 10));
      const durationMs = durationMinutes * 60 * 1000;
      const now = Date.now();

      const maintenanceData = {
        enabled,
        title: (body.title || 'SYSTEM UNDER MAINTENANCE').trim(),
        headline: (body.headline || 'LINUX IS WORKING ON INFRASTRUCTURE ENHANCEMENTS').trim(),
        message: (body.message || 'Headless Dice is undergoing scheduled enhancements.').trim(),
        startedAt: now,
        durationMs,
        endsAt: now + durationMs,
        updatedBy: 'owner'
      };

      await axios.put(`${FIREBASE_BASE_URL}/maintenance.json`, maintenanceData, { timeout: 6000 });
      return res.json({ success: true, message: 'Maintenance mode updated.', maintenance: maintenanceData });
    }

    // -------------------------------------------------------------
    // ACTION: ROOM STATUS & RESET
    // -------------------------------------------------------------
    if (action === 'get_room_status') {
      const targetRoomId = (query.roomId || body.roomId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
      if (!targetRoomId) {
        return res.status(400).json({ success: false, error: 'Room ID is required.' });
      }

      try {
        const resp = await axios.get(`${FIREBASE_BASE_URL}/user_rooms/${targetRoomId}/meta.json`, { timeout: 5000 });
        const rollsResp = await axios.get(`${FIREBASE_BASE_URL}/user_rooms/${targetRoomId}/rolls.json`, { timeout: 5000 });
        const rolls = Array.isArray(rollsResp.data) ? rollsResp.data : (rollsResp.data ? Object.values(rollsResp.data) : []);

        return res.json({
          success: true,
          roomId: targetRoomId,
          meta: resp.data || { isolationMode: 'DEDICATED_ISOLATED_ENVIRONMENT', zeroCollisions: true },
          totalRolls: rolls.length,
          isolated: true,
          zeroCollisions: true
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: `Failed to fetch room status: ${err.message}` });
      }
    }

    if (action === 'reset_room') {
      const targetRoomId = (query.roomId || body.roomId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
      if (!targetRoomId) {
        return res.status(400).json({ success: false, error: 'Room ID is required.' });
      }

      try {
        await axios.delete(`${FIREBASE_BASE_URL}/user_rooms/${targetRoomId}/rolls.json`, { timeout: 5000 });
        await axios.patch(`${FIREBASE_BASE_URL}/user_rooms/${targetRoomId}/meta.json`, {
          lastReset: Date.now(),
          totalRolls: 0
        }, { timeout: 5000 }).catch(() => {});

        return res.json({
          success: true,
          roomId: targetRoomId,
          message: 'Isolated room rolls successfully reset to clean state.'
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: `Failed to reset room: ${err.message}` });
      }
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
