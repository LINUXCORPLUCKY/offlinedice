# 🛡️ HEADLESS DICE // SECURE VPS DISCORD LICENSE HUB

> **Zero-Firebase Architecture** • **Private Local JSON Vault** • **Discord Slash Commands** • **Uncrackable VPS Backend**

---

## ⚡ The 3 Designated Owners (Full Authority)
The bot is hardcoded and pre-configured to authorize these 3 Discord User IDs with permanent Owner Authority:
1. `1335889436898230302` (Tris / Linux)
2. `1009385844920025148`
3. `1105509248240201738`

These 3 owners can execute all commands: `/genkey`, `/resethwid`, `/sethwid`, `/blacklist`, `/unblacklist`, `/revokekey`, `/deletekey`, `/keyinfo`, `/listkeys`, `/stats`, `/maintenance`, `/broadcast`, and `/forcerefresh`.

---

## 🚀 2-Minute VPS Setup Guide (Using .tar.gz)

### 1. Upload & Extract on Your VPS
Upload `discord-bot.tar.gz` to your VPS via SCP, SFTP, or MobaXterm:
```bash
# Extract the archive
tar -xzf discord-bot.tar.gz
cd discord-bot

# Install dependencies
npm install
```

### 2. Configure `.env`
```bash
cp .env.example .env
nano .env
```
Fill in your Bot Token and Client ID from Discord Developer Portal:
```ini
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_server_id_here
OWNER_USER_IDS=1335889436898230302,1009385844920025148,1105509248240201738
PORT=4000
API_SECRET=iusedhfiuhsdilufhdsijfh_secret_vps_token
MASTER_KEY=iusedhfiuhsdilufhdsijfh
```

### 3. Start 24/7 with PM2
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
| `/resethwid` | `key` | Clears HWID lock so a user can log in from a new PC. |
| `/sethwid` | `key`, `hwid` | Manually sets or customizes the HWID lock for a key. |
| `/blacklist` | `key`, `reason` | Instantly blacklists a key and revokes all room access. |
| `/unblacklist` | `key` | Unblacklists and restores a revoked key to Active. |
| `/revokekey` | `key` | Instantly revokes a user's license. |
| `/deletekey` | `key` | Permanently deletes a key from disk. |
| `/keyinfo` | `key` | Inspects a key's HWID, creation date, expiry, notes, and blacklist state. |
| `/listkeys` | `status` (Active / Revoked / All) | Displays all keys in the VPS database (ephemeral / private). |
| `/stats` | None | Displays live server visits, active users, and key metrics. |
| `/maintenance` | `enable: true/false`, `reason` | Puts website in maintenance or brings it live directly from Discord! |
| `/broadcast` | `message`, `type` | Broadcasts an announcement banner to all website clients. |
| `/forcerefresh` | None | Sends instant reload command to every open browser tab. |

---

## 🔗 Connecting Website to VPS

In your Vercel Project Settings (or VPS host):
Set the Environment Variable:
- `DISCORD_VPS_URL`: `http://YOUR_VPS_IP:4000`
- `API_SECRET`: `iusedhfiuhsdilufhdsijfh_secret_vps_token`
- `MASTER_KEY`: `iusedhfiuhsdilufhdsijfh`

When `DISCORD_VPS_URL` is configured, `/api/verify` talks directly to your private VPS microservice!
