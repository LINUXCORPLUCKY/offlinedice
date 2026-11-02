// Secure Serverless System API (Maintenance, Announcements, Remote Control)
// High-Speed Autonomous Serverless State Handler with MongoDB Atlas Cloud Sync

const fs = require('fs');
const path = require('path');
const { getSystemState: getAtlasSystemState } = require('../lib/system_manager');

const STATIC_SYSTEM_TIMESTAMP = 1730538000000;

async function getSystemState() {
  try {
    const atlasState = await getAtlasSystemState();
    if (atlasState && atlasState.maintenance) {
      if (!atlasState.control) atlasState.control = { timestamp: STATIC_SYSTEM_TIMESTAMP };
      return atlasState;
    }
  } catch(e) {}

  try {
    const sysPath = path.join(__dirname, '_data', 'system_state.json');
    if (fs.existsSync(sysPath)) {
      const data = JSON.parse(fs.readFileSync(sysPath, 'utf8'));
      if (!data.control || !data.control.timestamp) {
        data.control = { timestamp: STATIC_SYSTEM_TIMESTAMP };
      }
      return data;
    }
    const fallbackPath = path.join(__dirname, 'data', 'system_state.json');
    if (fs.existsSync(fallbackPath)) {
      const data = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      if (!data.control || !data.control.timestamp) {
        data.control = { timestamp: STATIC_SYSTEM_TIMESTAMP };
      }
      return data;
    }
  } catch(e) {}

  return {
    maintenance: { enabled: false },
    announcement: {
      active: true,
      text: "⚡ HEADLESS DICE // 5s RAPID PATTERN SCANNER ONLINE",
      timestamp: STATIC_SYSTEM_TIMESTAMP
    },
    control: {
      timestamp: STATIC_SYSTEM_TIMESTAMP
    }
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const queryType = req.query ? req.query.type : null;
  const state = await getSystemState();

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');

  if (queryType === 'maintenance') {
    return res.end(JSON.stringify(state.maintenance || { enabled: false }));
  }
  if (queryType === 'announcement') {
    return res.end(JSON.stringify(state.announcement || { active: false, text: '' }));
  }
  if (queryType === 'control') {
    return res.end(JSON.stringify(state.control || { timestamp: STATIC_SYSTEM_TIMESTAMP }));
  }

  return res.end(JSON.stringify(state));
};
