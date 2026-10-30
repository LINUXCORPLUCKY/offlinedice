// ==========================================================================
// HEADLESS DICE • MASTER OWNER COMMAND PORTAL SCRIPT
// STRICT SECURITY PROTOCOL: Master Owner Key + Master Security PIN
// ==========================================================================

const OWNER_STORAGE_KEY = 'hd_master_owner_key';
const OWNER_PIN_STORAGE_KEY = 'hd_master_owner_pin';

let masterKey = '';
let masterPin = '';
let cachedKeysList = [];
let cachedPredictionsList = [];

// DOM Elements
const portalGateScreen = document.getElementById('portal-gate-screen');
const portalDashboardScreen = document.getElementById('portal-dashboard-screen');
const portalGateForm = document.getElementById('portal-gate-form');
const portalKeyInput = document.getElementById('portal-key-input');
const portalPinInput = document.getElementById('portal-pin-input');
const portalSubmitBtn = document.getElementById('portal-submit-btn');
const portalGateAlert = document.getElementById('portal-gate-alert');
const portalHwidDisplay = document.getElementById('portal-hwid-display');
const portalHeaderActions = document.getElementById('portal-header-actions');
const portalLogoutBtn = document.getElementById('portal-logout-btn');

// Live Counters
const statTotalVisits = document.getElementById('stat-total-visits');
const statActiveNow = document.getElementById('stat-active-now');
const statActiveLicenses = document.getElementById('stat-active-licenses');
const refreshStatsBtn = document.getElementById('refresh-stats-btn');

// Panel Alert
const panelAlert = document.getElementById('panel-alert');
const panelAlertText = document.getElementById('panel-alert-text');

// Generator Elements
const genKeyForm = document.getElementById('gen-key-form');
const genRole = document.getElementById('gen-role');
const genDuration = document.getElementById('gen-duration');
const customDaysRow = document.getElementById('custom-days-row');
const genCustomDays = document.getElementById('gen-custom-days');
const genLabel = document.getElementById('gen-label');
const genCustomKey = document.getElementById('gen-custom-key');
const genHwidLock = document.getElementById('gen-hwid-lock');
const genSpinner = document.getElementById('gen-spinner');
const genResultBox = document.getElementById('gen-result-box');
const genResKey = document.getElementById('gen-res-key');
const genResMeta = document.getElementById('gen-res-meta');
const genShareSnippet = document.getElementById('gen-share-snippet');
const copyGenKeyBtn = document.getElementById('copy-gen-key-btn');

// Vault Elements
const keysSearchInput = document.getElementById('keys-search-input');
const keysTableBody = document.getElementById('keys-table-body');
const refreshKeysBtn = document.getElementById('refresh-keys-btn');

// Predictions Feed
const predsSearchInput = document.getElementById('preds-search-input');
const predsTableBody = document.getElementById('preds-table-body');
const refreshPredsBtn = document.getElementById('refresh-preds-btn');
const clearPredsBtn = document.getElementById('clear-preds-btn');

// Announcement
const announcementForm = document.getElementById('announcement-form');
const annTitleInput = document.getElementById('ann-title-input');
const annMsgInput = document.getElementById('ann-msg-input');
const annTypeSelect = document.getElementById('ann-type-select');
const annEnabledToggle = document.getElementById('ann-enabled-toggle');
const saveAnnBtn = document.getElementById('save-ann-btn');
const deleteAnnBtn = document.getElementById('delete-ann-btn');
const annSpinner = document.getElementById('ann-spinner');

// Maintenance
const maintTitleInput = document.getElementById('maint-title-input');
const maintHeadlineInput = document.getElementById('maint-headline-input');
const maintMessageInput = document.getElementById('maint-message-input');
const maintDurationInput = document.getElementById('maint-duration-input');
const enableMaintBtn = document.getElementById('enable-maint-btn');
const disableMaintBtn = document.getElementById('disable-maint-btn');

