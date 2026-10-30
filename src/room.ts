import {
  AuthState,
  SessionData,
  RollRecord,
  SessionStats,
  SuggestedPickData,
  StrategyItem,
  AnnouncementData
} from './types';

// Official 6 Color Palette
const OFFICIAL_COLORS = [
  { name: 'Red', hex: '#FF0000' },
  { name: 'Orange', hex: '#FFA500' },
  { name: 'Yellow', hex: '#FFD700' },
  { name: 'Green', hex: '#008000' },
  { name: 'Blue', hex: '#0000FF' },
  { name: 'Purple', hex: '#800080' }
];

const AUTH_STORAGE_KEY = 'headless_dice_session_key';
const ROOM_STORAGE_KEY = 'headless_user_room_id';
const AUTH_DATA_KEY = 'headless_auth_data';

// State Store
let currentAuth: AuthState | null = null;
let currentSessionData: SessionData | null = null;
let activeStrategyIndex = 0;
let selectedLiveDice: string[] = [];

// DOM Elements
const verifyForm = document.getElementById('verify-form') as HTMLFormElement | null;
const sessionInput = document.getElementById('session-input') as HTMLInputElement | null;
const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement | null;
const btnSpinner = document.getElementById('btn-spinner') as HTMLElement | null;
const clearBtn = document.getElementById('clear-btn') as HTMLElement | null;
const alertBanner = document.getElementById('alert-banner') as HTMLElement | null;
const alertTitle = document.getElementById('alert-title') as HTMLElement | null;
const alertMessage = document.getElementById('alert-message') as HTMLElement | null;
const alertClose = document.getElementById('alert-close') as HTMLElement | null;
const emptyState = document.getElementById('empty-state') as HTMLElement | null;
const dashboardContent = document.getElementById('dashboard-content') as HTMLElement | null;

// Stats Elements
const statSessionId = document.getElementById('stat-session-id') as HTMLElement | null;
const statSessionSource = document.getElementById('stat-session-source') as HTMLElement | null;
const statTotalRolls = document.getElementById('stat-total-rolls') as HTMLElement | null;
const statTotalDice = document.getElementById('stat-total-dice') as HTMLElement | null;
const statDicePerRoll = document.getElementById('stat-dice-per-roll') as HTMLElement | null;
const statFairnessTag = document.getElementById('stat-fairness-tag') as HTMLElement | null;
const statRiggedInfo = document.getElementById('stat-rigged-info') as HTMLElement | null;
const colorStatsGrid = document.getElementById('color-stats-grid') as HTMLElement | null;
const rollsTableBody = document.getElementById('rolls-table-body') as HTMLElement | null;
const historyCountTag = document.getElementById('history-count-tag') as HTMLElement | null;

// Strategy Elements
const getPickBtn = document.getElementById('get-pick-btn') as HTMLButtonElement | null;
const pickIdleMessage = document.getElementById('pick-idle-message') as HTMLElement | null;
const pickActiveDisplay = document.getElementById('pick-active-display') as HTMLElement | null;
const pickOrbInner = document.getElementById('pick-orb-inner') as HTMLElement | null;
const pickOrb = document.getElementById('pick-orb') as HTMLElement | null;
const pickColorTitle = document.getElementById('pick-color-title') as HTMLElement | null;
const pickColorDesc = document.getElementById('pick-color-desc') as HTMLElement | null;
const pickStrategyTag = document.getElementById('pick-strategy-tag') as HTMLElement | null;
const pickConfidenceTag = document.getElementById('pick-confidence-tag') as HTMLElement | null;
const pickRecBadge = document.getElementById('pick-rec-badge') as HTMLElement | null;

// Room & Auth Controls
const authStatusChip = document.getElementById('auth-status-chip') as HTMLElement | null;
const authRoleBadge = document.getElementById('auth-role-badge') as HTMLElement | null;
const btnExitRoom = document.getElementById('btn-exit-room') as HTMLButtonElement | null;
const userRoomBadge = document.getElementById('user-room-badge') as HTMLElement | null;
const userRoomLabel = document.getElementById('user-room-label') as HTMLElement | null;
const roomDisplayId = document.getElementById('room-display-id') as HTMLElement | null;
const btnCopyRoom = document.getElementById('btn-copy-room') as HTMLButtonElement | null;
const btnLoadMyRoom = document.getElementById('btn-load-my-room') as HTMLButtonElement | null;
const btnResetMyRoom = document.getElementById('btn-reset-my-room') as HTMLButtonElement | null;

