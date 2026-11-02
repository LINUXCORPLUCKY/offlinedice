# HEADLESS DICE — SYSTEM ARCHITECTURE DOCUMENT

**Platform:** Premium Online Dice Prediction & Probability Engine  
**Deployment Target:** Vercel Serverless (Express.js Runtime) & Azure App Service Ready  
**Date:** November 2026  
**Status:** Audit & Modernization Architecture Specification  

---

## 1. Executive System Overview

Headless Dice is a high-precision, 4-dice stream probability analysis and 1-color prediction platform designed for real-time online dice game streaming. The platform ingests 4-dice stream rolls (across 6 colors: Purple, Blue, Green, Red, Orange, Yellow) and calculates sequence momentum, Markov transition matrices, recency weighting, streak persistence, and mean-reversion rebound dynamics to deliver locked `#1 Primary Target` and `Secondary Hedge` color predictions.

---

## 2. Existing Architecture & Component Topology

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|  - Modern Web Browser (Desktop / Mobile Responsive)                              |
|  - Inlined Application Engine (index.html, app.html)                             |
|  - Audio SFX Engine (Web Audio API Synthesizer)                                   |
|  - Device HWID Fingerprinting (Canvas, AudioContext, Screen, WebGL hash)          |
|  - Local Storage (headless_dice_auth, headless_dice_user_rolls)                   |
+------------------------------------------+----------------------------------------+
                                           | HTTPS / JSON
                                           v
+-----------------------------------------------------------------------------------+
|                        VERCEL SERVERLESS / EXPRESS RUNTIME                         |
|  - Entrypoint: index.js (Express Application Handler)                             |
|  - Routing & Maintenance Guard: isMaintenanceActive() -> maintenance.html         |
|  - Anti-Caching Headers (no-cache, no-store, must-revalidate)                     |
+-------------------+----------------------+--------------------+-------------------+
                    |                      |                    |
                    v                      v                    v
           +------------------+  +-------------------+  +------------------+
           |   /api/verify    |  |    /api/admin     |  |   /api/system    |
           | License Auth &   |  | Owner Authority & |  | Maintenance &    |
           | HWID Lock Gate   |  | Vault Management  |  | Sentinel Control |
           +--------+---------+  +---------+---------+  +--------+---------+
                    |                      |                     |
                    +----------------------+---------------------+
                                           | HTTPS REST
                                           v
+-----------------------------------------------------------------------------------+
|                               DATA PERSISTENCE LAYER                              |
|  [EXISTING LEGACY - TO BE DECOMMISSIONED]:                                         |
|  - Firebase Realtime Database (project-6054513801175471499-default-rtdb)          |
|  - Local JSON Fallbacks (api/_data/keys_vault.json, system_state.json)            |
|                                                                                   |
|  [TARGET ARCHITECTURE - MONGODB ATLAS]:                                           |
|  - MONGODB_URI Connection Pooling with Serverless Lambda Context Reuse            |
|  - Collections: users, licenses, owner_accounts, user_rooms, sessions,            |
|    system_settings, announcements, audit_logs, migration_records                  |
+-----------------------------------------------------------------------------------+
```

---

## 3. Detailed Component Communication Flow

### 3.1 Frontend-to-Backend Authentication & License Verification
1. User opens the application at `/`, `/login`, or `/room`.
2. The client checks `localStorage.getItem('headless_dice_auth')`.
3. If no verified session exists or the device HWID mismatch triggers, `#key-gate-modal` locks the DOM.
4. User submits their license key (e.g. `HD-USER-XXXX-XXXX-XXXX`).
5. Client captures the hardware fingerprint using `getDeviceHwid()`.
6. Client issues `POST /api/verify` with `{ key, hwid }`.
7. **Backend Execution:**
   - Validates key existence and status (`ACTIVE`, `REVOKED`, `BLACKLISTED`).
   - Checks expiration (`expireTimestamp`).
   - Checks HWID lock state (`hwidLock`). If unbound, binds atomically to incoming `hwid`. If bound and mismatched, returns HTTP 403.
   - Generates deterministic room allocation (`ROOM-HWID-KEY`).
   - Returns verified auth payload.

