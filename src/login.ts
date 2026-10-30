import { AuthState, MaintenanceData } from './types';

const AUTH_STORAGE_KEY = 'headless_dice_session_key';
const ROOM_STORAGE_KEY = 'headless_user_room_id';
const AUTH_DATA_KEY = 'headless_auth_data';

// Hardware ID Fingerprint Generator
function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeStorageSet(key: string, val: string): void {
  try {
    localStorage.setItem(key, val);
  } catch (e) {}
}

function getDeviceHWID(): string {
  let cached = safeStorageGet('headless_dice_hwid');
  if (cached && /^HD-HWID-[A-F0-9]{4}-[A-F0-9]{4}$/.test(cached)) {
    return cached;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    let gpu = '';
    if (gl && 'getExtension' in gl) {
      const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
      gpu = debugInfo ? (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    }
    const fp = [
      navigator.userAgent || '',
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
    safeStorageSet('headless_dice_hwid', hwid);
    return hwid;
  } catch (e) {
    const fallback = 'HD-HWID-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    safeStorageSet('headless_dice_hwid', fallback);
    return fallback;
  }
}

// Make HWID accessible globally
(window as any).getDeviceHWID = getDeviceHWID;

let maintenanceTimerInterval: any = null;

function initHWIDDisplay(): void {
  const gateHwidDisplay = document.getElementById('gate-hwid-display');
  if (gateHwidDisplay) {
    try {
      const hwid = getDeviceHWID();
      gateHwidDisplay.textContent = hwid;
    } catch (e) {
      gateHwidDisplay.textContent = 'HD-HWID-ONLINE';
    }
  }
}

function setupLoginForm(): void {
  const gateForm = document.getElementById('gate-form') as HTMLFormElement | null;
  const gateKeyInput = document.getElementById('gate-key-input') as HTMLInputElement | null;
  const gateSubmitBtn = document.getElementById('gate-submit-btn') as HTMLButtonElement | null;
  const gateSpinner = document.getElementById('gate-spinner') as HTMLElement | null;
  const gateAlert = document.getElementById('gate-alert') as HTMLElement | null;
  const gateAlertMsg = document.getElementById('gate-alert-msg') as HTMLElement | null;
  const gateClearBtn = document.getElementById('gate-clear-btn') as HTMLElement | null;

  if (gateKeyInput && gateClearBtn) {
    gateKeyInput.addEventListener('input', () => {
      gateClearBtn.style.display = gateKeyInput.value ? 'block' : 'none';
    });

    gateClearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      gateKeyInput.value = '';
      gateClearBtn.style.display = 'none';
      gateKeyInput.focus();
    });
  }

  const handleLoginSubmit = async (e?: Event) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const inputVal = (gateKeyInput?.value || '').trim();
    if (!inputVal) {
      showLoginError('Please enter your license key.');
      gateKeyInput?.focus();
      return;
    }

    if (gateSubmitBtn) {
      gateSubmitBtn.disabled = true;
      gateSubmitBtn.style.opacity = '0.7';
    }
    if (gateSpinner) gateSpinner.style.display = 'inline-block';
    if (gateAlert) gateAlert.classList.add('hidden');

    const hwid = getDeviceHWID();

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', key: inputVal, hwid })
      });
      const data: AuthState = await res.json();

      if (res.ok && data.success && data.valid) {
        storeSessionAndRedirect(data);
      } else {
        showLoginError(data.error || 'Invalid license key. Check for typos or acquire a key in Discord.');
      }
    } catch (err) {
      showLoginError('Network connection error. Please verify your connection and try again.');
    } finally {
      if (gateSubmitBtn) {
        gateSubmitBtn.disabled = false;
        gateSubmitBtn.style.opacity = '1';
      }
      if (gateSpinner) gateSpinner.style.display = 'none';
    }
  };

  if (gateForm) {
    gateForm.addEventListener('submit', handleLoginSubmit);
  }

  if (gateSubmitBtn) {
    gateSubmitBtn.addEventListener('click', (e) => {
      if (!gateForm) {
        handleLoginSubmit(e);
      }
    });
  }
}

function storeSessionAndRedirect(authData: AuthState): void {
  const roomId = authData.roomId || `ROOM-${authData.key.slice(0, 4)}-${authData.key.slice(-4)}`;
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEY, authData.key);
    sessionStorage.setItem(ROOM_STORAGE_KEY, roomId);
    sessionStorage.setItem(AUTH_DATA_KEY, JSON.stringify(authData));
    localStorage.setItem(AUTH_STORAGE_KEY, authData.key);
  } catch (e) {}

  const gateSubmitBtn = document.getElementById('gate-submit-btn') as HTMLButtonElement | null;
  if (gateSubmitBtn) {
    gateSubmitBtn.innerHTML = '<span>&#10003; Access Granted! Entering Room...</span>';
    gateSubmitBtn.style.background = 'linear-gradient(135deg, #00e676, #00b0ff)';
  }

  // Seamless transition to dedicated room
  setTimeout(() => {
    window.location.href = '/room.html';
  }, 350);
}

