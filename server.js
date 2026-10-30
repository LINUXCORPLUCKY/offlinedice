const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication & Panel API
const authHandler = require('./api/auth');
app.all(['/api/auth', '/api/auth/*'], (req, res) => authHandler(req, res));

// Verification & Isolated Rooms API (Strict Backend Authenticated)
const verifyHandler = require('./api/verify');
app.all(['/api/verify', '/api/verify/*'], (req, res) => verifyHandler(req, res));

// Standard official color definitions
const OFFICIAL_COLORS = {
  Red: '#FF0000',
  Orange: '#FFA500',
  Yellow: '#FFD700',
  Green: '#008000',
  Blue: '#0000FF',
  Purple: '#800080'
};

const COLOR_NAME_MAP = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  violet: 'Purple'
};

const COLOR_HEX_MAP = {
  '#ff0000': 'Red',
  '#ffa500': 'Orange',
  '#ffd700': 'Yellow',
  '#008000': 'Green',
  '#00ff00': 'Green',
  '#0000ff': 'Blue',
  '#800080': 'Purple',
  '#a020f0': 'Purple'
};

// Match input to canonical color name
function normalizeColor(name, hex) {
  if (name && typeof name === 'string') {
    const clean = name.trim().toLowerCase();
    if (COLOR_NAME_MAP[clean]) return COLOR_NAME_MAP[clean];
  }
  if (hex && typeof hex === 'string') {
    const cleanHex = hex.trim().toLowerCase();
    if (COLOR_HEX_MAP[cleanHex]) return COLOR_HEX_MAP[cleanHex];
  }
  return name || 'Unknown';
}

app.get(['/', '/login', '/login.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/room', '/room.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

app.get([
  '/jhvbuihedfbyhibrt5gi-owner-j42n5jhn',
  '/jhvbuihedfbyhibrt5gi-owner-j42n5jhn/',
  '/jhvbuihedfbyhibrt5gi-owner-j42n5jhn.html'
], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'jhvbuihedfbyhibrt5gi-owner-j42n5jhn.html'));
});

