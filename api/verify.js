// ==============================================================================
// HEADLESS DICE — ENTERPRISE LICENSE VERIFICATION & GATE API
// Server-Side Verification against MongoDB Atlas (Zero Client Exposure)
// ==============================================================================

const { authenticateLicenseKey, SESSION_COOKIE_NAME } = require('../lib/auth');

function sendJson(res, statusCode, data, req) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  const origin = reqOrigin(req || res.req);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.end(JSON.stringify(data));
}

function reqOrigin(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const clientOrigin = req && req.headers ? req.headers.origin : null;
  if (!clientOrigin) return '*';
  if (allowed.length === 0 || allowed.includes(clientOrigin)) return clientOrigin;
  return allowed[0] || '*';
}

module.exports = async (req, res) => {
  res.req = req;
  const origin = reqOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  try {
    const getBody = () => new Promise((resolve) => {
      if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === 'string') {
          try { return resolve(JSON.parse(req.body)); } catch(e) { return resolve({}); }
        }
        return resolve(req.body);
      }
      let b = '';
      req.on('data', c => b += c);
      req.on('end', () => {
        try { resolve(JSON.parse(b)); } catch(e) { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });

    const body = (await getBody()) || {};
    const key = body.key;
    const hwid = body.hwid;
    const clientIp = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || '127.0.0.1';

    const result = await authenticateLicenseKey({ key, hwid, ip: clientIp });

    if (!result.success) {
      return sendJson(res, result.status || 401, { success: false, error: result.error });
    }

    // Issue secure HttpOnly session cookie
    const isProd = process.env.NODE_ENV === 'production';
    const cookieHeader = `${SESSION_COOKIE_NAME}=${result.sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${isProd ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', cookieHeader);

    return sendJson(res, 200, {
      success: true,
      role: result.role,
      roomId: result.roomId,
      duration: result.duration,
      boundHwid: result.boundHwid,
      sessionToken: result.sessionToken,
      message: 'Access granted'
    });
  } catch (err) {
    console.error('Verify error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Authentication service temporarily unavailable: ' + (err && err.message)
    });
  }
};
