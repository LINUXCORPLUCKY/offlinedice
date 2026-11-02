// ==============================================================================
// HEADLESS DICE — CLIENT LOGIN ENGINE
// HWID Grabber & Instant MongoDB Atlas Verification Gateway
// ==============================================================================

(function() {
  function getDeviceHwid() {
    let cached = localStorage.getItem('headless_dice_device_hwid');
    if (cached && /^HD-HWID-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(cached)) {
      return cached;
    }
    try {
      const raw = [
        navigator.userAgent,
        navigator.hardwareConcurrency || 4,
        screen.width + 'x' + screen.height,
        screen.colorDepth || 24,
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      ].join('###');

      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
      }
      const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
      const generated = 'HD-HWID-' + hex.slice(0, 4) + '-' + hex.slice(4, 8);
      localStorage.setItem('headless_dice_device_hwid', generated);
      return generated;
    } catch(e) {
      return 'HD-HWID-8389-1V19';
    }
  }

  function getAuthSession() {
    try {
      const raw = sessionStorage.getItem('headless_dice_auth') || localStorage.getItem('headless_dice_auth');
      return raw ? JSON.parse(raw) : null;
    } catch(e) {
      return null;
    }
  }

  async function handleUnlockGate() {
    const inputEl = document.getElementById('gate-key-input');
    const statusEl = document.getElementById('gate-status-msg');
    const unlockBtn = document.getElementById('btn-unlock-gate');
    if (!inputEl) return;

    const inputKey = inputEl.value.trim().toUpperCase().replace(/\s+/g, '-').replace(/-+/g, '-');
    if (!inputKey) {
      if (statusEl) {
        statusEl.style.color = '#ef4444';
        statusEl.textContent = '⚠️ Please enter your license key or owner code.';
      }
      return;
    }

    if (statusEl) {
      statusEl.style.color = '#00f0ff';
      statusEl.textContent = '⚡ Verifying key securely with MongoDB Atlas...';
    }
    if (unlockBtn) unlockBtn.disabled = true;

    const userHwid = getDeviceHwid();

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: inputKey, hwid: userHwid })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (unlockBtn) unlockBtn.disabled = false;
        if (statusEl) {
          statusEl.style.color = '#ef4444';
          statusEl.textContent = '❌ ' + (data.error || 'Invalid or Unbound License Key.');
        }
        return;
      }

      // Successful verification
      localStorage.setItem('headless_dice_auth', JSON.stringify(data));
      sessionStorage.setItem('headless_dice_auth', JSON.stringify(data));
      if (data.role === 'OWNER' || (data.key && data.key.toUpperCase().startsWith('HD-OWNER'))) {
        sessionStorage.setItem('HD_OWNER_KEY', data.key);
        localStorage.setItem('HD_OWNER_KEY', data.key);
      }

      if (statusEl) {
        statusEl.style.color = '#34d399';
        statusEl.textContent = '⚡ Access Granted! Redirecting to your dedicated room...';
      }

      if (window.showToast) window.showToast('⚡ Access Granted! Role: ' + (data.role || 'USER'));

      try {
        const audio = document.getElementById('sfx-lock');
        if (audio) audio.play().catch(() => {});
      } catch(e) {}

      setTimeout(() => {
        const targetRoom = data.roomId || ('ROOM-' + userHwid.slice(-4));
        window.location.replace('/room?id=' + encodeURIComponent(targetRoom));
      }, 500);

    } catch (err) {
      if (unlockBtn) unlockBtn.disabled = false;
      if (statusEl) {
        statusEl.style.color = '#ef4444';
        statusEl.textContent = '⚠️ Connection error: ' + (err.message || 'Service busy') + '. Please retry.';
      }
    }
  }

  function initLogin() {
    // If already authenticated, redirect straight to user room!
    const auth = getAuthSession();
    if (auth && (auth.sessionToken || auth.key)) {
      const roomId = auth.roomId || 'DEDICATED';
      window.location.replace('/room?id=' + encodeURIComponent(roomId));
      return;
    }

    const hwid = getDeviceHwid();
    const hwidEl = document.getElementById('gate-hwid-text');
    if (hwidEl) hwidEl.textContent = hwid;

    const copyBtn = document.getElementById('btn-copy-gate-hwid');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(hwid);
        }
        copyBtn.innerHTML = '<span>COPIED! ✓</span>';
        copyBtn.style.color = '#34d399';
        setTimeout(() => {
          copyBtn.innerHTML = '<span>📋 Copy HWID</span>';
          copyBtn.style.color = '';
        }, 2000);
        if (window.showToast) window.showToast('HWID copied to clipboard');
      });
    }

    const unlockBtn = document.getElementById('btn-unlock-gate');
    if (unlockBtn) unlockBtn.addEventListener('click', handleUnlockGate);

    const keyInput = document.getElementById('gate-key-input');
    if (keyInput) {
      keyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleUnlockGate();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogin);
  } else {
    initLogin();
  }
})();

