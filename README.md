# 🎲 HEADLESS DICE // Online Dice 1-Color Predictor & Dedicated Room Engine

Headless Dice is an advanced 4-dice stream pattern recognition and 1-color prediction engine built for Online Dice. It features a hardened serverless license paywall, hardware ID (HWID) device locking, dedicated user room isolation, and a full Owner Command Center backed by Firebase Realtime Database.

---

## 🚀 What's New in v1.0.0 (Release Notes & Update Log)

### 1. 🛡️ Dedicated Isolated User Rooms (Zero-Collision Architecture)
- **Individual Room Allocation**: Every authenticated session is assigned a unique Room ID (`ROOM-OWNER-...` or `ROOM-<HWID>-<KEY>`).
- **Dynamic URL Routing**: The browser address bar automatically updates to reflect the active room (`/?room=ROOM-...` and `/room/ROOM-...`).
- **One-Tap Room Copy**: Tap the glowing room badge in the top status bar to copy the dedicated room URL directly to your clipboard.
- **Dual Partitioned Storage**:
  - **Local Partition**: Rolls and workspace state are saved under `headless_dice_room_${roomId}_data`.
  - **Cloud Partition**: Persistent cloud sync at `/user_rooms/${roomId}.json` in Firebase RTDB.
- **Zero Cross-Talk**: Markov sequence probability calculations run in strict thread isolation with zero interference from other concurrent players.

### 2. 📱 Complete Mobile-First Cyberpunk UI Optimization
- **Full Viewport Responsiveness**: Adapts smoothly from 4K desktops down to 320px mobile viewports (iPhone, Android, tablets).
- **Adaptive Dice Rows**: Dice slots automatically adjust (48px ➔ 42px ➔ 36px) to ensure all 4 dice fit side-by-side on narrow screens without horizontal scroll.
- **Mobile Touch Keypad**: 6-color selection palette (`Purple`, `Blue`, `Green`, `Red`, `Orange`, `Yellow`, `Clear`) formatted into an ergonomic touch grid.
- **Neon Status Bar**: Displays live room status, isolation thread indicator, and cloud sync status at a glance.

### 3. 🔒 Hardened Security & Anti-Bypass Protection
- **Server-Side Master Key**: Master key is verified exclusively server-side via serverless function (`api/verify.js` / `process.env.MASTER_KEY`). Client code never contains master credentials.
- **Enforced Key Gate**: The key gate modal is locked from the first render (`display: flex`). Auto-login vulnerabilities eliminated.
- **Hardware ID (HWID) Locking**: Licenses bind to device signatures on first activation. Prevents unauthorized key sharing.
- **Zero-Leak Webhook Proxy**: Discord logs are relayed through a secure serverless endpoint (`api/webhook.js`) to prevent webhook URL scraping.

### 4. 👑 Owner Command Center Upgrades
- **Room-Aware Player Predictions**: Live predictions feed now displays a cyan room badge for each calculation, allowing live monitoring of all user rooms.
- **Live Active Heartbeat**: Tracks active visitors in the last 5 minutes, total all-time site hits, and active licenses.
- **Key Generator**: Generate `USER`, `FREE`, `ADMIN`, or `OWNER` licenses with custom codes, duration presets (`24 Hours`, `7 Days`, `30 Days`, `60 Days`, `Lifetime`), and optional HWID lock.
- **Keys Vault**: Search, view, reset HWID bindings, revoke, or permanently delete keys directly in Firebase RTDB.
- **Live Broadcast System**: Push real-time announcements to all active users instantly.

---

## 🌐 Deployment & Community

- **Live Production URL**: [https://onlinedicehedlessdcie-psi.vercel.app](https://onlinedicehedlessdcie-psi.vercel.app)
- **Discord Community**: [discord.gg/TSensK6HEc](https://discord.com/invite/TSensK6HEc)
- **Stack**: HTML5, Vanilla JavaScript (ES6+), Cyber CSS3, Node.js Serverless Functions, Firebase Realtime Database, Vercel CDN.
