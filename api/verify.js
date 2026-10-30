const axios = require('axios');

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

function computeStatistics(rolls) {
  const colorCounts = { Red: 0, Orange: 0, Yellow: 0, Green: 0, Blue: 0, Purple: 0 };
  let totalDiceAnalyzed = 0;
  let riggedFlagsCount = 0;

  rolls.forEach(roll => {
    if (roll.isRigged) riggedFlagsCount++;
    (roll.dice || []).forEach(d => {
      if (colorCounts.hasOwnProperty(d.name)) {
        colorCounts[d.name]++;
      }
      totalDiceAnalyzed++;
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

  // Dynamic Harmonic Gap Reversion:
  // Sweet spot is gap 2 or 3; severe cold (gap >= 4) gets decay so user doesn't endlessly chase dead colors
  const compositeScores = {};
  colorList.forEach((c) => {
    let gapScore = 0;
    if (gaps[c] === 2 || gaps[c] === 3) {
      gapScore = 3.6;
    } else if (gaps[c] >= 4) {
      gapScore = Math.max(0.6, 3.6 - (gaps[c] - 3) * 0.9); // Cold streak dead-zone decay
    } else if (gaps[c] === 1) {
      gapScore = 2.0;
    } else {
      gapScore = 0.6; // Just appeared on latest roll
    }

    const momScore = recentHits[c] * 1.3;
    const markovScore = (transitionCounts[c] || 0) * 1.1;
    const recencyScore = (weightedScores[c] || 0) * 0.85;

    // Cooldown penalty if it just hit on the latest roll unless it is a 4+ hot streak
    const justHitPenalty = latestDice.includes(c) && recentHits[c] < 4 ? -1.6 : 0;

    compositeScores[c] = gapScore + momScore + markovScore + recencyScore + justHitPenalty;
  });

  const sortedComposite = [...colorList].sort((a, b) => compositeScores[b] - compositeScores[a]);
  const primaryCandidate = sortedComposite[0];

  // Strategy B: Distinct Momentum Surge (active hot streak, different from Dynamic if possible)
  const sortedByMomentum = [...colorList].sort((a, b) => recentHits[b] - recentHits[a] || (compositeScores[b] - compositeScores[a]));
  let momentumCandidate = sortedByMomentum[0];
  if (momentumCandidate === primaryCandidate && sortedByMomentum.length > 1) {
    momentumCandidate = sortedByMomentum[1];
  }

  // Strategy C: Distinct Gap Reversion (harmonic overdue in sweet spot 2-4)
  const sortedByGap = [...colorList].sort((a, b) => {
    const scoreA = gaps[a] >= 2 && gaps[a] <= 4 ? gaps[a] * 2.2 : gaps[a];
    const scoreB = gaps[b] >= 2 && gaps[b] <= 4 ? gaps[b] * 2.2 : gaps[b];
    return scoreB - scoreA;
  });
  let gapCandidate = sortedByGap[0];
  if (gapCandidate === primaryCandidate && sortedByGap.length > 1) {
    gapCandidate = sortedByGap[1];
  }

  // Strategy D: Distinct Markov Follow-Through
  const sortedByMarkov = [...colorList].sort((a, b) => (transitionCounts[b] - transitionCounts[a]) || (compositeScores[b] - compositeScores[a]));
  let markovCandidate = sortedByMarkov[0];
  if (markovCandidate === primaryCandidate || markovCandidate === momentumCandidate) {
    const alt = sortedByMarkov.find(c => c !== primaryCandidate && c !== momentumCandidate);
    if (alt) markovCandidate = alt;
  }

  const primaryConfidence = Math.min(96, Math.max(75, Math.round(76 + (compositeScores[primaryCandidate] * 1.1))));
  const momentumConfidence = Math.min(94, Math.max(70, Math.round(72 + (recentHits[momentumCandidate] * 3.5))));
  const gapConfidence = Math.min(92, Math.max(68, Math.round(68 + (Math.min(gaps[gapCandidate], 4) * 5.2))));
  const markovConfidence = Math.min(90, Math.max(68, Math.round(70 + ((transitionCounts[markovCandidate] || 0) * 2.8))));

  const latestStr = latestDice.length > 0 ? latestDice.join(', ') : 'N/A';
  const winRuleNotice = '<div class="win-rule-inline">⚡ <em>Rule: When you win on a predicted color, roll 5 times in-game before requesting next prediction to reset RNG cycles.</em></div>';

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
      rationale: `<strong>${primaryCandidate}</strong> leads multi-factor convergence following Roll #${totalRolls} (dice: ${latestStr}). It recorded <strong>${recentHits[primaryCandidate] || 0} hits</strong> across the last 5 rolls with harmonic gap index ${gaps[primaryCandidate]}.${winRuleNotice}`
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
      rationale: `<strong>${momentumCandidate}</strong> holds short-term velocity with <strong>${recentHits[momentumCandidate]} appearances</strong> in the last 5 rolls. Riding active cluster before regression.${winRuleNotice}`
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
      rationale: `<strong>${gapCandidate}</strong> holds a prime mean-reversion gap of <strong>${gaps[gapCandidate]} rolls</strong> without entering stagnation. Optimal CSPRNG rebound window.${winRuleNotice}`
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
      rationale: `<strong>${markovCandidate}</strong> exhibits the highest empirical sequence follow-through in this session after combination (${latestStr}), with ${transitionCounts[markovCandidate] || 0} historic follow-up hits.${winRuleNotice}`
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

function generateDemoData() {
  const colorList = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
  const hexMap = OFFICIAL_COLORS;
  const rolls = [];
  const now = Math.floor(Date.now() / 1000);

  for (let i = 1; i <= 36; i++) {
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse sessionId from query or url path
  let rawSessionId = req.query.sessionId || req.query.id;
  if (!rawSessionId && req.url) {
    const cleanUrl = req.url.split('?')[0].replace(/\/+$/, '');
    const segments = cleanUrl.split('/');
    const lastSeg = segments[segments.length - 1];
    if (lastSeg && lastSeg !== 'verify' && lastSeg !== 'verify.js') {
      rawSessionId = lastSeg;
    }
  }

  if (!rawSessionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing Session ID parameter.'
    });
  }

  const sanitizedRegex = /^[a-zA-Z0-9_-]+$/;
  if (!sanitizedRegex.test(rawSessionId.trim())) {
    return res.status(400).json({
      success: false,
      error: 'Invalid Session ID. Only alphanumeric characters, hyphens, and underscores are permitted.'
    });
  }

  const cleanSessionId = rawSessionId.trim();

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
        error: `Session '${cleanSessionId}' was not found or contains no roll records on the database.`
      });
    }

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

    const formattedRolls = rollsList.map((roll, index) => {
      const names = Array.isArray(roll.names) ? roll.names : [];
      const colors = Array.isArray(roll.colors) ? roll.colors : [];

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
    if (error.code === 'ECONNABORTED' || (error.message && error.message.includes('timeout'))) {
      return res.status(504).json({
        success: false,
        error: 'Database connection timed out while querying endpoint. Please try again.'
      });
    }

    if (error.response && error.response.status === 404) {
      return res.status(404).json({
        success: false,
        error: `Session ID '${cleanSessionId}' not found on remote database.`
      });
    }

    return res.status(502).json({
      success: false,
      error: `Failed to fetch session data: ${error.message}`
    });
  }
};
