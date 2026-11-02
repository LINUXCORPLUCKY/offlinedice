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

// Explicit Static Asset Handlers (Guaranteed Content-Type)
app.get('/style.css', (req, res) => res.type('text/css').sendFile(path.join(__dirname, 'style.css')));
app.get('/assets/style.css', (req, res) => res.type('text/css').sendFile(path.join(__dirname, 'assets', 'style.css')));
app.get('/assets/app.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'assets', 'app.js')));
app.get('/assets/login.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'assets', 'login.js')));
app.get('/assets/logo.png', (req, res) => res.type('image/png').sendFile(path.join(__dirname, 'assets', 'logo.png')));
app.get('/assets/headless_dice_logo.png', (req, res) => res.type('image/png').sendFile(path.join(__dirname, 'assets', 'headless_dice_logo.png')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

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

// Page Routes
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'app.html')));
app.get('/room/*', (req, res) => res.sendFile(path.join(__dirname, 'app.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'app.html')));
app.get('/owner', (req, res) => res.sendFile(path.join(__dirname, 'owner-panel.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'owner-panel.html')));
app.get('/maintenance', (req, res) => res.sendFile(path.join(__dirname, 'maintenance.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// Catch-All Route Router
app.use((req, res) => {
  const reqUrl = (req.originalUrl || req.url || '').split('?')[0];
  if (reqUrl.startsWith('/assets/') || reqUrl === '/style.css') {
    return res.status(404).end();
  }
  if (reqUrl === '/login') return res.sendFile(path.join(__dirname, 'login.html'));
  if (reqUrl.startsWith('/room') || reqUrl === '/app') return res.sendFile(path.join(__dirname, 'app.html'));
  if (reqUrl === '/owner' || reqUrl === '/admin') return res.sendFile(path.join(__dirname, 'owner-panel.html'));
  if (reqUrl === '/maintenance') return res.sendFile(path.join(__dirname, 'maintenance.html'));
  return res.sendFile(path.join(__dirname, 'login.html'));
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Headless Dice server running on port ${PORT}`));
}