// Add Roll Modal
const btnOpenAddRoll = document.getElementById('btn-open-add-roll') as HTMLButtonElement | null;
const addRollModal = document.getElementById('add-roll-modal') as HTMLElement | null;
const closeAddRollBtn = document.getElementById('close-add-roll-btn') as HTMLButtonElement | null;
const btnClearDiceSlots = document.getElementById('btn-clear-dice-slots') as HTMLButtonElement | null;
const btnSubmitLiveRoll = document.getElementById('btn-submit-live-roll') as HTMLButtonElement | null;
const addRollSpinner = document.getElementById('add-roll-spinner') as HTMLElement | null;
const addRollError = document.getElementById('add-roll-error') as HTMLElement | null;

// Announcement Banner
const websiteAnnouncementBanner = document.getElementById('website-announcement-banner') as HTMLElement | null;
const annTitle = document.getElementById('ann-title') as HTMLElement | null;
const annMsg = document.getElementById('ann-msg') as HTMLElement | null;
const annIcon = document.getElementById('ann-icon') as HTMLElement | null;
const annCloseBtn = document.getElementById('ann-close-btn') as HTMLElement | null;

// Device HWID
function getDeviceHWID(): string {
  let cached = localStorage.getItem('headless_dice_hwid');
  if (cached && /^HD-HWID-[A-F0-9]{4}-[A-F0-9]{4}$/.test(cached)) return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    let gpu = '';
    if (gl && 'getExtension' in gl) {
      const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
      gpu = debugInfo ? (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    }
    const fp = [
      navigator.userAgent,
      navigator.hardwareConcurrency || '',
      screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      gpu
    ].join('###');

    let hash = 0;
    for (let i = 0; i < fp.length; i++) {
      hash = ((hash << 5) - hash) + fp.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    const hwid = `HD-HWID-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
    localStorage.setItem('headless_dice_hwid', hwid);
    return hwid;
  } catch (e) {
    const fallback = 'HD-HWID-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    localStorage.setItem('headless_dice_hwid', fallback);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// INITIALIZATION & STRICT ROOM GUARD
// ---------------------------------------------------------------------------
async function initRoomPage(): Promise<void> {
  const activeKey = sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY);
  if (!activeKey) {
    redirectToLogin('Authentication required. Please enter your license key.');
    return;
  }

  const hwid = getDeviceHWID();
  try {
    const res = await fetch(`/api/auth?action=verify&key=${encodeURIComponent(activeKey)}&hwid=${encodeURIComponent(hwid)}`);
    const authData: AuthState = await res.json();
    if (!res.ok || !authData.success || !authData.valid) {
      redirectToLogin(authData.error || 'Your license key session has expired.');
      return;
    }

    currentAuth = authData;
    sessionStorage.setItem(AUTH_STORAGE_KEY, authData.key);
    sessionStorage.setItem(ROOM_STORAGE_KEY, authData.roomId || '');
    sessionStorage.setItem(AUTH_DATA_KEY, JSON.stringify(authData));

    setupUI(authData);
    setupEventListeners();
    fetchAndRenderAnnouncement();
    startHeartbeatGuard();

    // Auto-load user's dedicated room
    executeVerification('my_room');
  } catch (err) {
    redirectToLogin('Network error connecting to security gateway.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRoomPage);
} else {
  initRoomPage();
}

function redirectToLogin(msg?: string): void {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(ROOM_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_DATA_KEY);
  localStorage.removeItem(AUTH_STORAGE_KEY);
  if (msg) alert(msg);
  window.location.replace('/index.html');
}

function setupUI(auth: AuthState): void {
  const roomId = auth.roomId || sessionStorage.getItem(ROOM_STORAGE_KEY) || 'ROOM-PRIMARY';

  if (userRoomBadge && userRoomLabel) {
    userRoomBadge.classList.remove('hidden');
    userRoomLabel.textContent = `Room: #${roomId}`;
  }
  if (roomDisplayId) roomDisplayId.textContent = `#${roomId}`;

  if (authStatusChip && authRoleBadge) {
    authStatusChip.classList.remove('hidden');
    if (auth.role === 'owner') {
      authRoleBadge.textContent = '👑 OWNER (LIFETIME)';
      authRoleBadge.style.color = '#ffaa44';
    } else if (auth.role === 'admin') {
      authRoleBadge.textContent = '🛡️ ADMIN (ACTIVE)';
      authRoleBadge.style.color = '#00e5ff';
    } else if (auth.role === 'free') {
      authRoleBadge.textContent = '🎁 FREE ACCESS';
      authRoleBadge.style.color = '#00e676';
    } else {
      let dur = 'User Key';
      if (auth.remainingMs) {
        const d = Math.ceil(auth.remainingMs / (24 * 3600 * 1000));
        dur = `${d}d left`;
      } else if (auth.duration) {
        dur = auth.duration;
      }
      authRoleBadge.textContent = `🔑 ${dur.toUpperCase()}`;
      authRoleBadge.style.color = '#d8b4fe';
    }
  }
}

// ---------------------------------------------------------------------------
// EVENT LISTENERS & DASHBOARD CONTROLS
// ---------------------------------------------------------------------------
function setupEventListeners(): void {
  if (verifyForm) {
    verifyForm.addEventListener('submit', (e: Event) => {
      e.preventDefault();
      const val = (sessionInput?.value || '').trim();
      if (!val) return;
      executeVerification(val);
    });
  }

  if (sessionInput && clearBtn) {
    sessionInput.addEventListener('input', () => {
      clearBtn.style.display = sessionInput.value ? 'block' : 'none';
    });
    clearBtn.addEventListener('click', () => {
      sessionInput.value = '';
      clearBtn.style.display = 'none';
      sessionInput.focus();
    });
  }

  document.querySelectorAll('.seed-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const sess = btn.getAttribute('data-session') || '';
      if (sessionInput) sessionInput.value = sess;
      if (clearBtn) clearBtn.style.display = 'block';
      executeVerification(sess);
    });
  });

  if (alertClose) alertClose.addEventListener('click', () => hideAlert());

  if (btnExitRoom) {
    btnExitRoom.addEventListener('click', () => {
      if (confirm('Exit your dedicated room session and lock the dashboard?')) {
        redirectToLogin();
      }
    });
  }

  if (btnCopyRoom) {
    btnCopyRoom.addEventListener('click', () => {
      const activeRoom = currentAuth?.roomId || sessionStorage.getItem(ROOM_STORAGE_KEY) || '';
      navigator.clipboard.writeText(activeRoom).then(() => {
        const orig = btnCopyRoom.textContent;
        btnCopyRoom.textContent = '✓';
        setTimeout(() => { btnCopyRoom.textContent = orig; }, 1500);
      });
    });
  }

  if (btnLoadMyRoom) {
    btnLoadMyRoom.addEventListener('click', () => {
      if (sessionInput) sessionInput.value = 'my_room';
      executeVerification('my_room');
    });
  }

  if (btnResetMyRoom) {
    btnResetMyRoom.addEventListener('click', () => resetMyDedicatedRoom());
  }

  if (getPickBtn) {
    getPickBtn.addEventListener('click', () => {
      if (!currentSessionData) return;
      const strats = currentSessionData.suggestedPick?.strategies || [];
      activeStrategyIndex = strats.length > 0 ? (activeStrategyIndex + 1) % strats.length : 0;
      renderSuggestedPick(currentSessionData, activeStrategyIndex);
    });
  }

  document.querySelectorAll('.strat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!currentSessionData) return;
      const idx = parseInt(btn.getAttribute('data-index') || '0', 10);
      activeStrategyIndex = idx;
      renderSuggestedPick(currentSessionData, idx);
    });
  });

  setupAddRollModal();
}