### 3.2 Owner Panel & Administrative Authority
1. Administrative routes (`/owner`, `/admin`) render `owner-panel.html`.
2. Administrator unlocks command center via Owner Key and HWID.
3. Requests issue `POST /api/admin` with header `X-Owner-Key` or body `ownerKey`.
4. Admin features supported:
   - Live telemetry and active user count.
   - License generator (24h, 7d, 30d, 60d, lifetime).
   - HWID Unbind / Reset utility.
   - Key Revocation and Deletion.
   - System Maintenance Toggle (persisted to database).
   - Global Force-Refresh Broadcast (epoch timestamp signal).
   - Live Announcement Banner deployment.

### 3.3 Dice Prediction Engine (Preserved Core)
1. **Inputs:** 5 sequential stream rolls, 4 dice per roll, 6 distinct color values:
   - Purple (`#a855f7`)
   - Blue (`#3b82f6`)
   - Green (`#22c55e`)
   - Red (`#ef4444`)
   - Orange (`#f97316`)
   - Yellow (`#eab308`)
2. **Analysis Phases:**
   - **Phase 1: Dynamic Recency Gradient:** Older rounds weighted at `1.0x` baseline, accelerating up to `3.4x` max pull for the latest round.
   - **Phase 2: Intra-Round Clustering:** Pairs and triples awarded `+8.0` and `+16.0` momentum multipliers.
   - **Phase 3: Streak Continuity vs. Mean-Reversion Rebound:** Multi-round hot streaks receive `+18.0` persistence bonus; missing colors with strong prior occurrence receive `+14.0` due-rebound bounce.
   - **Phase 4: Empirical Markov Transitions:** Pairwise transition matrices calculated between consecutive rounds $(t \to t+1)$.
   - **Phase 5: Intra-Round Co-occurrence:** Correlation weights computed based on colors appearing alongside recent dice.
   - **Phase 6: Controlled Dormant Attenuation:** Colors absent from all history are softly attenuated (`0.35x` floor), never zeroed out.
   - **Phase 7: Deterministic Normalization & Shannon Entropy:** Probabilities normalized to 100% and output as `#1 Primary Target` and `Secondary Hedge`.

---

## 4. Azure & Cloud Compatibility Layer

While the primary deployment engine is Vercel Serverless via Express.js, the backend is strictly decoupled to run natively on **Microsoft Azure App Service** or **Azure Functions (Node.js)**:
- Environment variable abstraction (`process.env.PORT`, `process.env.MONGODB_URI`).
- Zero reliance on local Windows/Linux filesystem writes in production.
- Stateless REST API design with externalized MongoDB Atlas session storage.
- Standard Node.js `package.json` with `npm start` invoking `node index.js`.

---

## 5. Modernization & Migration Roadmap

| Milestone | Legacy System | Target State |
| :--- | :--- | :--- |
| **Database** | Firebase Realtime Database (API Secret) | MongoDB Atlas (Mongoose/Native, TLS, Connection Pooling) |
| **Storage** | Mutable JSON files (`keys_vault.json`) | Indexed Collections with Schema Validation |
| **Owner Auth** | Key prefix `HD-OWNER` / hardcoded bypass | Two provisioned owner accounts with bcrypt hashing & audit logs |
| **User Rooms** | Client-side deterministic strings | Server-isolated `user_rooms` documents with ownership checks |
| **Frontend UI** | Hybrid CSS with glitchy scripts | Pure 2026 Liquid Glassmorphism design system |
| **API Security** | Permissive CORS (`*`), no rate limits | Strict CORS allowlist, sliding-window rate limiting, HttpOnly cookies |
