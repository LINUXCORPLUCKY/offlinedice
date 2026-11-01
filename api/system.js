// Secure Serverless System API (Maintenance, Announcements, Remote Control)
// Zero Firebase dependency — works directly on Vercel or bridges to private VPS Discord bot

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DISCORD_VPS_URL = process.env.DISCORD_VPS_URL || '';

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

  const queryType = (req.query && req.query.type) || (new URL(req.url, 'http://localhost').searchParams.get('type')) || '';

  // Bridge to VPS if configured
  if (DISCORD_VPS_URL) {
    try {
      const vpsRes = await new Promise((resolve, reject) => {
        const parsed = new URL(DISCORD_VPS_URL + (queryType ? `/api/system/${queryType}` : '/health'));
        const client = parsed.protocol === 'https:' ? https : http;
        const vReq = client.request({
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'GET',
          timeout: 2500
        }, vRes => {
          let b = '';
          vRes.on('data', c => b += c);
          vRes.on('end', () => {
            try { resolve(JSON.parse(b)); } catch(e) { resolve(null); }
          });
        });
        vReq.on('error', reject);
        vReq.on('timeout', () => { vReq.destroy(); reject(new Error('VPS timeout')); });
        vReq.end();
      });

      if (vpsRes) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(vpsRes));
      }
    } catch(err) {
      // Fallback to local state
    }
  }

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