function setupAddRollModal(): void {
  if (btnOpenAddRoll) {
    btnOpenAddRoll.addEventListener('click', () => {
      selectedLiveDice = [];
      updateDiceSlotsDisplay();
      if (addRollError) addRollError.classList.add('hidden');
      if (addRollModal) addRollModal.classList.remove('hidden');
    });
  }

  if (closeAddRollBtn) {
    closeAddRollBtn.addEventListener('click', () => {
      if (addRollModal) addRollModal.classList.add('hidden');
    });
  }

  document.querySelectorAll('.color-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (selectedLiveDice.length >= 4) return;
      const color = btn.getAttribute('data-color') || '';
      selectedLiveDice.push(color);
      updateDiceSlotsDisplay();
    });
  });

  if (btnClearDiceSlots) {
    btnClearDiceSlots.addEventListener('click', () => {
      selectedLiveDice = [];
      updateDiceSlotsDisplay();
    });
  }

  if (btnSubmitLiveRoll) {
    btnSubmitLiveRoll.addEventListener('click', async () => {
      if (selectedLiveDice.length < 4) {
        if (addRollError) {
          addRollError.textContent = 'Please pick 4 dice colors for this roll.';
          addRollError.classList.remove('hidden');
        }
        return;
      }

      const activeRoom = currentAuth?.roomId || sessionStorage.getItem(ROOM_STORAGE_KEY) || '';
      btnSubmitLiveRoll.disabled = true;
      if (addRollSpinner) addRollSpinner.classList.remove('hidden');

      try {
        const clientHwid = getDeviceHWID();
        const res = await fetch('/api/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Key': currentAuth?.key || '',
            'X-Client-Hwid': clientHwid
          },
          body: JSON.stringify({
            action: 'add_roll',
            roomId: activeRoom,
            dice: selectedLiveDice,
            authKey: currentAuth?.key || '',
            hwid: clientHwid
          })
        });
        const data: SessionData = await res.json();

        if (res.ok && data.success) {
          currentSessionData = data;
          renderDashboard(data);
          if (addRollModal) addRollModal.classList.add('hidden');
          showAlert('Roll Ingested to Room', `Roll #${data.totalRolls} added to dedicated environment. Predictions updated!`, 'success');
        } else {
          if (res.status === 401 || res.status === 403) {
            redirectToLogin(data.error || 'Session unauthorized.');
            return;
          }
          if (addRollError) {
            addRollError.textContent = data.error || 'Failed to add roll.';
            addRollError.classList.remove('hidden');
          }
        }
      } catch (err) {
        if (addRollError) {
          addRollError.textContent = 'Network error adding roll.';
          addRollError.classList.remove('hidden');
        }
      } finally {
        btnSubmitLiveRoll.disabled = false;
        if (addRollSpinner) addRollSpinner.classList.add('hidden');
      }
    });
  }
}

