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

const OWNER_USER_IDS = (process.env.OWNER_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const ADMIN_ROLE_IDS = (process.env.ADMIN_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

console.log('====================================================');
console.log('⚡ HEADLESS DICE // SECURE VPS DISCORD LICENSE HUB ⚡');
console.log('====================================================');
console.log(`Database loaded: ${Object.keys(db.getAllKeys()).length} keys active in local VPS vault.`);

// 1. Launch Express Microservice API
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
  console.log('[DISCORD BOT] API microservice is running! Configure .env to activate Discord slash commands.');
}