// Admin Governance
const adminPermsForm = document.getElementById('admin-perms-form');
const perm1Day = document.getElementById('perm-1day');
const perm30Days = document.getElementById('perm-30days');
const perm60Days = document.getElementById('perm-60days');
const perm90Days = document.getElementById('perm-90days');
const permLifetime = document.getElementById('perm-lifetime');
const permRevoke = document.getElementById('perm-revoke');
const permResetHwid = document.getElementById('perm-resethwid');
const permsSpinner = document.getElementById('perms-spinner');

// Fingerprint Helper
function getDeviceHWID() {
  let stored = localStorage.getItem('headless_dice_hwid');
  if (stored && /^HD-HWID-[A-F0-9]{4}-[A-F0-9]{4}$/.test(stored)) return stored;
  let str = (navigator.userAgent || '') + (screen.width + 'x' + screen.height) + (navigator.language || '') + (navigator.hardwareConcurrency || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const h1 = ((h >>> 16) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const h2 = (h & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  stored = `HD-HWID-${h1}-${h2}`;
  localStorage.setItem('headless_dice_hwid', stored);
  return stored;
}

// Master Fetch with PIN Header
async function ownerApiFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['X-Owner-Pin'] = masterPin;
  options.headers['Content-Type'] = 'application/json';
  return fetch(url, options);
}

document.addEventListener('DOMContentLoaded', () => {
  const hwid = getDeviceHWID();
  if (portalHwidDisplay) portalHwidDisplay.textContent = hwid;

  setupTabs();
  setupGateForm();
  setupGenerator();
  setupVault();
  setupPredictions();
  setupAnnouncement();
  setupMaintenance();
  setupAdminPerms();

  // Check saved session
  const savedK = sessionStorage.getItem(OWNER_STORAGE_KEY);
  const savedP = sessionStorage.getItem(OWNER_PIN_STORAGE_KEY);
  if (savedK && savedP) {
    masterKey = savedK;
    masterPin = savedP;
    verifyAndUnlock(masterKey, masterPin, false);
  }
});

function setupTabs() {
  document.querySelectorAll('.panel-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.panel-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel-body .tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const content = document.getElementById(target);
      if (content) content.classList.add('active');

      if (target === 'tab-vault') loadKeysVault();
      if (target === 'tab-predictions') loadPredictionsFeed();
      if (target === 'tab-permissions') loadAdminPerms();
    });
  });
}

function setupGateForm() {
  portalGateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const k = portalKeyInput.value.trim();
    const p = portalPinInput.value.trim();
    if (!k || !p) return;
    verifyAndUnlock(k, p, true);
  });

  if (portalLogoutBtn) {
    portalLogoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem(OWNER_STORAGE_KEY);
      sessionStorage.removeItem(OWNER_PIN_STORAGE_KEY);
      masterKey = '';
      masterPin = '';
      portalDashboardScreen.classList.add('hidden');
      portalHeaderActions.classList.add('hidden');
      portalGateScreen.classList.remove('hidden');
      portalPinInput.value = '';
    });
  }
}

async function verifyAndUnlock(key, pin, isManual = true) {
  portalSubmitBtn.disabled = true;
  portalSubmitBtn.textContent = 'Authenticating Master Authority...';
  if (portalGateAlert) portalGateAlert.classList.add('hidden');

  try {
    const hwid = getDeviceHWID();
    // Test verify key first
    const res = await fetch(`/api/auth?action=verify&key=${encodeURIComponent(key)}&hwid=${encodeURIComponent(hwid)}`);
    const data = await res.json();

    if (!res.ok || !data.success || !data.valid || data.role !== 'owner') {
      showGateError(data.error || 'Invalid credentials. Only Master Owner can access this portal.');
      return;
    }

    // Test Owner PIN against protected vault endpoint
    const testPinRes = await fetch(`/api/auth?action=list_keys&authKey=${encodeURIComponent(key)}&ownerPin=${encodeURIComponent(pin)}`);
    const testPinData = await testPinRes.json();

    if (testPinRes.status === 403 || !testPinData.success) {
      showGateError('SECURITY LOCKDOWN: Incorrect Master Owner Security PIN!');
      return;
    }

    // Success! Lock in state
    masterKey = key;
    masterPin = pin;
    sessionStorage.setItem(OWNER_STORAGE_KEY, key);
    sessionStorage.setItem(OWNER_PIN_STORAGE_KEY, pin);

    portalGateScreen.classList.add('hidden');
    portalDashboardScreen.classList.remove('hidden');
    portalHeaderActions.classList.remove('hidden');

    showPanelAlert('Master Authority Unlocked & Encrypted Buffer Online', 'success');
    loadLiveCounters();
    loadKeysVault();

  } catch (err) {
    showGateError('Network error authenticating master portal: ' + err.message);
  } finally {
    portalSubmitBtn.disabled = false;
    portalSubmitBtn.textContent = 'Unlock Command Center';
  }
}

