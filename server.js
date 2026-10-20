const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
      source: 'Traced Demonstration Seed',
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
      source: 'Traced Oracle Core',
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
  if (!stats || !stats.colors) return null;
  const colorArray = Object.values(stats.colors);
  const sortedByCount = [...colorArray].sort((a, b) => a.count - b.count);
  const coldest = sortedByCount[0];
  const hottest = sortedByCount[sortedByCount.length - 1];

  const recentRolls = rolls.slice(-10);
  const recentCounts = { Red: 0, Orange: 0, Yellow: 0, Green: 0, Blue: 0, Purple: 0 };
  recentRolls.forEach(r => {
    (r.dice || []).forEach(d => {
      if (recentCounts.hasOwnProperty(d.name)) recentCounts[d.name]++;
    });
  });

  const recommendedName = coldest.name;
  const recommendedHex = coldest.hex;
  const count = coldest.count;
  const pct = coldest.percentage;
  const diffFromMean = (16.67 - pct).toFixed(1);

  return {
    color: recommendedName,
    hex: recommendedHex,
    strategy: 'COLD MEAN REVERSION',
    count,
    percentage: pct,
    diffFromMean,
    recentHits: recentCounts[recommendedName] || 0,
    hottestName: hottest.name,
    hottestPercentage: hottest.percentage,
    totalDice: stats.totalDiceAnalyzed,
    rationale: `<strong>${recommendedName}</strong> is currently lagging at <strong>${pct.toFixed(1)}%</strong> frequency (${diffFromMean}% below theoretical expected 16.67%), appearing ${count} times out of ${stats.totalDiceAnalyzed} dice. In the last 10 rolls, it hit only ${recentCounts[recommendedName] || 0} times. Contrasted with the hot leader <strong>${hottest.name}</strong> (${hottest.percentage.toFixed(1)}%).`
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
