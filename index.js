// Headless Dice — Production Express.js Application for Vercel
// Framework preset: Express.js
// Handles Serverless Functions, Static Assets, and Page Routing

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Anti-caching headers on all responses to prevent CDN stale data
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve assets folder statically
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));

// API Handlers
const verifyHandler = require('./api/verify');
const systemHandler = require('./api/system');
const webhookHandler = require('./api/webhook');
const adminHandler = require('./api/admin');

app.all('/api/verify', (req, res) => verifyHandler(req, res));
app.all('/api/admin', (req, res) => adminHandler(req, res));
app.all('/api/system', (req, res) => systemHandler(req, res));
app.all('/api/webhook', (req, res) => webhookHandler(req, res));
app.all('/api/webhook/log', (req, res) => webhookHandler(req, res));

// Maintenance Mode Checker
function isMaintenanceActive() {
  try {
    const sysPath = path.join(__dirname, 'api', '_data', 'system_state.json');
    if (fs.existsSync(sysPath)) {
      const state = JSON.parse(fs.readFileSync(sysPath, 'utf8'));
      if (state && state.maintenance && typeof state.maintenance.enabled === 'boolean') {
        return state.maintenance.enabled;
      }
    }
  } catch(e) {}
  return false;
}

// Universal Path Handler (Works regardless of Vercel rewrite headers)
app.use((req, res, next) => {
  const reqUrl = (req.originalUrl || req.url || '').split('?')[0];

  if (reqUrl === '/login') {
    if (isMaintenanceActive()) return res.sendFile(path.join(__dirname, 'maintenance.html'));
    return res.sendFile(path.join(__dirname, 'login.html'));
  }

  if (reqUrl.startsWith('/room') || reqUrl === '/app') {
    if (isMaintenanceActive()) return res.sendFile(path.join(__dirname, 'maintenance.html'));
    return res.sendFile(path.join(__dirname, 'app.html'));
  }

  if (reqUrl === '/owner' || reqUrl === '/admin') {
    return res.sendFile(path.join(__dirname, 'owner-panel.html'));
  }

  if (reqUrl === '/maintenance') {
    return res.sendFile(path.join(__dirname, 'maintenance.html'));
  }

  if (reqUrl.startsWith('/api/')) {
    return next();
  }

  // Root or other pages
  if (isMaintenanceActive()) return res.sendFile(path.join(__dirname, 'maintenance.html'));
  return res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Headless Dice server running on port ${PORT}`));
}