function showGateError(msg) {
  if (portalGateAlert) {
    portalGateAlert.textContent = msg;
    portalGateAlert.classList.remove('hidden');
  }
}

function showPanelAlert(msg, type = 'success') {
  if (!panelAlert || !panelAlertText) return;
  panelAlertText.textContent = msg;
  panelAlert.classList.remove('hidden');
  if (type === 'error') {
    panelAlert.style.borderColor = '#ff4444';
    panelAlert.style.color = '#ff8888';
  } else {
    panelAlert.style.borderColor = '#00ffaa';
    panelAlert.style.color = '#00ffaa';
  }
  setTimeout(() => { panelAlert.classList.add('hidden'); }, 5000);
}

// --------------------------------------------------------------------------
// LIVE ANONYMOUS COUNTERS
// --------------------------------------------------------------------------
async function loadLiveCounters() {
  if (!masterKey) return;
  try {
    const res = await ownerApiFetch(`/api/auth?action=get_usage_stats&authKey=${encodeURIComponent(masterKey)}`);
    const data = await res.json();
    if (res.ok && data.success) {
      if (statTotalVisits) statTotalVisits.textContent = Number(data.totalVisits || 0).toLocaleString();
      if (statActiveNow) statActiveNow.textContent = Number(data.onlineNow || 1).toLocaleString();
      if (statActiveLicenses) statActiveLicenses.textContent = Number(data.activeKeys || 0).toLocaleString();
    }
  } catch (e) {}
}

if (refreshStatsBtn) {
  refreshStatsBtn.addEventListener('click', loadLiveCounters);
}

// --------------------------------------------------------------------------
// KEY GENERATOR
// --------------------------------------------------------------------------
function setupGenerator() {
  if (genDuration) {
    genDuration.addEventListener('change', () => {
      if (genDuration.value === 'custom') {
        customDaysRow.classList.remove('hidden');
      } else {
        customDaysRow.classList.add('hidden');
      }
    });
  }

  if (genKeyForm) {
    genKeyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!masterKey || !masterPin) return;

      const role = genRole.value;
      const duration = genDuration.value;
      const customDays = parseInt(genCustomDays ? genCustomDays.value : '7', 10);
      const label = genLabel.value.trim();
      const customKey = genCustomKey.value.trim();
      const hwidLock = genHwidLock.checked;

      const genBtn = document.getElementById('generate-key-btn');
      if (genBtn) genBtn.disabled = true;
      if (genSpinner) genSpinner.classList.remove('hidden');

      try {
        const res = await ownerApiFetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({
            action: 'create_key',
            authKey: masterKey,
            ownerPin: masterPin,
            role,
            duration,
            customDays,
            label,
            customKey,
            hwidLock
          })
        });
        const data = await res.json();
        if (res.ok && data.success && data.key) {
          const k = data.key;
          genResultBox.classList.remove('hidden');
          genResKey.textContent = k.key;
          genResMeta.textContent = `${k.duration.toUpperCase()} • ${(k.role || 'user').toUpperCase()} ROLE • HWID: ${k.hwidLock ? 'LOCKED' : 'UNRESTRICTED'}`;
          
          genShareSnippet.value = `🎮 **YOUR HEADLESS DICE LICENSE KEY** 🎮\nKey: \`${k.key}\`\nDuration: ${k.duration}\nRole: ${(k.role || 'user').toUpperCase()}\nDevice Bound: ${k.hwidLock ? 'Single Device (Auto-HWID)' : 'Unrestricted'}\nWebsite: https://offlinedice.vercel.app/`;

          showPanelAlert(`Key '${k.key}' generated and encrypted in database!`, 'success');
          loadKeysVault();
        } else {
          showPanelAlert(data.error || 'Failed to generate key.', 'error');
        }
      } catch (err) {
        showPanelAlert('Network error creating key: ' + err.message, 'error');
      } finally {
        if (genBtn) genBtn.disabled = false;
        if (genSpinner) genSpinner.classList.add('hidden');
      }
    });
  }

  if (copyGenKeyBtn) {
    copyGenKeyBtn.addEventListener('click', () => {
      const text = genResKey.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const orig = copyGenKeyBtn.textContent;
        copyGenKeyBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyGenKeyBtn.textContent = orig; }, 1500);
      });
    });
  }
}

