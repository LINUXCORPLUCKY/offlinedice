// ==============================================================================
// HEADLESS DICE — SYSTEM SETTINGS & MAINTENANCE MANAGER
// Controls Global Maintenance Sentinel, Announcements, and Force-Refresh Epochs
// ==============================================================================

const { getDb } = require('./db');

/**
 * Retrieves the live system state (maintenance status, active announcement, control epoch).
 */
async function getSystemState() {
  try {
    const { db } = await getDb();
    const settingsCol = db.collection('system_settings');
    const announcementsCol = db.collection('announcements');

    const maintenanceDoc = await settingsCol.findOne({ key: 'maintenance' });
    const controlDoc = await settingsCol.findOne({ key: 'control' });
    const activeAnnouncement = await announcementsCol.findOne({ active: true });

    return {
      maintenance: (maintenanceDoc && maintenanceDoc.value) || { enabled: false },
      announcement: activeAnnouncement ? {
        active: true,
        text: activeAnnouncement.text,
        type: activeAnnouncement.type || 'info',
        timestamp: activeAnnouncement.broadcastTimestamp
      } : { active: false, text: '' },
      control: (controlDoc && controlDoc.value) || { timestamp: Date.now() }
    };
  } catch(e) {
    return {
      maintenance: { enabled: false },
      announcement: { active: false, text: '' },
      control: { timestamp: Date.now() }
    };
  }
}

/**
 * Checks if maintenance mode is active.
 */
async function isMaintenanceActive() {
  const state = await getSystemState();
  return state.maintenance && state.maintenance.enabled === true;
}

/**
 * Sets maintenance state (Owner restricted).
 */
async function setMaintenanceState(enabled, reason = 'System upgrade in progress', author = 'OWNER') {
  const { db } = await getDb();
  const settingsCol = db.collection('system_settings');
  const auditCol = db.collection('audit_logs');

  const val = {
    enabled: Boolean(enabled),
    reason: reason,
    updatedAt: Date.now(),
    author: author
  };

  await settingsCol.updateOne(
    { key: 'maintenance' },
    { $set: { value: val, updatedBy: author, updatedAt: new Date() } },
    { upsert: true }
  );

  // Auto trigger a control force-refresh to propagate state to all browser tabs
  await triggerForceRefresh('Maintenance mode state changed', author);

  await auditCol.insertOne({
    action: enabled ? 'MAINTENANCE_ACTIVATED' : 'MAINTENANCE_DEACTIVATED',
    actor: author,
    details: val,
    timestamp: new Date()
  });

  return val;
}

/**
 * Broadcasts a force-refresh signal epoch to reload all connected client browser tabs.
 */
async function triggerForceRefresh(reason = 'Remote update broadcast', author = 'OWNER') {
  const { db } = await getDb();
  const settingsCol = db.collection('system_settings');

  const val = {
    timestamp: Date.now(),
    reason: reason,
    author: author
  };

  await settingsCol.updateOne(
    { key: 'control' },
    { $set: { value: val, updatedBy: author, updatedAt: new Date() } },
    { upsert: true }
  );

  return val;
}

/**
 * Publishes a live announcement banner.
 */
async function setAnnouncement(text, type = 'info', author = 'OWNER') {
  const { db } = await getDb();
  const announcementsCol = db.collection('announcements');

  // Deactivate existing
  await announcementsCol.updateMany({}, { $set: { active: false } });

  if (!text || text.trim() === '') {
    return { active: false, text: '' };
  }

  const doc = {
    text: text.trim(),
    type: type,
    active: true,
    broadcastTimestamp: Date.now(),
    author: author,
    createdAt: new Date()
  };

  await announcementsCol.insertOne(doc);
  return doc;
}

module.exports = {
  getSystemState,
  isMaintenanceActive,
  setMaintenanceState,
  triggerForceRefresh,
  setAnnouncement
};