function updateDiceSlotsDisplay(): void {
  for (let i = 0; i < 4; i++) {
    const slot = document.getElementById(`dice-slot-${i}`);
    if (!slot) continue;
    if (selectedLiveDice[i]) {
      const cName = selectedLiveDice[i];
      const hexDef = OFFICIAL_COLORS.find(c => c.name === cName) || { hex: '#888' };
      slot.classList.add('filled');
      slot.style.borderColor = hexDef.hex;
      slot.style.backgroundColor = `${hexDef.hex}22`;
      slot.innerHTML = `<span class="slot-color-pip" style="background:${hexDef.hex};"></span><span class="slot-text" style="color:#fff;">${cName}</span>`;
    } else {
      slot.classList.remove('filled');
      slot.style.borderColor = '';
      slot.style.backgroundColor = '';
      slot.innerHTML = `<span class="slot-text">Die ${i + 1}</span>`;
    }
  }
}

async function resetMyDedicatedRoom(): Promise<void> {
  const activeRoom = currentAuth?.roomId || sessionStorage.getItem(ROOM_STORAGE_KEY) || '';
  if (!confirm(`Reset your dedicated room (#${activeRoom})?\n\nThis will clear any noisy roll buffers and give you a clean, isolated 36-roll session with zero cross-user collisions.`)) {
    return;
  }
  setLoadingState(true);
  try {
    const clientHwid = getDeviceHWID();
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Key': currentAuth?.key || '',
        'X-Client-Hwid': clientHwid
      },
      body: JSON.stringify({
        action: 'reset_room',
        roomId: activeRoom,
        authKey: currentAuth?.key || '',
        hwid: clientHwid
      })
    });
    const data: SessionData = await res.json();
    if (res.ok && data.success) {
      currentSessionData = data;
      renderDashboard(data);
      showAlert('Isolated Room Refreshed', 'Your dedicated environment has been reset with a pristine session buffer.', 'success');
    } else {
      if (res.status === 401 || res.status === 403) {
        redirectToLogin(data.error);
        return;
      }
      showAlert('Reset Failed', data.error || 'Could not reset room.', 'error');
    }
  } catch (e) {
    showAlert('Error', 'Network error resetting room.', 'error');
  } finally {
    setLoadingState(false);
  }
}

