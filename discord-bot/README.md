# 🛡️ HEADLESS DICE // SECURE VPS DISCORD LICENSE HUB

> **Zero-Firebase Architecture** • **Private Local JSON Vault** • **Discord Slash Commands** • **Uncrackable VPS Backend**

---

## ⚡ Why This Replaces Firebase Permanently

Firebase Realtime Database has public URLs (e.g. `*.firebasedatabase.app/keys.json`) that can be snooped or scraped if rules are misconfigured. 

**This VPS Discord Bot replaces Firebase entirely:**
- **No Public Database URL**: All keys, HWIDs, and sessions are stored in `data/keys.json` locally on your private VPS disk.
- **Firewalled**: Only your VPS processes and your authenticated Vercel backend (`api/verify.js`) can access the API via a secret bearer token.
- **Discord Bot Control**: You and Linux can generate keys, reset HWIDs, revoke abusers, and toggle maintenance directly from your private Discord channel on your phone or PC!

---

## 🚀 3-Minute VPS Setup Guide

### 1. Requirements on your VPS
- Linux (Ubuntu 20.04/22.04/24.04, Debian, CentOS, or AlmaLinux)
- Node.js v18+ (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`)
- PM2 for 24/7 background uptime (`npm install -g pm2`)

### 2. Upload / Clone to VPS
Copy the `discord-bot` folder to your VPS:
```bash
cd /opt
# or in your user home directory:
cd ~/discord-bot
npm install
```

### 3. Configure `.env`
Copy the template and fill in your Discord credentials:
```bash
cp .env.example .env
nano .env
```

Fill in:
```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_client_id_here
DISCORD_GUILD_ID=your_server_id_here
OWNER_USER_IDS=your_discord_user_id
ADMIN_ROLE_IDS=your_admin_role_id
PORT=4000
API_SECRET=iusedhfiuhsdilufhdsijfh_secret_vps_token
MASTER_KEY=iusedhfiuhsdilufhdsijfh
```

### 4. Start 24/7 Background Service
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Check status anytime:
```bash
pm2 logs headless-dice-bot
pm2 status
```

---

## 🎮 Discord Slash Commands Reference

| Command | Arguments | What it does |
|---|---|---|
| `/genkey` | `role`, `duration`, `note`, `hwid_lock` | Generates a new license key with formatted Discord embed. |
| `/listkeys` | `status` (Active / Revoked / All) | Displays all keys in the VPS database (ephemeral / private). |
| `/keyinfo` | `key` | Inspects a key's HWID, creation date, expiry, and notes. |
| `/resethwid` | `key` | Clears HWID lock so a user can log in from a new PC. |
| `/revokekey` | `key` | Instantly blocks and revokes a user's license. |
| `/deletekey` | `key` | Permanently deletes a key from disk. |
| `/stats` | None | Displays live server visits, active users, and key metrics. |
| `/maintenance` | `enable: true/false`, `reason` | Puts website in maintenance or brings it live directly from Discord! |
| `/broadcast` | `message`, `type` | Broadcasts an announcement banner to all website clients. |
| `/forcerefresh` | None | Sends instant reload command to every open browser tab. |

---

## 🔗 Connecting Website to VPS

In your Vercel Project Settings (or in `api/verify.js` & `api/admin.js`):
Set the Environment Variable:
- `DISCORD_VPS_URL`: `http://YOUR_VPS_IP:4000` (or `https://api.yourdomain.com`)
- `API_SECRET`: `iusedhfiuhsdilufhdsijfh_secret_vps_token`
- `MASTER_KEY`: `iusedhfiuhsdilufhdsijfh`

When `DISCORD_VPS_URL` is set, `api/verify.js` talks directly to your private VPS microservice!

---

## 🔒 Security Tips
1. Keep `data/keys.json` backed up regularly (`cp data/keys.json ~/backup_$(date +%F).json`).
2. Only allow port `4000` from Vercel or use Cloudflare Reverse Proxy / Nginx with HTTPS.
3. Your bot token and master key are 100% private and never committed to public git repos.

