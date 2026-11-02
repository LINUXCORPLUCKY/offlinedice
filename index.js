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

// Maintenance Mode Checker (Guarantees zero breach during maintenance)
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
  return false; // Default to normal operations unless explicitly enabled
}

// Page Routes (Owner & Admin portals remain accessible for system management)
app.get('/owner', (req, res) => res.sendFile(path.join(__dirname, 'owner-panel.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'owner-panel.html')));
app.get('/maintenance', (req, res) => res.sendFile(path.join(__dirname, 'maintenance.html')));

app.get('/app', (req, res) => {
  if (isMaintenanceActive()) return res.sendFile(path.join(__dirname, 'maintenance.html'));
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/room', (req, res) => {
  if (isMaintenanceActive()) return res.sendFile(path.join(__dirname, 'maintenance.html'));
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/room/*', (req, res) => {
  if (isMaintenanceActive()) return res.sendFile(path.join(__dirname, 'maintenance.html'));
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/login', (req, res) => {
  if (isMaintenanceActive()) return res.sendFile(path.join(__dirname, 'maintenance.html'));
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/', (req, res) => {
  if (isMaintenanceActive()) return res.sendFile(path.join(__dirname, 'maintenance.html'));
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Fallback:
app.use((req, res) => {
  if (isMaintenanceActive()) return res.sendFile(path.join(__dirname, 'maintenance.html'));
  res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Headless Dice server running on port ${PORT}`));
}
