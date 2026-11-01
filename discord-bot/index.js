require('dotenv').config();
const createApiServer = require('./src/api');
const createDiscordBot = require('./src/bot');
const db = require('./src/database');

const PORT = process.env.PORT || 4000;
const API_SECRET = process.env.API_SECRET || 'iusedhfiuhsdilufhdsijfh_secret_vps_token';
const MASTER_KEY = process.env.MASTER_KEY || 'iusedhfiuhsdilufhdsijfh';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

// Designated 3 Owners with Absolute Authority
const DEFAULT_OWNER_IDS = [
  '1335889436898230302',
  '1009385844920025148',
  '1105509248240201738'
];

const envOwners = (process.env.OWNER_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const OWNER_USER_IDS = Array.from(new Set([...DEFAULT_OWNER_IDS, ...envOwners]));
const ADMIN_ROLE_IDS = (process.env.ADMIN_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

console.log('====================================================');
console.log('⚡ HEADLESS DICE // SECURE VPS DISCORD LICENSE HUB ⚡');
console.log('====================================================');
console.log(`Database loaded: ${Object.keys(db.getAllKeys()).length} keys active in local VPS vault.`);
console.log(`Authorized Owners (${OWNER_USER_IDS.length}): ${OWNER_USER_IDS.join(', ')}`);

// 1. Launch Express Microservice API (For Website Key Verification & Anti-Bypass)
const app = createApiServer(MASTER_KEY, API_SECRET);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[VPS API] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[VPS API] Key Verification Endpoint: POST /api/verify`);
  console.log(`[VPS API] Admin Command Endpoint:     POST /api/admin`);
  console.log(`[VPS API] System Status Endpoint:    GET /api/system/maintenance`);
  console.log(`[VPS API] Healthcheck Endpoint:        GET /health`);
});

// 2. Launch Discord Bot (if token configured)
if (DISCORD_TOKEN) {
  createDiscordBot(DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, OWNER_USER_IDS, ADMIN_ROLE_IDS);
} else {
  console.log('[DISCORD BOT] Bot token not provided in .env yet.');
  console.log('[DISCORD BOT] API microservice is active! Add DISCORD_TOKEN to .env to activate slash commands.');
}
