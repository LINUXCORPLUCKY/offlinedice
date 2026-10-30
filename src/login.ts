import { AuthState, MaintenanceData } from './types';

const AUTH_STORAGE_KEY = 'headless_dice_session_key';
const ROOM_STORAGE_KEY = 'headless_user_room_id';
const AUTH_DATA_KEY = 'headless_auth_data';

// DOM Elements
const gateForm = document.getElementById('gate-form') as HTMLFormElement | null;
const gateKeyInput = document.getElementById('gate-key-input') as HTMLInputElement | null;
const gateSubmitBtn = document.getElementById('gate-submit-btn') as HTMLButtonElement | null;
const gateSpinner = document.getElementById('gate-spinner') as HTMLElement | null;
const gateAlert = document.getElementById('gate-alert') as HTMLElement | null;
const gateAlertMsg = document.getElementById('gate-alert-msg') as HTMLElement | null;
const gateClearBtn = document.getElementById('gate-clear-btn') as HTMLElement | null;
const gateHwidDisplay = document.getElementById('gate-hwid-display') as HTMLElement | null;

// Video Modal
const btnHowToUse = document.getElementById('btn-how-to-use') as HTMLButtonElement | null;
const videoTutorialModal = document.getElementById('video-tutorial-modal') as HTMLElement | null;
const btnCloseVideo = document.getElementById('btn-close-video') as HTMLButtonElement | null;
const btnGotIt = document.getElementById('btn-got-it') as HTMLButtonElement | null;
const tutorialVideoPlayer = document.getElementById('tutorial-video-player') as HTMLVideoElement | null;

// Maintenance Elements
const maintenanceOverlay = document.getElementById('maintenance-overlay') as HTMLElement | null;
const maintDesc = document.getElementById('maint-desc') as HTMLElement | null;
const maintHrs = document.getElementById('maint-hrs') as HTMLElement | null;
const maintMins = document.getElementById('maint-mins') as HTMLElement | null;
const maintSecs = document.getElementById('maint-secs') as HTMLElement | null;
const maintProgressBar = document.getElementById('maint-progress-bar') as HTMLElement | null;
let maintenanceTimerInterval: any = null;

// Hardware ID Fingerprint Generator
export function getDeviceHWID(): string {
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

// Initialize Login Page
document.addEventListener('DOMContentLoaded', () => {
  initHWIDDisplay();
  setupLoginForm();
  setupVideoModal();
  initMaintenanceCheck();
  autoLoginIfSessionExists();
});

function initHWIDDisplay(): void {
  const hwid = getDeviceHWID();
  if (gateHwidDisplay) {
    gateHwidDisplay.textContent = hwid;
  }
}

async function autoLoginIfSessionExists(): Promise<void> {
  const savedKey = sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY);
  if (!savedKey) return;

  const hwid = getDeviceHWID();
  try {
    const res = await fetch(`/api/auth?action=verify&key=${encodeURIComponent(savedKey)}&hwid=${encodeURIComponent(hwid)}`);
    const data: AuthState = await res.json();
    if (res.ok && data.success && data.valid) {
      storeSessionAndRedirect(data);
    } else {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      if (gateAlert && gateAlertMsg) {
        gateAlert.classList.remove('hidden');
        gateAlertMsg.textContent = data.error || 'Previous session expired. Please enter your key.';
      }
    }
  } catch (err) {
    // Keep user on login form
  }
}

function setupLoginForm(): void {
  if (gateKeyInput && gateClearBtn) {
    gateKeyInput.addEventListener('input', () => {
      gateClearBtn.style.display = gateKeyInput.value ? 'block' : 'none';
    });

    gateClearBtn.addEventListener('click', () => {
      gateKeyInput.value = '';
      gateClearBtn.style.display = 'none';
      gateKeyInput.focus();
    });
  }

  if (gateForm) {
    gateForm.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      const inputVal = (gateKeyInput?.value || '').trim();
      if (!inputVal) return;

      if (gateSubmitBtn) gateSubmitBtn.disabled = true;
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
        if (gateSubmitBtn) gateSubmitBtn.disabled = false;
        if (gateSpinner) gateSpinner.style.display = 'none';
      }
    });
  }
}

function storeSessionAndRedirect(authData: AuthState): void {
  const roomId = authData.roomId || `ROOM-${authData.key.slice(0, 4)}-${authData.key.slice(-4)}`;
  sessionStorage.setItem(AUTH_STORAGE_KEY, authData.key);
  sessionStorage.setItem(ROOM_STORAGE_KEY, roomId);
  sessionStorage.setItem(AUTH_DATA_KEY, JSON.stringify(authData));
  localStorage.setItem(AUTH_STORAGE_KEY, authData.key);

  if (gateSubmitBtn) {
    gateSubmitBtn.textContent = '✓ Access Granted! Entering Room...';
    gateSubmitBtn.style.background = 'linear-gradient(135deg, #00e676, #00b0ff)';
  }

  // Seamless transition to dedicated room
  setTimeout(() => {
    window.location.href = '/room.html';
  }, 400);
}

function showLoginError(msg: string): void {
  if (gateAlert && gateAlertMsg) {
    gateAlert.classList.remove('hidden');
    gateAlertMsg.textContent = msg;
  }
}

function setupVideoModal(): void {
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