// ---------------------------------------------------------------------------
// CORE VERIFICATION & ORACLE RENDER
// ---------------------------------------------------------------------------
async function executeVerification(sessionId: string): Promise<void> {
  const sanitizedRegex = /^[a-zA-Z0-9_-]+$/;
  if (!sanitizedRegex.test(sessionId)) {
    showAlert('Invalid Format', 'Session IDs must only contain alphanumeric characters, hyphens, and underscores.', 'warning');
    return;
  }

  hideAlert();
  setLoadingState(true);

  try {
    const activeRoom = currentAuth?.roomId || sessionStorage.getItem(ROOM_STORAGE_KEY) || '';
    const clientHwid = getDeviceHWID();
    const authKey = currentAuth?.key || '';

    const url = `/api/verify?sessionId=${encodeURIComponent(sessionId)}&roomId=${encodeURIComponent(activeRoom)}&authKey=${encodeURIComponent(authKey)}&hwid=${encodeURIComponent(clientHwid)}`;
    const res = await fetch(url, {
      headers: {
        'X-Auth-Key': authKey,
        'X-Client-Hwid': clientHwid
      }
    });
    const data: SessionData = await res.json();

    if (!res.ok || !data.success) {
      if (res.status === 401 || res.status === 403) {
        redirectToLogin(data.error || 'Session unauthorized.');
        return;
      }
      showAlert('Session Query Failed', data.error || `Unable to load session '${sessionId}'.`, 'error');
      setLoadingState(false);
      return;
    }

    currentSessionData = data;
    renderDashboard(data);
    const roomMsg = data.isolated ? ` in your dedicated isolated room (#${data.roomId || activeRoom}) [Zero Collisions]` : '';
    showAlert('Audit Complete', `Successfully ingested ${data.totalRolls} rolls for session '${sessionId}'${roomMsg}.`, 'success');
  } catch (err) {
    showAlert('Network Disconnection', 'Could not establish connection to the audit backend.', 'error');
  } finally {
    setLoadingState(false);
  }
}

function renderDashboard(data: SessionData): void {
  const { sessionId, source, totalRolls, stats, rolls } = data;

  if (emptyState) emptyState.classList.add('hidden');
  if (dashboardContent) dashboardContent.classList.remove('hidden');

  if (statSessionId) statSessionId.textContent = sessionId;
  if (statSessionSource) statSessionSource.textContent = source || 'Dedicated Environment';
  if (statTotalRolls) statTotalRolls.textContent = totalRolls.toLocaleString();
  if (statTotalDice) statTotalDice.textContent = stats.totalDiceAnalyzed.toLocaleString();

  const avgDice = totalRolls > 0 ? (stats.totalDiceAnalyzed / totalRolls).toFixed(1) : '0';
  if (statDicePerRoll) statDicePerRoll.textContent = `Average ${avgDice} dice per roll`;

  if (statFairnessTag && statRiggedInfo) {
    if (stats.allFair) {
      statFairnessTag.textContent = 'VERIFIED FAIR';
      statFairnessTag.className = 'stat-value fair-tag';
      statRiggedInfo.textContent = '0 manipulation flags recorded';
    } else {
      statFairnessTag.textContent = 'FLAG DETECTED';
      statFairnessTag.className = 'stat-value dev-neg';
      statRiggedInfo.textContent = `${stats.riggedFlagsCount} rigged roll flags detected`;
    }
  }

  renderColorGrid(stats);
  renderRollHistory(rolls);

  if (pickIdleMessage) pickIdleMessage.classList.remove('hidden');
  if (pickActiveDisplay) pickActiveDisplay.classList.add('hidden');
}