function showLoginError(msg: string): void {
  const gateAlert = document.getElementById('gate-alert');
  const gateAlertMsg = document.getElementById('gate-alert-msg');
  if (gateAlert && gateAlertMsg) {
    gateAlert.classList.remove('hidden');
    gateAlertMsg.textContent = msg;
  }
}

function setupVideoModal(): void {
  const btnHowToUse = document.getElementById('btn-how-to-use');
  const videoTutorialModal = document.getElementById('video-tutorial-modal');
  const btnCloseVideo = document.getElementById('btn-close-video');
  const btnGotIt = document.getElementById('btn-got-it');
  const tutorialVideoPlayer = document.getElementById('tutorial-video-player') as HTMLVideoElement | null;

  const openVideo = (): void => {
    if (videoTutorialModal) {
      videoTutorialModal.classList.remove('hidden');
      if (tutorialVideoPlayer) {
        tutorialVideoPlayer.currentTime = 0;
        tutorialVideoPlayer.play().catch(() => {});
      }
    }
  };

  const closeVideo = (): void => {
    if (videoTutorialModal) {
      videoTutorialModal.classList.add('hidden');
      if (tutorialVideoPlayer) {
        tutorialVideoPlayer.pause();
      }
    }
  };

  if (btnHowToUse) btnHowToUse.addEventListener('click', openVideo);
  if (btnCloseVideo) btnCloseVideo.addEventListener('click', closeVideo);
  if (btnGotIt) btnGotIt.addEventListener('click', closeVideo);
  if (videoTutorialModal) {
    videoTutorialModal.addEventListener('click', (e: MouseEvent) => {
      if (e.target === videoTutorialModal) closeVideo();
    });
  }
}

async function autoLoginIfSessionExists(): Promise<void> {
  let savedKey: string | null = null;
  try {
    savedKey = sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY);
  } catch (e) {}
  if (!savedKey) return;

  const hwid = getDeviceHWID();
  try {
    const res = await fetch(`/api/auth?action=verify&key=${encodeURIComponent(savedKey)}&hwid=${encodeURIComponent(hwid)}`);
    const data: AuthState = await res.json();
    if (res.ok && data.success && data.valid) {
      storeSessionAndRedirect(data);
    } else {
      try {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch (e) {}
    }
  } catch (err) {
    // Keep user on login form
  }
}

async function initMaintenanceCheck(): Promise<void> {
  try {
    const res = await fetch('/api/auth?action=get_maintenance');
    const data = await res.json();
    if (res.ok && data.success && data.maintenance && data.maintenance.enabled) {
      renderMaintenanceOverlay(data.maintenance);
    }
  } catch (e) {}
}

function renderMaintenanceOverlay(maint: MaintenanceData): void {
  const maintenanceOverlay = document.getElementById('maintenance-overlay');
  const maintDesc = document.getElementById('maint-desc');
  const maintHrs = document.getElementById('maint-hrs');
  const maintMins = document.getElementById('maint-mins');
  const maintSecs = document.getElementById('maint-secs');
  const maintProgressBar = document.getElementById('maint-progress-bar');

  if (!maintenanceOverlay) return;
  maintenanceOverlay.classList.remove('hidden');

  if (maintDesc && maint.message) {
    maintDesc.textContent = maint.message;
  }

  const durationMs = (maint.durationMinutes || 60) * 60 * 1000;
  const startedAt = maint.startedAt || Date.now();
  const targetEnd = startedAt + durationMs;

  function updateTimer(): void {
    const now = Date.now();
    const remaining = Math.max(0, targetEnd - now);

    const totalSeconds = Math.floor(remaining / 1000);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (maintHrs) maintHrs.textContent = hrs.toString().padStart(2, '0');
    if (maintMins) maintMins.textContent = mins.toString().padStart(2, '0');
    if (maintSecs) maintSecs.textContent = secs.toString().padStart(2, '0');

    if (maintProgressBar) {
      const elapsed = Math.max(0, now - startedAt);
      const pct = Math.min(100, Math.max(0, (elapsed / durationMs) * 100));
      maintProgressBar.style.width = `${pct}%`;
    }

    if (remaining <= 0 && maintenanceTimerInterval) {
      clearInterval(maintenanceTimerInterval);
      maintenanceOverlay?.classList.add('hidden');
    }
  }

  updateTimer();
  maintenanceTimerInterval = setInterval(updateTimer, 1000);
}

// Master Initialization Router (Handles both immediate execution and late DOM events)
function initLoginPage(): void {
  initHWIDDisplay();
  setupLoginForm();
  setupVideoModal();
  initMaintenanceCheck();
  autoLoginIfSessionExists();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLoginPage);
} else {
  initLoginPage();
}