// --------------------------------------------------------------------------
// KEYS VAULT
// --------------------------------------------------------------------------
function setupVault() {
  if (refreshKeysBtn) {
    refreshKeysBtn.addEventListener('click', loadKeysVault);
  }
  if (keysSearchInput) {
    keysSearchInput.addEventListener('input', renderFilteredKeys);
  }
}

async function loadKeysVault() {
  if (!masterKey || !masterPin) return;
  keysTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px;">Loading and decrypting keys vault from Firebase...</td></tr>';

  try {
    const res = await ownerApiFetch(`/api/auth?action=list_keys&authKey=${encodeURIComponent(masterKey)}&ownerPin=${encodeURIComponent(masterPin)}`);
    const data = await res.json();
    if (res.ok && data.success && Array.isArray(data.keys)) {
      cachedKeysList = data.keys;
      renderFilteredKeys();
    } else {
      keysTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ff6666;">${data.error || 'Failed to load keys.'}</td></tr>`;
    }
  } catch (err) {
    keysTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ff6666;">Network error loading vault.</td></tr>`;
  }
}

function renderFilteredKeys() {
  const query = (keysSearchInput.value || '').trim().toLowerCase();
  const filtered = cachedKeysList.filter(k => {
    if (!query) return true;
    return (k.key && k.key.toLowerCase().includes(query)) ||
           (k.label && k.label.toLowerCase().includes(query)) ||
           (k.role && k.role.toLowerCase().includes(query)) ||
           (k.hwid && k.hwid.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    keysTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-dim);">No matching keys found in database.</td></tr>';
    return;
  }

  keysTableBody.innerHTML = '';
  filtered.forEach(k => {
    const tr = document.createElement('tr');
    const isRevoked = k.status === 'revoked';
    const isExpired = k.status === 'expired';
    const statusPill = isRevoked ? '<span class="status-pill status-revoked">REVOKED</span>'
      : (isExpired ? '<span class="status-pill status-expired">EXPIRED</span>' : '<span class="status-pill status-active">ACTIVE</span>');

    const roleTagClass = `role-${k.role || 'user'}`;
    const hwidDisplay = k.hwid === 'DISABLED'
      ? '<span style="color:#00ffaa; font-size:11px;">UNRESTRICTED</span>'
      : (k.hwid ? `<code class="hwid-code" title="${k.hwid}">${k.hwid}</code>` : '<span class="text-dim" style="font-size:11px;">Unbound (Auto-Locks)</span>');

    tr.innerHTML = `
      <td>${statusPill}</td>
      <td>
        <div class="hash-container">
          <code class="key-display-code">${k.key}</code>
          <button type="button" class="btn-copy-code" data-copy="${k.key}" title="Copy Key">📋</button>
        </div>
      </td>
      <td><span class="role-tag ${roleTagClass}">${(k.role || 'user').toUpperCase()}</span></td>
      <td><span class="dur-tag">${k.duration || 'custom'}</span></td>
      <td>${hwidDisplay}</td>
      <td><span class="client-note-text" title="${k.label || ''}">${k.label || '—'}</span></td>
      <td>
        <div class="action-btn-group">
          <button type="button" class="btn-action-icon btn-reset-hwid" data-key="${k.key}" title="Reset Hardware Device Binding">🔄 Reset HWID</button>
          ${!isRevoked ? `<button type="button" class="btn-action-icon btn-revoke-key" data-key="${k.key}" title="Revoke Key">🚫 Revoke</button>` : ''}
          <button type="button" class="btn-action-icon btn-del-key" data-key="${k.key}" title="Permanently Delete Key">🗑️ Delete</button>
        </div>
      </td>
    `;
    keysTableBody.appendChild(tr);
  });

  // Attach Vault Action Listeners
  document.querySelectorAll('.btn-copy-code').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-copy');
      navigator.clipboard.writeText(val).then(() => {
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '📋'; }, 1200);
      });
    });
  });

  document.querySelectorAll('.btn-reset-hwid').forEach(btn => {
    btn.addEventListener('click', async () => {
      const keyVal = btn.getAttribute('data-key');
      if (!confirm(`Reset device HWID lock for key '${keyVal}'?`)) return;
      try {
        const res = await ownerApiFetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ action: 'reset_hwid', authKey: masterKey, ownerPin: masterPin, targetKey: keyVal })
        });
        const d = await res.json();
        if (res.ok && d.success) {
          showPanelAlert(`HWID lock unbound for '${keyVal}'.`, 'success');
          loadKeysVault();
        } else {
          showPanelAlert(d.error || 'Failed to reset HWID.', 'error');
        }
      } catch (e) {
        showPanelAlert('Network error resetting HWID.', 'error');
      }
    });
  });

  document.querySelectorAll('.btn-revoke-key').forEach(btn => {
    btn.addEventListener('click', async () => {
      const keyVal = btn.getAttribute('data-key');
      if (!confirm(`Revoke key '${keyVal}'? The user will immediately lose access.`)) return;
      try {
        const res = await ownerApiFetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ action: 'revoke_key', authKey: masterKey, ownerPin: masterPin, targetKey: keyVal })
        });
        const d = await res.json();
        if (res.ok && d.success) {
          showPanelAlert(`Key '${keyVal}' revoked.`, 'success');
          loadKeysVault();
        } else {
          showPanelAlert(d.error || 'Failed to revoke key.', 'error');
        }
      } catch (e) {
        showPanelAlert('Network error revoking key.', 'error');
      }
    });
  });

  document.querySelectorAll('.btn-del-key').forEach(btn => {
    btn.addEventListener('click', async () => {
      const keyVal = btn.getAttribute('data-key');
      if (!confirm(`Permanently delete key '${keyVal}' from database? This cannot be undone.`)) return;
      try {
        const res = await ownerApiFetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ action: 'delete_key', authKey: masterKey, ownerPin: masterPin, targetKey: keyVal })
        });
        const d = await res.json();
        if (res.ok && d.success) {
          showPanelAlert(`Key '${keyVal}' deleted from database.`, 'success');
          loadKeysVault();
        } else {
          showPanelAlert(d.error || 'Failed to delete key.', 'error');
        }
      } catch (e) {
        showPanelAlert('Network error deleting key.', 'error');
      }
    });
  });
}

