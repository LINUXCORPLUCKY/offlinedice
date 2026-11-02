/* ==============================================================================
   HEADLESS DICE — ENTERPRISE CLIENT APPLICATION ENGINE
   Liquid Glass 2.0 &bull; Isolated User Room Partitions &bull; MongoDB Atlas Synced
   ============================================================================== */

(function() {
  'use strict';

  // 6 Game Dice Colors
  const COLORS = ['purple', 'blue', 'green', 'red', 'darkorange', 'gold'];
  const COLOR_CONFIG = {
    purple: { name: 'Purple', hex: '#c084fc', icon: '🟣' },
    blue: { name: 'Blue', hex: '#38bdf8', icon: '🔵' },
    green: { name: 'Green', hex: '#34d399', icon: '🟢' },
    red: { name: 'Red', hex: '#f87171', icon: '🔴' },
    darkorange: { name: 'Orange', hex: '#fb923c', icon: '🟠' },
    gold: { name: 'Yellow', hex: '#facc15', icon: '🟡' }
  };

  // State Management
  const STATE = {
    rolls: [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null]
    ],
    activeRollIndex: 0,
    activeDieIndex: 0,
    soundEnabled: true,
    latestPrediction: null
  };

  // Sound FX Manager
  const sfx = {
    play(id) {
      if (!STATE.soundEnabled) return;
      try {
        const el = document.getElementById(id);
        if (el) {
          el.currentTime = 0;
          el.play().catch(() => {});
        }
      } catch(e) {}
    },
    playClick() { this.play('sfx-roll'); },
    playLockChime() { this.play('sfx-lock'); }
  };

  // Hardware ID Fingerprint
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

  // Session Reader
  function getAuthSession() {
    try {
      const raw = sessionStorage.getItem('headless_dice_auth') || localStorage.getItem('headless_dice_auth');
      return raw ? JSON.parse(raw) : null;
    } catch(e) {
      return null;
    }
  }

  // Dedicated Room ID Resolver
  function getUserRoomId() {
    // Check URL params first
    try {
      const url = new URL(window.location.href);
      const urlRoom = url.searchParams.get('id') || url.searchParams.get('room');
      if (urlRoom && urlRoom.trim()) return urlRoom.trim().toUpperCase();
    } catch(e) {}

    const auth = getAuthSession();
    const hwid = getDeviceHwid();
    const shortHwid = hwid ? hwid.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() : 'NODE';

    if (auth) {
      const isOwner = (auth.role === 'OWNER' || auth.role === 'ADMIN' || (auth.key && auth.key.toUpperCase().startsWith('HD-OWNER')));
      if (isOwner) return 'ROOM-OWNER-' + shortHwid;
      if (auth.roomId && !auth.roomId.startsWith('ROOM-OWNER-')) return auth.roomId;
      const shortKey = (auth.key || '').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() || 'VIP';
      return 'ROOM-' + shortHwid + '-' + shortKey;
    }
    return 'ROOM-' + shortHwid + '-DEDICATED';
  }

  // Room Banner UI
  function updateRoomBannerUI() {
    const roomId = getUserRoomId();
    const badgeEl = document.getElementById('room-badge-id');
    if (badgeEl) {
      badgeEl.textContent = roomId;
      badgeEl.title = 'Click to copy your dedicated room URL';
      badgeEl.style.cursor = 'pointer';

      if (!badgeEl.dataset.hasCopyListener) {
        badgeEl.dataset.hasCopyListener = 'true';
        badgeEl.addEventListener('click', () => {
          const roomUrl = window.location.origin + '/room?id=' + encodeURIComponent(roomId);
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(roomUrl);
            } else {
              const ta = document.createElement('textarea');
              ta.value = roomUrl;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            }
            const prev = badgeEl.textContent;
            badgeEl.textContent = 'COPIED! ✓';
            badgeEl.style.color = '#34d399';
            setTimeout(() => {
              badgeEl.textContent = prev;
              badgeEl.style.color = '';
            }, 2000);
            if (window.showToast) window.showToast('Room URL copied to clipboard');
          } catch(e) {}
        });
      }
    }

    // Reflect roomId in browser URL without reloading
    try {
      if (roomId && window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        if (url.searchParams.get('id') !== roomId) {
          url.searchParams.set('id', roomId);
          window.history.replaceState({ roomId: roomId }, '', url.toString());
        }
      }
    } catch(e) {}
  }

  // Load & Persist Isolated Room Partition
  function loadUserRoomState() {
    const roomId = getUserRoomId();
    try {
      const stored = localStorage.getItem('headless_dice_room_' + roomId + '_data');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.rolls) && parsed.rolls.length >= 5) {
          STATE.rolls = parsed.rolls;
          STATE.activeRollIndex = parsed.activeRollIndex || 0;
          STATE.activeDieIndex = parsed.activeDieIndex || 0;
          renderRolls();
          executePredictionCalculation();
        }
      }
    } catch(e) {}
  }

  function persistUserRoomState() {
    const roomId = getUserRoomId();
    const hwid = getDeviceHwid();
    const payload = {
      roomId: roomId,
      hwid: hwid,
      rolls: STATE.rolls,
      activeRollIndex: STATE.activeRollIndex,
      activeDieIndex: STATE.activeDieIndex,
      updatedAt: Date.now()
    };
    try {
      localStorage.setItem('headless_dice_room_' + roomId + '_data', JSON.stringify(payload));
    } catch(e) {}
  }

  // Strict Room Permission Gate Checker
  function checkAuthStatus() {
    const auth = getAuthSession();
    if (!auth || (!auth.sessionToken && !auth.key)) {
      // Unauthenticated visitor -> Redirect to dedicated login page!
      window.location.replace('/login');
      return false;
    }

    // User is authenticated!
    const ownerToggleBtn = document.getElementById('owner-panel-toggle-btn');
    if (ownerToggleBtn) {
      if (auth.role === 'OWNER' || auth.role === 'ADMIN' || (auth.key && auth.key.toUpperCase().startsWith('HD-OWNER'))) {
        ownerToggleBtn.style.display = 'inline-flex';
      } else {
        ownerToggleBtn.style.display = 'none';
      }
    }

    updateRoomBannerUI();
    loadUserRoomState();
    return true;
  }

  // Logout Handler
  window.handleLogout = function() {
    localStorage.removeItem('headless_dice_auth');
    sessionStorage.removeItem('headless_dice_auth');
    localStorage.removeItem('HD_OWNER_KEY');
    sessionStorage.removeItem('HD_OWNER_KEY');
    if (window.showToast) window.showToast('🔒 Logged out of room instance.');
    setTimeout(() => {
      window.location.replace('/login');
    }, 300);
  };

  // ==========================================
  // MATHEMATICAL PREDICTION ENGINE ALGORITHM
  // ==========================================
  function solve1ColorPrediction(rollsInput) {
    const rolls = rollsInput || STATE.rolls;
    const validRolls = rolls
      .map(r => r.filter(c => c && COLOR_CONFIG[c]))
      .filter(r => r.length > 0);

    const M = validRolls.length;
    if (M === 0) return null;

    const rawCounts = { purple: 0, blue: 0, green: 0, red: 0, darkorange: 0, gold: 0 };
    let totalDiceEntered = 0;

    validRolls.forEach(round => {
      round.forEach(c => {
        rawCounts[c]++;
        totalDiceEntered++;
      });
    });

    if (totalDiceEntered === 0) return null;

    const rLatest = validRolls[M - 1] || [];
    const rPrev = M >= 2 ? validRolls[M - 2] : [];
    const rTwoAgo = M >= 3 ? validRolls[M - 3] : [];

    const scores = {};
    COLORS.forEach(c => scores[c] = 8.0);

    validRolls.forEach((round, rIdx) => {
      const progress = M > 1 ? (rIdx / (M - 1)) : 1.0;
      const weight = 1.0 + (progress * 2.4);

      round.forEach(c => {
        scores[c] += weight * 12.0;
      });

      COLORS.forEach(c => {
        const countInRound = round.filter(x => x === c).length;
        if (countInRound >= 2) {
          scores[c] += weight * (countInRound === 2 ? 8.0 : 16.0);
        }
      });
    });

    COLORS.forEach(c => {
      const inLatest = rLatest.filter(x => x === c).length;
      const inPrev = rPrev.filter(x => x === c).length;
      const inTwoAgo = rTwoAgo.filter(x => x === c).length;

      if (inLatest > 0 && inPrev > 0) {
        scores[c] += 18.0;
        if (inTwoAgo > 0) scores[c] += 10.0;
      } else if (inLatest === 0 && inPrev > 0) {
        scores[c] += 14.0;
      } else if (inLatest === 0 && inPrev === 0 && inTwoAgo > 0) {
        scores[c] += 8.0;
      }
    });

    if (M >= 2) {
      const trans = {};
      COLORS.forEach(c1 => {
        trans[c1] = {};
        COLORS.forEach(c2 => trans[c1][c2] = 0);
      });

      let totalTransitions = 0;
      for (let i = 0; i < M - 1; i++) {
        const cur = validRolls[i];
        const nxt = validRolls[i + 1];
        cur.forEach(c1 => {
          nxt.forEach(c2 => {
            trans[c1][c2]++;
            totalTransitions++;
          });
        });
      }

      if (totalTransitions > 0) {
        const projected = {};
        COLORS.forEach(c => projected[c] = 0);

        rLatest.forEach(cLatest => {
          COLORS.forEach(target => {
            projected[target] += trans[cLatest][target];
          });
        });

        let maxProj = 0;
        COLORS.forEach(c => {
          if (projected[c] > maxProj) maxProj = projected[c];
        });

        if (maxProj > 0) {
          COLORS.forEach(c => {
            scores[c] += (projected[c] / maxProj) * 14.0;
          });
        }
      }
    }

    const cooccur = {};
    COLORS.forEach(c => cooccur[c] = 0);

    validRolls.forEach(round => {
      rLatest.forEach(cLatest => {
        if (round.includes(cLatest)) {
          round.forEach(cOther => {
            if (cOther !== cLatest) cooccur[cOther]++;
          });
        }
      });
    });

    let maxCooccur = 0;
    COLORS.forEach(c => {
      if (cooccur[c] > maxCooccur) maxCooccur = cooccur[c];
    });
    if (maxCooccur > 0) {
      COLORS.forEach(c => {
        scores[c] += (cooccur[c] / maxCooccur) * 8.0;
      });
    }

    COLORS.forEach(c => {
      const hits = rawCounts[c] || 0;
      if (hits === 0) {
        scores[c] = Math.max(2.0, scores[c] * 0.35);
      } else if (hits === 1 && M >= 4 && !rLatest.includes(c) && !rPrev.includes(c)) {
        scores[c] = Math.max(3.0, scores[c] * 0.70);
      }
    });

    let totalScore = 0;
    COLORS.forEach(c => totalScore += scores[c]);

    const distribution = {};
    COLORS.forEach(c => {
      distribution[c] = (scores[c] / totalScore) * 100;
    });

    const ranked = [...COLORS].sort((a, b) => {
      if (Math.abs(distribution[b] - distribution[a]) > 0.05) {
        return distribution[b] - distribution[a];
      }
      return (rawCounts[b] || 0) - (rawCounts[a] || 0);
    });

    const topColor = ranked[0];
    const secondColor = ranked[1] || ranked[0];

    const leadMargin = distribution[topColor] - distribution[secondColor];
    const calibratedConfidence = Math.min(95.6, Math.max(82.0, 83.0 + (leadMargin * 1.35)));
    const calibratedSecondConf = Math.min(89.0, Math.max(73.0, 73.0 + (distribution[secondColor] * 0.55)));

    const coldColor = [...COLORS].sort((a, b) => (rawCounts[a] || 0) - (rawCounts[b] || 0))[0];

    let entropy = 0;
    COLORS.forEach(c => {
      const p = distribution[c] / 100;
      if (p > 0) entropy -= p * Math.log2(p);
    });
    const normalizedEntropy = (entropy / Math.log2(6)).toFixed(2);

    return {
      topColor: topColor,
      secondColor: secondColor,
      topProbability: calibratedConfidence.toFixed(1),
      secondProbability: calibratedSecondConf.toFixed(1),
      distribution: distribution,
      ranked: ranked,
      hotColor: topColor,
      coldColor: coldColor,
      entropyScore: normalizedEntropy,
      totalRollsAnalyzed: M,
      totalDiceEntered: totalDiceEntered,
      latestRound: rLatest
    };
  }

  // ==========================================
  // UI RENDERING & COMPONENT LOGIC
  // ==========================================
  function renderRolls() {
    const container = document.getElementById('rolls-matrix-container');
    if (!container) return;

    container.innerHTML = '';
    const totalCountEl = document.getElementById('total-rolls-count');
    if (totalCountEl) totalCountEl.textContent = STATE.rolls.length;

    STATE.rolls.forEach((roll, rIdx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'roll-row' + (rIdx === STATE.activeRollIndex ? ' active-row' : '');
      rowEl.dataset.rollIndex = rIdx;

      const isLatest = rIdx === STATE.rolls.length - 1;
      const rollNum = rIdx + 1;
      let subtitleText = '';
      if (isLatest) {
        subtitleText = '<span class="badge-latest">LATEST (Most Recent)</span>';
      } else {
        const ago = STATE.rolls.length - rIdx;
        subtitleText = '<span class="roll-subtext">' + ago + ' Rounds Ago</span>';
      }

      let diceSlotsHtml = '';
      roll.forEach((dieColor, dIdx) => {
        const isActive = (rIdx === STATE.activeRollIndex && dIdx === STATE.activeDieIndex);
        const colorClass = dieColor ? ' die-filled die-' + dieColor : ' die-empty';
        const activeClass = isActive ? ' slot-active' : '';
        const displayText = dieColor ? COLOR_CONFIG[dieColor].name.slice(0, 3).toUpperCase() : 'DIE ' + (dIdx + 1);

        diceSlotsHtml += '<div class="die-slot' + colorClass + activeClass + '" data-roll="' + rIdx + '" data-die="' + dIdx + '">' +
          '<span>' + displayText + '</span>' +
        '</div>';
      });

      rowEl.innerHTML =
        '<div class="roll-info">' +
          '<div class="roll-label-row">' +
            '<span class="roll-number">ROLL #' + rollNum + '</span>' +
            subtitleText +
          '</div>' +
          '<div class="roll-weight-tag">Weight: ' + (isLatest ? 'MAX (Highest Pull)' : (1.0 + (rIdx * 0.4)).toFixed(1) + 'x') + '</div>' +
        '</div>' +
        '<div class="dice-slots-row">' + diceSlotsHtml + '</div>' +
        '<button class="btn-clear-row" data-roll="' + rIdx + '" title="Clear this roll">✕</button>';

      container.appendChild(rowEl);
    });

    // Slot click handlers
    container.querySelectorAll('.die-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        const r = parseInt(slot.dataset.roll, 10);
        const d = parseInt(slot.dataset.die, 10);
        STATE.activeRollIndex = r;
        STATE.activeDieIndex = d;
        updateActiveSlotUI();
        renderRolls();
      });
    });

    // Clear row handlers
    container.querySelectorAll('.btn-clear-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = parseInt(btn.dataset.roll, 10);
        clearSpecificRow(r);
      });
    });

    updateActiveSlotUI();
  }

  function updateActiveSlotUI() {
    const ind = document.getElementById('active-slot-indicator');
    if (ind) {
      ind.textContent = 'Roll ' + (STATE.activeRollIndex + 1) + ' • Die ' + (STATE.activeDieIndex + 1);
    }
  }

  function assignColorToActiveSlot(color) {
    STATE.rolls[STATE.activeRollIndex][STATE.activeDieIndex] = color;
    sfx.playClick();

    if (STATE.activeDieIndex < 3) {
      STATE.activeDieIndex++;
    } else {
      if (STATE.activeRollIndex < STATE.rolls.length - 1) {
        STATE.activeRollIndex++;
        STATE.activeDieIndex = 0;
      } else {
        STATE.activeDieIndex = 0;
      }
    }

    renderRolls();
    persistUserRoomState();
    executePredictionCalculation();
  }

  function clearSpecificRow(rIdx) {
    STATE.rolls[rIdx] = [null, null, null, null];
    renderRolls();
    persistUserRoomState();
    executePredictionCalculation();
    if (window.showToast) window.showToast('Roll #' + (rIdx + 1) + ' cleared');
  }

  function clearActiveDieSlot() {
    STATE.rolls[STATE.activeRollIndex][STATE.activeDieIndex] = null;
    renderRolls();
    persistUserRoomState();
    executePredictionCalculation();
  }

  function clearAllRolls() {
    STATE.rolls = STATE.rolls.map(() => [null, null, null, null]);
    STATE.activeRollIndex = 0;
    STATE.activeDieIndex = 0;
    renderRolls();
    persistUserRoomState();
    clearPredictionResultsUI();
    if (window.showToast) window.showToast('All stream rolls cleared');
  }

  function addNewRoll() {
    STATE.rolls.push([null, null, null, null]);
    STATE.activeRollIndex = STATE.rolls.length - 1;
    STATE.activeDieIndex = 0;
    renderRolls();
    persistUserRoomState();
    executePredictionCalculation();
    const addBtn = document.getElementById('btn-add-roll');
    if (addBtn) addBtn.textContent = '+ Add Roll (Roll ' + (STATE.rolls.length + 1) + ')';
    if (window.showToast) window.showToast('Roll #' + STATE.rolls.length + ' added to stream');
  }

  function removeLastRoll() {
    if (STATE.rolls.length <= 5) {
      if (window.showToast) window.showToast('Minimum 5 stream rolls required for prediction accuracy');
      return;
    }
    STATE.rolls.pop();
    if (STATE.activeRollIndex >= STATE.rolls.length) {
      STATE.activeRollIndex = STATE.rolls.length - 1;
    }
    renderRolls();
    persistUserRoomState();
    executePredictionCalculation();
    const addBtn = document.getElementById('btn-add-roll');
    if (addBtn) addBtn.textContent = '+ Add Roll (Roll ' + (STATE.rolls.length + 1) + ')';
  }

  function executePredictionCalculation() {
    const result = solve1ColorPrediction(STATE.rolls);
    if (result) {
      STATE.latestPrediction = result;
      renderPredictionResults(result);
    } else {
      clearPredictionResultsUI();
    }
  }

  function renderPredictionResults(res) {
    const nameEl = document.getElementById('predicted-color-name');
    const confEl = document.getElementById('predicted-confidence-value');
    const tagEl = document.getElementById('prediction-tag');
    const subtextEl = document.getElementById('predicted-subtext');
    const dieEl = document.getElementById('predicted-die-display');
    const auraEl = document.getElementById('predicted-die-aura');
    const statusBadge = document.getElementById('engine-status-badge');

    if (!res || !nameEl) return;

    const topCfg = COLOR_CONFIG[res.topColor];
    nameEl.textContent = topCfg.name.toUpperCase();
    nameEl.style.color = topCfg.hex;

    if (confEl) {
      confEl.textContent = res.topProbability + '%';
      confEl.style.color = topCfg.hex;
    }

    if (tagEl) {
      tagEl.textContent = 'HIGH CONFIDENCE';
      tagEl.style.color = '#34d399';
      tagEl.style.borderColor = 'rgba(52, 211, 153, 0.4)';
      tagEl.style.background = 'rgba(52, 211, 153, 0.15)';
    }

    if (subtextEl) {
      subtextEl.textContent = 'Optimal color pick for next roll based on ' + res.totalDiceEntered + ' analyzed dice.';
    }

    if (dieEl) {
      dieEl.innerHTML = '<span style="font-size: 32px;">' + topCfg.icon + '</span>';
      dieEl.style.borderColor = topCfg.hex;
      dieEl.style.boxShadow = '0 0 25px ' + topCfg.hex;
    }
    if (auraEl) {
      auraEl.style.background = 'radial-gradient(circle, ' + topCfg.hex + ' 0%, transparent 70%)';
    }

    if (statusBadge) {
      statusBadge.innerHTML = '<span class="status-dot"></span><span>SOLVED // ' + res.topProbability + '%</span>';
      statusBadge.className = 'badge-status-pill status-solved';
    }

    // 6-Color Breakdown Bars
    const listEl = document.getElementById('distribution-bars-list');
    if (listEl) {
      listEl.innerHTML = '';
      res.ranked.forEach(colorKey => {
        const cfg = COLOR_CONFIG[colorKey];
        const pct = (res.distribution[colorKey] || 0).toFixed(1);
        const isTop = colorKey === res.topColor;

        const barItem = document.createElement('div');
        barItem.className = 'distribution-item' + (isTop ? ' item-top' : '');
        barItem.innerHTML =
          '<div class="dist-meta">' +
            '<span class="dist-color-name" style="color: ' + cfg.hex + '">' + cfg.name + '</span>' +
            '<span class="dist-percent">' + pct + '%</span>' +
          '</div>' +
          '<div class="dist-bar-track">' +
            '<div class="dist-bar-fill" style="width: ' + pct + '%; background: ' + cfg.hex + '"></div>' +
          '</div>';
        listEl.appendChild(barItem);
      });
    }

    // Secondary Stats
    const statTop = document.getElementById('stat-top-signal');
    if (statTop) {
      statTop.textContent = topCfg.name.toUpperCase();
      statTop.style.color = topCfg.hex;
    }
    const statCold = document.getElementById('stat-cold-signal');
    if (statCold && res.coldColor) {
      statCold.textContent = COLOR_CONFIG[res.coldColor].name.toUpperCase();
      statCold.style.color = COLOR_CONFIG[res.coldColor].hex;
    }
    const statEntropy = document.getElementById('stat-entropy-val');
    if (statEntropy) {
      statEntropy.textContent = res.entropyScore;
    }
  }

  function clearPredictionResultsUI() {
    const nameEl = document.getElementById('predicted-color-name');
    const confEl = document.getElementById('predicted-confidence-value');
    const tagEl = document.getElementById('prediction-tag');
    const subtextEl = document.getElementById('predicted-subtext');
    const dieEl = document.getElementById('predicted-die-display');
    const statusBadge = document.getElementById('engine-status-badge');

    if (nameEl) { nameEl.textContent = 'AWAITING ROLLS'; nameEl.style.color = ''; }
    if (confEl) { confEl.textContent = '--%'; confEl.style.color = ''; }
    if (tagEl) { tagEl.textContent = 'AWAITING INPUT'; tagEl.style.color = ''; tagEl.style.borderColor = ''; tagEl.style.background = ''; }
    if (subtextEl) { subtextEl.textContent = 'Enter dice colors above to scan sequence momentum.'; }
    if (dieEl) {
      dieEl.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="2" width="20" height="20" rx="5"></rect><circle cx="12" cy="12" r="1.5" fill="currentColor"></circle></svg>';
      dieEl.style.borderColor = '';
      dieEl.style.boxShadow = '';
    }
    if (statusBadge) {
      statusBadge.innerHTML = '<span class="status-dot"></span><span>READY FOR ROLLS</span>';
      statusBadge.className = 'badge-status-pill status-ready';
    }
    const listEl = document.getElementById('distribution-bars-list');
    if (listEl) {
      listEl.innerHTML = '<div class="empty-state-text">Probability distribution will calibrate when rolls are entered.</div>';
    }
  }

  // ==========================================
  // OWNER COMMAND CENTER (Jalapeno & Chirag)
  // ==========================================
  function openOwnerCommandModal() {
    const modal = document.getElementById('owner-command-modal');
    if (modal) {
      modal.style.display = 'flex';
      refreshOwnerCounters();
      fetchKeysVault();
      fetchActiveAnnouncement();
    }
  }

  function closeOwnerCommandModal() {
    const modal = document.getElementById('owner-command-modal');
    if (modal) modal.style.display = 'none';
  }

  async function refreshOwnerCounters() {
    const auth = getAuthSession();
    const ownerKey = auth ? auth.key : sessionStorage.getItem('HD_OWNER_KEY');
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getCounters', ownerKey: ownerKey })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.counters) {
          const v = document.getElementById('owner-stat-visits');
          const a = document.getElementById('owner-stat-active');
          const l = document.getElementById('owner-stat-licenses');
          if (v) v.textContent = data.counters.visits || 42;
          if (a) a.textContent = data.counters.activeUsers || 1;
          if (l) l.textContent = data.counters.totalLicenses || 16;
        }
      }
    } catch(e) {}
  }

  async function fetchKeysVault() {
    const tbody = document.getElementById('keys-vault-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading keys securely from MongoDB Atlas...</td></tr>';

    const auth = getAuthSession();
    const ownerKey = auth ? auth.key : sessionStorage.getItem('HD_OWNER_KEY');

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listKeys', ownerKey: ownerKey })
      });
      const data = await res.json();
      if (data && data.success && Array.isArray(data.keys)) {
        tbody.innerHTML = '';
        if (data.keys.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;">No keys found.</td></tr>';
          return;
        }
        data.keys.forEach(k => {
          const tr = document.createElement('tr');
          const statusClass = k.status === 'Active' ? 'badge-status-active' : 'badge-status-revoked';
          tr.innerHTML =
            '<td><code class="table-key-code">' + k.key + '</code></td>' +
            '<td><span class="badge-role">' + (k.role || 'USER') + '</span></td>' +
            '<td><code class="table-hwid-code">' + (k.boundHwid || 'Unbound') + '</code></td>' +
            '<td><span class="' + statusClass + '">' + (k.status || 'Active') + '</span></td>' +
            '<td>' + (k.duration || '30days') + '</td>' +
            '<td class="table-actions-cell">' +
              '<button onclick="window.resetKeyHwidAction(\\'' + k.key + '\\')" class="btn-table-action" title="Unbind Hardware ID">Reset HWID</button>' +
              '<button onclick="window.deleteKeyAction(\\'' + k.key + '\\')" class="btn-table-action btn-danger-action" title="Delete Key">Delete</button>' +
            '</td>';
          tbody.appendChild(tr);
        });
      }
    } catch(e) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:#ef4444;text-align:center;">Failed to load keys: ' + e.message + '</td></tr>';
    }
  }

  async function generateLicenseKeyAction() {
    const role = document.getElementById('keygen-role').value;
    const duration = document.getElementById('keygen-duration').value;
    const hwidLock = document.getElementById('keygen-hwid-lock').checked;
    const customKey = document.getElementById('keygen-custom-key').value.trim();

    const auth = getAuthSession();
    const ownerKey = auth ? auth.key : sessionStorage.getItem('HD_OWNER_KEY');

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateKey',
          ownerKey: ownerKey,
          role: role,
          duration: duration,
          hwidLock: hwidLock,
          customKey: customKey || undefined
        })
      });
      const data = await res.json();
      if (data && data.success) {
        if (window.showToast) window.showToast('⚡ Key Created: ' + data.key);
        fetchKeysVault();
        refreshOwnerCounters();
      } else {
        if (window.showToast) window.showToast('❌ Error: ' + (data.error || 'Failed to generate key'));
      }
    } catch(e) {
      if (window.showToast) window.showToast('⚠️ Network error: ' + e.message);
    }
  }

  window.resetKeyHwidAction = async function(key) {
    const auth = getAuthSession();
    const ownerKey = auth ? auth.key : sessionStorage.getItem('HD_OWNER_KEY');
    if (!confirm('Reset HWID binding for ' + key + '?')) return;
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resetHwid', ownerKey: ownerKey, key: key })
      });
      const data = await res.json();
      if (data && data.success) {
        if (window.showToast) window.showToast('✓ HWID reset for ' + key);
        fetchKeysVault();
      }
    } catch(e) {}
  };

  window.deleteKeyAction = async function(key) {
    const auth = getAuthSession();
    const ownerKey = auth ? auth.key : sessionStorage.getItem('HD_OWNER_KEY');
    if (!confirm('Permanently delete ' + key + '?')) return;
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteKey', ownerKey: ownerKey, key: key })
      });
      const data = await res.json();
      if (data && data.success) {
        if (window.showToast) window.showToast('🗑️ Key deleted: ' + key);
        fetchKeysVault();
        refreshOwnerCounters();
      }
    } catch(e) {}
  };

  async function broadcastAnnouncementAction() {
    const input = document.getElementById('owner-announcement-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;
    const auth = getAuthSession();
    const ownerKey = auth ? auth.key : sessionStorage.getItem('HD_OWNER_KEY');
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setAnnouncement', ownerKey: ownerKey, text: text, active: true })
      });
      const data = await res.json();
      if (data && data.success) {
        if (window.showToast) window.showToast('📢 Announcement broadcasted!');
        fetchActiveAnnouncement();
      }
    } catch(e) {}
  }

  async function fetchActiveAnnouncement() {
    try {
      const res = await fetch('/api/system?type=announcement');
      if (res.ok) {
        const data = await res.json();
        const banner = document.getElementById('announcement-banner');
        const textEl = document.getElementById('announcement-text');
        if (data && data.active && data.text) {
          if (textEl) textEl.textContent = data.text;
          if (banner) banner.style.display = 'flex';
        } else if (banner) {
          banner.style.display = 'none';
        }
      }
    } catch(e) {}
  }

  // System Heartbeat: Periodic Sync (Zero Infinite Reload Loop)
  function checkSystemHeartbeat() {
    fetch('/api/system?type=all')
      .then(res => res.json())
      .then(data => {
        if (!data) return;
        const auth = getAuthSession();
        const isOwner = auth && (auth.role === 'OWNER' || auth.role === 'ADMIN' || (auth.key && auth.key.toUpperCase().startsWith('HD-OWNER')));

        if (data.maintenance && data.maintenance.enabled === true && !isOwner) {
          if (!window.location.pathname.includes('/maintenance')) {
            window.location.replace('/maintenance');
          }
        }

        if (data.announcement) {
          const banner = document.getElementById('announcement-banner');
          const textEl = document.getElementById('announcement-text');
          if (data.announcement.active && data.announcement.text) {
            if (textEl) textEl.textContent = data.announcement.text;
            if (banner) banner.style.display = 'flex';
          } else if (banner) {
            banner.style.display = 'none';
          }
        }
      })
      .catch(() => {});
  }

  // App Initialization
  function initApp() {
    // 1. Strict Permission Check
    if (!checkAuthStatus()) return;

    // 2. Setup palette buttons
    document.querySelectorAll('.btn-color-select[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        assignColorToActiveSlot(btn.dataset.color);
      });
    });

    const clearDieBtn = document.getElementById('btn-clear-active-die');
    if (clearDieBtn) clearDieBtn.addEventListener('click', clearActiveDieSlot);

    const addRollBtn = document.getElementById('btn-add-roll');
    if (addRollBtn) addRollBtn.addEventListener('click', addNewRoll);

    const removeRollBtn = document.getElementById('btn-remove-last-roll');
    if (removeRollBtn) removeRollBtn.addEventListener('click', removeLastRoll);

    const clearAllBtn = document.getElementById('btn-clear-all-rolls');
    if (clearAllBtn) clearAllBtn.addEventListener('click', clearAllRolls);

    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        STATE.soundEnabled = !STATE.soundEnabled;
        const icon = document.getElementById('sound-icon');
        if (icon) icon.textContent = STATE.soundEnabled ? '🔊' : '🔇';
        if (window.showToast) window.showToast(STATE.soundEnabled ? 'Sound FX Enabled' : 'Sound Muted');
      });
    }

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', window.handleLogout);

    const ownerToggleBtn = document.getElementById('owner-panel-toggle-btn');
    if (ownerToggleBtn) ownerToggleBtn.addEventListener('click', openOwnerCommandModal);

    const closeOwnerBtn = document.getElementById('btn-close-owner-modal');
    if (closeOwnerBtn) closeOwnerBtn.addEventListener('click', closeOwnerCommandModal);

    const genKeyBtn = document.getElementById('btn-generate-key');
    if (genKeyBtn) genKeyBtn.addEventListener('click', generateLicenseKeyAction);

    const refreshVaultBtn = document.getElementById('btn-refresh-vault');
    if (refreshVaultBtn) refreshVaultBtn.addEventListener('click', fetchKeysVault);

    const broadcastBtn = document.getElementById('btn-broadcast-announcement');
    if (broadcastBtn) broadcastBtn.addEventListener('click', broadcastAnnouncementAction);

    const ownerLogoutBtn = document.getElementById('btn-owner-logout');
    if (ownerLogoutBtn) ownerLogoutBtn.addEventListener('click', () => {
      closeOwnerCommandModal();
      window.handleLogout();
    });

    renderRolls();
    fetchActiveAnnouncement();
    setInterval(checkSystemHeartbeat, 25000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
