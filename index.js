// Headless Dice — Universal Vercel Entrypoint & Static Dispatcher
// Works seamlessly in both Vercel Static Mode and Vercel Node.js Serverless Function Mode

const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function callApi(mod, req, res) {
  const fn = typeof mod === 'function' ? mod : (mod && typeof mod.default === 'function' ? mod.default : null);
  if (typeof fn === 'function') {
    return fn(req, res);
  }
  throw new Error('API handler is not a callable function');
}

module.exports = (req, res) => {
  try {
    let reqPath = (req.url || '/').split('?')[0];

    // Delegate API routes if hit directly
    if (reqPath === '/api/verify' || reqPath.startsWith('/api/verify')) {
      try {
        return callApi(require('./api/verify'), req, res);
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: false, error: e.message }));
      }
    }

    if (reqPath === '/api/admin' || reqPath.startsWith('/api/admin')) {
      try {
        return callApi(require('./api/admin'), req, res);
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: false, error: e.message }));
      }
    }

    if (reqPath === '/api/webhook' || reqPath === '/api/webhook/log' || reqPath.startsWith('/api/webhook')) {
      try {
        return callApi(require('./api/webhook'), req, res);
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: false, error: e.message }));
      }
    }

    // Explicit Route Handling for Dedicated Room & App
    if (reqPath === '/app' || reqPath === '/app.html' || reqPath === '/room' || reqPath.startsWith('/room/')) {
      const appPath = path.join(__dirname, 'app.html');
      if (fs.existsSync(appPath)) {
        res.setHeader('Content-Type', MIME_TYPES['.html']);
        return fs.createReadStream(appPath).pipe(res);
      }
    }

    // Secret Owner Portal Route (Unguessable obfuscated route)
    if (reqPath === '/jhvbuihedfbyhibrt5gi-owner-j42n5jhn' || reqPath === '/jhvbuihedfbyhibrt5gi-owner-j42n5jhn.html') {
      const ownerPath = path.join(__dirname, 'jhvbuihedfbyhibrt5gi-owner-j42n5jhn.html');
      if (fs.existsSync(ownerPath)) {
        res.setHeader('Content-Type', MIME_TYPES['.html']);
        return fs.createReadStream(ownerPath).pipe(res);
      }
    }

    if (reqPath === '/' || reqPath === '/login' || !reqPath) reqPath = '/index.html';

    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(__dirname, safePath);

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      return fs.createReadStream(fullPath).pipe(res);
    }

    if (fs.existsSync(fullPath + '.html') && fs.statSync(fullPath + '.html').isFile()) {
      res.setHeader('Content-Type', MIME_TYPES['.html']);
      return fs.createReadStream(fullPath + '.html').pipe(res);
    }

    // Default to index.html for any unmapped route (Login Page)
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return fs.createReadStream(indexPath).pipe(res);
    }

    res.statusCode = 404;
    res.end('Not found');
  } catch (err) {
    res.statusCode = 500;
    res.end(`Server error: ${err.message}`);
  }
};