// --------------------------------------------------------------------------
// PREDICTIONS FEED
// --------------------------------------------------------------------------
function setupPredictions() {
  if (refreshPredsBtn) refreshPredsBtn.addEventListener('click', loadPredictionsFeed);
  if (predsSearchInput) predsSearchInput.addEventListener('input', renderFilteredPredictions);
  if (clearPredsBtn) {
    clearPredsBtn.addEventListener('click', async () => {
      if (!confirm('Clear all recorded prediction activity logs?')) return;
      try {
        const res = await ownerApiFetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ action: 'clear_prediction_logs', authKey: masterKey, ownerPin: masterPin })
        });
        const d = await res.json();
        if (res.ok && d.success) {
          showPanelAlert('Prediction feed cleared.', 'success');
          loadPredictionsFeed();
        }
      } catch (e) {
        showPanelAlert('Error clearing predictions.', 'error');
      }
    });
  }
}

async function loadPredictionsFeed() {
  if (!masterKey || !masterPin) return;
  predsTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px;">Loading predictions feed...</td></tr>';
  try {
    const res = await ownerApiFetch(`/api/auth?action=get_prediction_logs&authKey=${encodeURIComponent(masterKey)}&ownerPin=${encodeURIComponent(masterPin)}`);
    const data = await res.json();
    if (res.ok && data.success && Array.isArray(data.logs)) {
      cachedPredictionsList = data.logs;
      renderFilteredPredictions();
    } else {
      predsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ff6666;">${data.error || 'Failed to load predictions.'}</td></tr>`;
    }
  } catch (e) {
    predsTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#ff6666;">Network error.</td></tr>';
  }
}

