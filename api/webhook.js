// Vercel Serverless Function: Secure Discord Webhook Relay
// Prevents exposing the private webhook URL to site visitors

const https = require('https');

const PRIVATE_DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1565624862041448508/8dEmZRAEtf-5_v71KsegbC311QP-GfeHfPKHV8pL51bvQpVAgenuDj0wbybDOmV0b41v';

const COLOR_MAP = {
  purple: { name: 'PURPLE', hex: 0xa855f7, emoji: '🟪' },
  blue: { name: 'BLUE', hex: 0x3b82f6, emoji: '🟦' },
  green: { name: 'GREEN', hex: 0x22c55e, emoji: '🟩' },
  red: { name: 'RED', hex: 0xef4444, emoji: '🟥' },
  darkorange: { name: 'ORANGE', hex: 0xf97316, emoji: '🟧' },
  gold: { name: 'YELLOW', hex: 0xeab308, emoji: '🟨' }
};

function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') return res.status(204).end();
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
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
        try {
          resolve(JSON.parse(b));
        } catch(e) {
          resolve({});
        }
      });
      req.on('error', () => resolve({}));
    });

    const data = (await getBody()) || {};
    const now = new Date();
    const timeFormatted = now.toLocaleString();

    const rollNum = data.rollNumber || 5;
    const roundDice = Array.isArray(data.roundDice) ? data.roundDice : [];
    const pred = data.prediction || {};
    const topColorKey = pred.topColor || 'purple';
    const topColorInfo = COLOR_MAP[topColorKey] || COLOR_MAP.purple;
    const probVal = pred.topProbability || '85.0';

    const formattedDice = roundDice.map(c => {
      if (!c) return '⬜ EMPTY';
      const info = COLOR_MAP[c];
      return info ? `${info.emoji} ${info.name}` : c.toUpperCase();
    }).join('   ');

    const payload = {
      username: 'HEADLESS DICE // STREAM LOGGER',
      embeds: [
        {
          title: '🎲 HEADLESS DICE — LIVE STREAM PREDICTION',
          description: 'Live prediction calculated by user on Headless Dice Online Dice solver.',
          color: topColorInfo.hex,
          fields: [
            { name: '🕒 Person Roll Time', value: `**${timeFormatted}**`, inline: true },
            { name: '🎯 #1 Predicted Color', value: `**${topColorInfo.emoji} ${topColorInfo.name}**`, inline: true },
            { name: '📊 Win Probability', value: `**${probVal}% Confidence**`, inline: true },
            { name: `🎲 Stream Roll Input (Roll #${rollNum} • 4 Dice)`, value: formattedDice || 'No dice registered', inline: false },
            { name: '⚡ Telemetry Insights', value: `Top: **${topColorInfo.name}** • Entropy: **${pred.entropyScore || '0.82'}**`, inline: false },
            { name: '🌐 Community Discord', value: '[Join Headless Dice Discord](https://discord.com/invite/TSensK6HEc)', inline: false }
          ],
          footer: {
            text: 'HEADLESS DICE ONLINE DICE PREDICTOR • discord.gg/TSensK6HEc'
          },
          timestamp: now.toISOString()
        }
      ]
    };

    const webhookUrl = new URL(PRIVATE_DISCORD_WEBHOOK_URL);
    const postBody = JSON.stringify(payload);

    const discordReq = https.request({
      hostname: webhookUrl.hostname,
      port: 443,
      path: webhookUrl.pathname + webhookUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postBody),
        'User-Agent': 'HeadlessDice-VercelRelay/2.0'
      }
    }, (discordRes) => {
      let respData = '';
      discordRes.on('data', c => respData += c);
      discordRes.on('end', () => {
        if (discordRes.statusCode >= 200 && discordRes.statusCode < 300) {
          return sendJson(res, 200, { success: true, message: 'Logged to Discord' });
        } else {
          return sendJson(res, 500, { error: `Discord error: ${discordRes.statusCode}` });
        }
      });
    });

    discordReq.on('error', (err) => {
      return sendJson(res, 500, { error: err.message });
    });

    discordReq.write(postBody);
    discordReq.end();
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
};