function renderColorGrid(stats: SessionStats): void {
  if (!colorStatsGrid) return;
  colorStatsGrid.innerHTML = '';

  OFFICIAL_COLORS.forEach(colorDef => {
    const statItem = stats.colors[colorDef.name] || {
      count: 0,
      percentage: 0,
      deviation: -16.67
    };

    const count = statItem.count;
    const pct = statItem.percentage;
    const dev = statItem.deviation;

    let devClass = 'dev-neutral';
    let devPrefix = '';
    if (dev > 0.3) {
      devClass = 'dev-pos';
      devPrefix = '+';
    } else if (dev < -0.3) {
      devClass = 'dev-neg';
      devPrefix = '';
    }

    const card = document.createElement('div');
    card.className = 'color-card';
    card.innerHTML = `
      <div class="color-card-header">
        <div class="color-pip" style="background-color: ${colorDef.hex}; color: ${colorDef.hex};"></div>
        <div class="color-title-block">
          <div class="color-name">${colorDef.name}</div>
          <div class="color-hex">${colorDef.hex}</div>
        </div>
      </div>
      <div class="color-count-row">
        <span class="color-count">${count}</span>
        <span class="color-count-label">hits</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${Math.min(pct * 2, 100)}%; background-color: ${colorDef.hex};"></div>
      </div>
      <div class="color-stat-foot">
        <span class="color-percentage">${pct.toFixed(1)}%</span>
        <span class="color-deviation ${devClass}">${devPrefix}${dev.toFixed(1)}%</span>
      </div>
    `;
    colorStatsGrid.appendChild(card);
  });
}

function renderRollHistory(allRolls: RollRecord[]): void {
  if (!rollsTableBody) return;
  rollsTableBody.innerHTML = '';

  const last15 = allRolls.slice(-15).reverse();
  if (historyCountTag) {
    historyCountTag.textContent = `Showing latest ${last15.length} of ${allRolls.length} rolls`;
  }

  last15.forEach(roll => {
    const tr = document.createElement('tr');
    const hash = roll.hash || 'N/A';
    const shortHash = hash.length > 18 ? `${hash.substring(0, 10)}...${hash.substring(hash.length - 6)}` : hash;

    const diceHtml = roll.dice.map(d => `
      <span class="dice-chip" title="${d.name} (${d.hex})">
        <span class="dice-chip-pip" style="background-color: ${d.hex}; color: ${d.hex};"></span>
        ${d.name}
      </span>
    `).join('');

    const formattedTime = roll.time ? new Date(roll.time * 1000).toLocaleTimeString() : 'N/A';
    const integrityHtml = roll.isRigged
      ? `<span class="rigged-pill">⚠️ Rigged</span>`
      : `<span class="verified-pill">✓ Fair</span>`;

    tr.innerHTML = `
      <td class="roll-id-cell">#${roll.rollNumber}</td>
      <td>
        <div class="hash-container">
          <span class="hash-text" title="${hash}">${shortHash}</span>
          <button type="button" class="copy-hash-btn" data-hash="${hash}" title="Copy full hash">📋</button>
        </div>
      </td>
      <td><div class="dice-display-grid">${diceHtml}</div></td>
      <td class="timestamp-cell">${formattedTime}</td>
      <td style="text-align: center;">${integrityHtml}</td>
    `;
    rollsTableBody.appendChild(tr);
  });

  document.querySelectorAll('.copy-hash-btn').forEach(b => {
    b.addEventListener('click', () => {
      const h = b.getAttribute('data-hash') || '';
      navigator.clipboard.writeText(h).then(() => {
        const orig = b.textContent;
        b.textContent = '✓';
        setTimeout(() => { b.textContent = orig; }, 1500);
      });
    });
  });
}