function renderFilteredPredictions() {
  const query = (predsSearchInput.value || '').trim().toLowerCase();
  const filtered = cachedPredictionsList.filter(p => {
    if (!query) return true;
    return (p.key && p.key.toLowerCase().includes(query)) ||
           (p.sessionId && p.sessionId.toLowerCase().includes(query)) ||
           (p.predictedColor && p.predictedColor.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    predsTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-dim);">No predictions logged yet.</td></tr>';
    return;
  }

  predsTableBody.innerHTML = '';
  filtered.forEach(p => {
    const tr = document.createElement('tr');
    const d = new Date(p.timestamp);
    const timeStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    const colorHex = p.predictedHex || '#b026ff';

    tr.innerHTML = `
      <td style="font-size:11px; color:var(--text-muted);">${timeStr}</td>
      <td><code>${p.key || 'Anon'}</code></td>
      <td><code>${p.sessionId || 'Unknown'}</code></td>
      <td><span style="color:${colorHex}; font-weight:800;">● ${p.predictedColor}</span></td>
      <td>${p.confidence || 85}% • ${p.strategy || 'Dynamic'}</td>
      <td>${p.totalRolls || 0}</td>
      <td><span class="pred-fair-tag">${p.fairness || 'FAIR'}</span></td>
    `;
    predsTableBody.appendChild(tr);
  });
}

// --------------------------------------------------------------------------
// ANNOUNCEMENT MANAGER
// --------------------------------------------------------------------------
function setupAnnouncement() {
  if (announcementForm) {
    announcementForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!masterKey || !masterPin) return;
      if (saveAnnBtn) saveAnnBtn.disabled = true;
      if (annSpinner) annSpinner.classList.remove('hidden');

      try {
        const res = await ownerApiFetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({
            action: 'save_announcement',
            authKey: masterKey,
            ownerPin: masterPin,
            title: annTitleInput.value.trim(),
            message: annMsgInput.value.trim(),
            type: annTypeSelect.value,
            enabled: annEnabledToggle.checked
          })
        });
        const d = await res.json();
        if (res.ok && d.success) {
          showPanelAlert('Website announcement banner published live!', 'success');
        } else {
          showPanelAlert(d.error || 'Failed to update announcement.', 'error');
        }
      } catch (e) {
        showPanelAlert('Network error saving announcement.', 'error');
      } finally {
        if (saveAnnBtn) saveAnnBtn.disabled = false;
        if (annSpinner) annSpinner.classList.add('hidden');
      }
    });
  }

  if (deleteAnnBtn) {
    deleteAnnBtn.addEventListener('click', async () => {
      if (!confirm('Hide announcement from website?')) return;
      try {
        const res = await ownerApiFetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ action: 'delete_announcement', authKey: masterKey, ownerPin: masterPin })
        });
        const d = await res.json();
        if (res.ok && d.success) {
          showPanelAlert('Announcement banner hidden.', 'success');
        }
      } catch (e) {
        showPanelAlert('Error hiding announcement.', 'error');
      }
    });
  }
}

