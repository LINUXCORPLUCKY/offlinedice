// Secure Serverless System API (Maintenance, Announcements, Remote Control)
// High-Speed Autonomous Serverless State Handler

const fs = require('fs');
const path = require('path');

function getSystemState() {
  try {
    const sysPath = path.join(__dirname, '_data', 'system_state.json');
    if (fs.existsSync(sysPath)) {
      return JSON.parse(fs.readFileSync(sysPath, 'utf8'));
    }
    const fallbackPath = path.join(__dirname, 'data', 'system_state.json');
    if (fs.existsSync(fallbackPath)) {
      return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    }
  } catch(e) {}
  return {
    maintenance: { enabled: false },
    announcement: {
      active: true,
      text: "🎃 HEADLESS DICE // 10s RAPID SCANNER ONLINE",
      timestamp: Date.now()
    },
    control: {
      timestamp: Date.now()
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
  const state = getSystemState();

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');

  if (queryType === 'maintenance') {
    return res.end(JSON.stringify(state.maintenance || { enabled: false }));
  }
  if (queryType === 'announcement') {
    return res.end(JSON.stringify(state.announcement || { active: false, text: '' }));
  }
  if (queryType === 'control') {
    return res.end(JSON.stringify(state.control || { timestamp: Date.now() }));
  }

  return res.end(JSON.stringify(state));
};