function renderSuggestedPick(session: SessionData, stratIdx: number): void {
  const pick = session.suggestedPick;
  if (!pick) return;

  const strategies = pick.strategies || [];
  const strat = strategies[stratIdx] || strategies[0];
  if (!strat) return;

  if (pickIdleMessage) pickIdleMessage.classList.add('hidden');
  if (pickActiveDisplay) pickActiveDisplay.classList.remove('hidden');

  let titleText = strat.color;
  if (strat.secondaryColor && strat.tertiaryColor) {
    titleText = `${strat.color} + ${strat.secondaryColor} + ${strat.tertiaryColor}`;
  } else if (strat.secondaryColor) {
    titleText = `${strat.color} + ${strat.secondaryColor}`;
  }

  if (pickColorTitle) {
    pickColorTitle.textContent = titleText;
    pickColorTitle.style.color = strat.hex;
  }
  if (pickStrategyTag) pickStrategyTag.textContent = strat.strategy;
  if (pickConfidenceTag) pickConfidenceTag.textContent = `${strat.confidence}% CONFIDENCE`;
  if (pickColorDesc) pickColorDesc.innerHTML = strat.rationale;

  if (pickOrb && pickOrbInner) {
    pickOrb.style.borderColor = strat.hex;
    pickOrb.style.boxShadow = `0 0 35px ${strat.hex}88, inset 0 0 25px ${strat.hex}66`;
    pickOrbInner.style.backgroundColor = strat.hex;
    pickOrbInner.style.boxShadow = `0 0 20px ${strat.hex}`;
  }

  document.querySelectorAll('.strat-btn').forEach(btn => {
    const idx = parseInt(btn.getAttribute('data-index') || '0', 10);
    if (idx === stratIdx) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// ---------------------------------------------------------------------------
// ANNOUNCEMENT & BACKGROUND GUARDS
// ---------------------------------------------------------------------------
async function fetchAndRenderAnnouncement(): Promise<void> {
  try {
    const res = await fetch('/api/auth?action=get_announcement');
    const data = await res.json();
    if (res.ok && data.success && data.announcement && data.announcement.enabled) {
      const a = data.announcement as AnnouncementData;
      if (websiteAnnouncementBanner && annTitle && annMsg) {
        annTitle.textContent = a.title;
        annMsg.textContent = a.message;
        websiteAnnouncementBanner.classList.remove('hidden');
      }
    }
  } catch (e) {}

  if (annCloseBtn && websiteAnnouncementBanner) {
    annCloseBtn.addEventListener('click', () => {
      websiteAnnouncementBanner.classList.add('hidden');
    });
  }
}

function startHeartbeatGuard(): void {
  setInterval(async () => {
    if (!currentAuth || !currentAuth.key) return;
    try {
      const hwid = getDeviceHWID();
      const res = await fetch(`/api/auth?action=verify&key=${encodeURIComponent(currentAuth.key)}&hwid=${encodeURIComponent(hwid)}`);
      const data: AuthState = await res.json();
      if (!res.ok || !data.success || !data.valid) {
        redirectToLogin(data.error || 'Your key session has been revoked or expired.');
      }
    } catch (e) {}
  }, 120000);
}

function showAlert(title: string, message: string, type: 'success' | 'warning' | 'error'): void {
  if (!alertBanner || !alertTitle || !alertMessage) return;
  alertTitle.textContent = title;
  alertMessage.textContent = message;
  alertBanner.className = `alert-banner alert-${type}`;
  alertBanner.classList.remove('hidden');
}

function hideAlert(): void {
  if (alertBanner) alertBanner.classList.add('hidden');
}

function setLoadingState(loading: boolean): void {
  if (verifyBtn) verifyBtn.disabled = loading;
  if (btnSpinner) btnSpinner.style.display = loading ? 'inline-block' : 'none';
}