// --------------------------------------------------------------------------
// MAINTENANCE CONTROLLER
// --------------------------------------------------------------------------
function setupMaintenance() {
  if (enableMaintBtn) {
    enableMaintBtn.addEventListener('click', async () => {
      if (!confirm('Activate maintenance mode across Headless Dice? Players will see a countdown overlay.')) return;
      try {
        const res = await ownerApiFetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({
            action: 'set_maintenance',
            authKey: masterKey,
            ownerPin: masterPin,
            enabled: true,
            title: maintTitleInput.value.trim(),
            headline: maintHeadlineInput.value.trim(),
            message: maintMessageInput.value.trim(),
            durationMinutes: parseInt(maintDurationInput.value || '60', 10)
          })
        });
        const d = await res.json();
        if (res.ok && d.success) {
          showPanelAlert('🚨 Maintenance mode ACTIVATED across website!', 'success');
        } else {
          showPanelAlert(d.error || 'Failed to set maintenance.', 'error');
        }
      } catch (e) {
        showPanelAlert('Error updating maintenance mode.', 'error');
      }
    });
  }

  if (disableMaintBtn) {
    disableMaintBtn.addEventListener('click', async () => {
      if (!confirm('Disable maintenance mode and restore full website accessibility?')) return;
      try {
        const res = await ownerApiFetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({
            action: 'set_maintenance',
            authKey: masterKey,
            ownerPin: masterPin,
            enabled: false
          })
        });
        const d = await res.json();
        if (res.ok && d.success) {
          showPanelAlert('✅ Website restored to active state!', 'success');
        } else {
          showPanelAlert(d.error || 'Failed to disable maintenance.', 'error');
        }
      } catch (e) {
        showPanelAlert('Error restoring website.', 'error');
      }
    });
  }
}

// --------------------------------------------------------------------------
// ADMIN GOVERNANCE PERMISSIONS
// --------------------------------------------------------------------------
function setupAdminPerms() {
  if (adminPermsForm) {
    adminPermsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!masterKey || !masterPin) return;
      const saveBtn = document.getElementById('save-perms-btn');
      if (saveBtn) saveBtn.disabled = true;
      if (permsSpinner) permsSpinner.classList.remove('hidden');

      try {
        const res = await ownerApiFetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({
            action: 'save_admin_perms',
            authKey: masterKey,
            ownerPin: masterPin,
            permissions: {
              canCreate1Day: perm1Day.checked,
              canCreate30Days: perm30Days.checked,
              canCreate60Days: perm60Days.checked,
              canCreate90Days: perm90Days.checked,
              canCreateLifetime: permLifetime.checked,
              canRevokeKeys: permRevoke.checked,
              canResetHWID: permResetHwid.checked
            }
          })
        });
        const d = await res.json();
        if (res.ok && d.success) {
          showPanelAlert('Admin governance rules updated!', 'success');
        } else {
          showPanelAlert(d.error || 'Failed to save admin rules.', 'error');
        }
      } catch (e) {
        showPanelAlert('Network error saving permissions.', 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
        if (permsSpinner) permsSpinner.classList.add('hidden');
      }
    });
  }
}

async function loadAdminPerms() {
  if (!masterKey) return;
  try {
    const res = await ownerApiFetch(`/api/auth?action=get_admin_perms&authKey=${encodeURIComponent(masterKey)}`);
    const d = await res.json();
    if (res.ok && d.success && d.permissions) {
      const p = d.permissions;
      if (perm1Day) perm1Day.checked = Boolean(p.canCreate1Day);
      if (perm30Days) perm30Days.checked = Boolean(p.canCreate30Days);
      if (perm60Days) perm60Days.checked = Boolean(p.canCreate60Days);
      if (perm90Days) perm90Days.checked = Boolean(p.canCreate90Days);
      if (permLifetime) permLifetime.checked = Boolean(p.canCreateLifetime);
      if (permRevoke) permRevoke.checked = Boolean(p.canRevokeKeys);
      if (permResetHwid) permResetHwid.checked = Boolean(p.canResetHWID);
    }
  } catch (e) {}
}