// Verification & Audit API endpoint
app.get([
  '/api/verify/:sessionId',
  '/public/api/verify/:sessionId',
  '/api/verify',
  '/public/api/verify'
], async (req, res) => {
  const rawSessionId = req.params.sessionId || req.query.sessionId || req.query.id;
  const sessionId = rawSessionId;

  // Input sanitization: alphanumeric, hyphens, and underscores only
  const sanitizedRegex = /^[a-zA-Z0-9_-]+$/;
  if (!sessionId || !sanitizedRegex.test(sessionId.trim())) {
    return res.status(400).json({
      success: false,
      error: 'Invalid Session ID. Only alphanumeric characters, hyphens, and underscores are permitted.'
    });
  }

  const cleanSessionId = sessionId.trim();

  // Demo fallback for instant offline testing if requested
  if (cleanSessionId.toLowerCase() === 'demo') {
    const demoRolls = generateDemoData();
    const stats = computeStatistics(demoRolls);
    const suggestedPick = computeSuggestedPick(stats, demoRolls);
    return res.json({
      success: true,
      sessionId: cleanSessionId,
      source: 'Headless Dice Demonstration Seed',
      totalRolls: demoRolls.length,
      stats,
      suggestedPick,
      rolls: demoRolls
    });
  }

  const endpoint = `https://offline-dice-verify-default-rtdb.europe-west1.firebasedatabase.app/sessions/${cleanSessionId}/rolls.json`;

  try {
    const response = await axios.get(endpoint, {
      timeout: 8000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'OfflineDice-Verifier/1.0'
      }
    });

    const rawData = response.data;

    if (!rawData) {
      return res.status(404).json({
        success: false,
        error: `Session '${cleanSessionId}' was not found or contains no roll records on the Firebase Realtime Database.`
      });
    }

    // Firebase RTDB can store arrays or key-value dictionary of rolls
    let rollsList = [];
    if (Array.isArray(rawData)) {
      rollsList = rawData.filter(item => item !== null && typeof item === 'object');
    } else if (typeof rawData === 'object') {
      rollsList = Object.entries(rawData).map(([key, val]) => ({
        id: key,
        ...val
      }));
    }

    if (rollsList.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Session '${cleanSessionId}' exists but has 0 valid roll entries.`
      });
    }

    // Standardize roll schema
    const formattedRolls = rollsList.map((roll, index) => {
      const names = Array.isArray(roll.names) ? roll.names : [];
      const colors = Array.isArray(roll.colors) ? roll.colors : [];

      // Reconcile dice pairs
      const dice = names.map((name, i) => {
        const canonical = normalizeColor(name, colors[i]);
        return {
          name: canonical,
          hex: OFFICIAL_COLORS[canonical] || colors[i] || '#888888'
        };
      });

      return {
        rollNumber: index + 1,
        hash: roll.hash || 'N/A',
        time: roll.time || null,
        isRigged: Boolean(roll.isRigged),
        names,
        colors,
        dice
      };
    });

    // Compute comprehensive statistical breakdown
    const stats = computeStatistics(formattedRolls);
    const suggestedPick = computeSuggestedPick(stats, formattedRolls);

    return res.json({
      success: true,
      sessionId: cleanSessionId,
      source: 'Headless Dice Oracle Core',
      totalRolls: formattedRolls.length,
      stats,
      suggestedPick,
      rolls: formattedRolls
    });

  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: 'Database connection timed out while querying Firebase RTDB endpoint. Please try again.'
      });
    }

    if (error.response && error.response.status === 404) {
      return res.status(404).json({
        success: false,
        error: `Session ID '${cleanSessionId}' not found on remote database.`
      });
    }

    console.error(`[Error Fetching Session ${cleanSessionId}]:`, error.message);
    return res.status(502).json({
      success: false,
      error: `Failed to fetch session data: ${error.message}`
    });
  }
});

// Helper: Statistical computation engine
function computeStatistics(rolls) {
  const colorCounts = {
    Red: 0,
    Orange: 0,
    Yellow: 0,
    Green: 0,
    Blue: 0,
    Purple: 0
  };

  let totalDiceAnalyzed = 0;
  let riggedFlagsCount = 0;

  rolls.forEach(roll => {
    if (roll.isRigged) riggedFlagsCount++;
    roll.dice.forEach(d => {
      if (colorCounts.hasOwnProperty(d.name)) {
        colorCounts[d.name]++;
        totalDiceAnalyzed++;
      } else {
        totalDiceAnalyzed++;
      }
    });
  });

  const colorStats = {};
  const expectedPercentage = 16.6667;

  Object.keys(OFFICIAL_COLORS).forEach(color => {
    const count = colorCounts[color] || 0;
    const percentage = totalDiceAnalyzed > 0 
      ? Number(((count / totalDiceAnalyzed) * 100).toFixed(2)) 
      : 0;
    const deviation = Number((percentage - expectedPercentage).toFixed(2));

    colorStats[color] = {
      name: color,
      hex: OFFICIAL_COLORS[color],
      count,
      percentage,
      deviation
    };
  });

  // Calculate coldest (least frequent) and hottest (most frequent)
  const sortedColors = Object.values(colorStats).sort((a, b) => a.count - b.count);
  const coldest = sortedColors[0] || null;
  const hottest = sortedColors[sortedColors.length - 1] || null;

  return {
    totalRolls: rolls.length,
    totalDiceAnalyzed,
    riggedFlagsCount,
    allFair: riggedFlagsCount === 0,
    expectedPerColorPct: 16.67,
    colors: colorStats,
    coldest,
    hottest
  };
}

// Helper: Statistical analysis for suggested pick
function computeSuggestedPick(stats, rolls) {
  if (!stats || !stats.colors || !rolls || rolls.length === 0) return null;

  const colorList = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
  const hexMap = OFFICIAL_COLORS;
  const totalRolls = rolls.length;
  const latestRoll = rolls[totalRolls - 1] || {};
  const latestDice = (latestRoll.dice || []).map(d => d.name);

  // 1. Recency Gap: rolls since last appearance
  const gaps = {};
  colorList.forEach(c => {
    let gap = 0;
    for (let i = totalRolls - 1; i >= 0; i--) {
      const hasColor = (rolls[i].dice || []).some(d => d.name === c);
      if (hasColor) break;
      gap++;
    }
    gaps[c] = gap;
  });

  // 2. Short-Term Momentum: last 5 rolls
  const recentWindow = rolls.slice(-5);
  const recentHits = {};
  colorList.forEach(c => { recentHits[c] = 0; });
  recentWindow.forEach(r => {
    (r.dice || []).forEach(d => {
      if (recentHits[d.name] !== undefined) recentHits[d.name]++;
    });
  });

  // 3. Markov State Transitions: what follows latestRoll's dice?
  const transitionCounts = {};
  colorList.forEach(c => { transitionCounts[c] = 0; });
  if (latestDice.length > 0 && totalRolls > 1) {
    const latestSet = new Set(latestDice);
    for (let i = 0; i < totalRolls - 1; i++) {
      const currDice = (rolls[i].dice || []).map(d => d.name);
      const nextDice = (rolls[i + 1].dice || []).map(d => d.name);
      currDice.forEach(cd => {
        if (latestSet.has(cd)) {
          nextDice.forEach(nd => {
            if (transitionCounts[nd] !== undefined) transitionCounts[nd]++;
          });
        }
      });
    }
  }

  // 4. Exponential Recency Weighting (last 10 rolls)
  const weightedScores = {};
  colorList.forEach(c => { weightedScores[c] = 0; });
  rolls.slice(-10).forEach((r, idx, arr) => {
    const weight = Math.pow(0.85, arr.length - 1 - idx);
    (r.dice || []).forEach(d => {
      if (weightedScores[d.name] !== undefined) weightedScores[d.name] += weight;
    });
  });

  // Strategy A: Gap Reversion (overdue rebound)
  const sortedByGap = [...colorList].sort((a, b) => gaps[b] - gaps[a] || (stats.colors[a]?.count - stats.colors[b]?.count));
  const gapCandidate = sortedByGap[0];

  // Strategy B: Momentum Surge (active hot streak)
  const sortedByMomentum = [...colorList].sort((a, b) => recentHits[b] - recentHits[a] || (stats.colors[b]?.count - stats.colors[a]?.count));
  const momentumCandidate = sortedByMomentum[0];

  // Strategy C: Markov Follow-Through
  const sortedByMarkov = [...colorList].sort((a, b) => transitionCounts[b] - transitionCounts[a] || (recentHits[b] - recentHits[a]));
  const markovCandidate = sortedByMarkov[0];

  // Strategy D: Composite Dynamic AI Pick
  const compositeScores = {};
  colorList.forEach(c => {
    const gapScore = gaps[c] >= 2 ? Math.min(gaps[c] * 2.2, 7.0) : (recentHits[c] >= 3 ? 2.5 : 0.5);
    const momScore = recentHits[c] * 1.3;
    const markovScore = (transitionCounts[c] || 0) * 1.1;
    const recencyScore = (weightedScores[c] || 0) * 0.8;
    compositeScores[c] = gapScore + momScore + markovScore + recencyScore;
  });

  const sortedComposite = [...colorList].sort((a, b) => compositeScores[b] - compositeScores[a]);
  const primaryCandidate = sortedComposite[0];

  const primaryConfidence = Math.min(96, Math.max(74, Math.round(76 + (compositeScores[primaryCandidate] * 1.2))));
  const momentumConfidence = Math.min(94, Math.max(70, Math.round(70 + (recentHits[momentumCandidate] * 3.8))));
  const gapConfidence = Math.min(92, Math.max(68, Math.round(66 + (gaps[gapCandidate] * 5.5))));
  const markovConfidence = Math.min(90, Math.max(68, Math.round(68 + ((transitionCounts[markovCandidate] || 0) * 3))));

  const latestStr = latestDice.length > 0 ? latestDice.join(', ') : 'N/A';

  const strategies = [
    {
      id: 'dynamic',
      name: 'Dynamic AI',
      color: primaryCandidate,
      hex: hexMap[primaryCandidate],
      strategy: 'DYNAMIC CONVERGENCE',
      confidence: primaryConfidence,
      recentHits: recentHits[primaryCandidate] || 0,
      gap: gaps[primaryCandidate],
      rationale: `<strong>${primaryCandidate}</strong> leads all probabilistic indicators for next round with strong multi-factor momentum following Roll #${totalRolls} (dice: ${latestStr}). It recorded <strong>${recentHits[primaryCandidate] || 0} hits</strong> across the last 5 rolls and holds a gap index of ${gaps[primaryCandidate]}.`
    },
    {
      id: 'momentum',
      name: 'Momentum Surge',
      color: momentumCandidate,
      hex: hexMap[momentumCandidate],
      strategy: 'MOMENTUM SURGE',
      confidence: momentumConfidence,
      recentHits: recentHits[momentumCandidate],
      gap: gaps[momentumCandidate],
      rationale: `<strong>${momentumCandidate}</strong> is on an active hot cluster with <strong>${recentHits[momentumCandidate]} appearances</strong> in the last 5 rolls. Riding short-term velocity trends before statistical regression sets in.`
    },
    {
      id: 'reversion',
      name: 'Gap Reversion',
      color: gapCandidate,
      hex: hexMap[gapCandidate],
      strategy: 'GAP REVERSION',
      confidence: gapConfidence,
      recentHits: recentHits[gapCandidate] || 0,
      gap: gaps[gapCandidate],
      rationale: `<strong>${gapCandidate}</strong> has missed <strong>${gaps[gapCandidate]} consecutive rolls</strong>. Under 4-dice CSPRNG distributions, extended consecutive absence triggers high-probability mean reversion.`
    },
    {
      id: 'markov',
      name: 'Markov Transition',
      color: markovCandidate,
      hex: hexMap[markovCandidate],
      strategy: 'MARKOV TRANSITION',
      confidence: markovConfidence,
      recentHits: recentHits[markovCandidate] || 0,
      gap: gaps[markovCandidate],
      rationale: `<strong>${markovCandidate}</strong> exhibits the highest empirical transition affinity in this session following the exact combination of Roll #${totalRolls} (${latestStr}), with ${transitionCounts[markovCandidate] || 0} historic follow-up hits.`
    }
  ];

  return {
    color: primaryCandidate,
    hex: hexMap[primaryCandidate],
    strategy: 'DYNAMIC CONVERGENCE',
    confidence: primaryConfidence,
    count: stats.colors[primaryCandidate]?.count || 0,
    percentage: stats.colors[primaryCandidate]?.percentage || 0,
    recentHits: recentHits[primaryCandidate] || 0,
    gap: gaps[primaryCandidate],
    totalDice: stats.totalDiceAnalyzed,
    rationale: strategies[0].rationale,
    strategies,
    allCandidates: sortedComposite.map(c => ({
      name: c,
      hex: hexMap[c],
      score: Number(compositeScores[c].toFixed(1)),
      recentHits: recentHits[c],
      gap: gaps[c]
    }))
  };
}

// Mock seed generator for instant test validation
function generateDemoData() {
  const colorList = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
  const hexMap = OFFICIAL_COLORS;
  const rolls = [];
  const now = Math.floor(Date.now() / 1000);

  for (let i = 1; i <= 36; i++) {
    // 4 dice per roll
    const names = [];
    const colors = [];
    const dice = [];
    for (let d = 0; d < 4; d++) {
      const selected = colorList[Math.floor(Math.random() * colorList.length)];
      names.push(selected);
      colors.push(hexMap[selected]);
      dice.push({ name: selected, hex: hexMap[selected] });
    }

    rolls.push({
      rollNumber: i,
      hash: '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      time: now - (36 - i) * 60,
      isRigged: false,
      names,
      colors,
      dice
    });
  }

  return rolls;
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Offline Dice Verifier Server running on http://localhost:${PORT}]`);
  });
}

module.exports = app;
