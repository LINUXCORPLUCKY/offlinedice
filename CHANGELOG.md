# CHANGELOG — HEADLESS DICE RE-ARCHITECTURE & SECURITY OVERHAUL
**Project:** HEADLESS DICE (`KITE` / `offlinedice`)  
**Release Version:** v2.0.0-PROD (Enterprise TypeScript & MongoDB Edition)  
**Release Date:** 2026-11-02  
**Architect:** Principal Security Architect & DevOps Engineer (Neon v4.3 / Jalapeno Configuration)

---

## [2.0.0] — 2026-11-02

### 1. Database & Infrastructure Migration (Firebase -> MongoDB Atlas)
- **Firebase Deprecation:** Completely removed Firebase Realtime Database SDK and public database credentials from frontend code.
- **MongoDB Atlas Integration:** Built server-side MongoDB connection pool with connection caching and Lambda context reuse (`maxPoolSize: 10`).
- **Selective Data Migration:** Migrated only the **11 genuinely HWID-bound active licenses** from the legacy database. Excluded 9 unbound user records and separated owner credentials into a secure administrative collection.
- **Collections Provisioned:**
  - `users`: Authenticated user profiles and room linkages.
  - `licenses`: Hardware-bound user licenses with status indexes.
  - `owner_accounts`: Provisioned accounts for two authorized owners (`tris_master` and `co_owner_auth`) with bcrypt salt rounds = 12.
  - `user_rooms`: Isolated roll streams, active slot positions, and prediction histories.
  - `sessions`: Cryptographically secure 32-byte session tokens with automatic TTL expiration.
  - `system_settings`: Centralized maintenance mode, emergency broadcast, and forced-refresh state.
  - `announcements`: Global administrative banners.
  - `audit_logs`: Immutable chronological access and modification logs.
  - `migration_records`: Verifiable cryptographic migration backup record.

### 2. Cybersecurity & Authorization Hardening
- **Eliminated Prefix-Based Escalation:** Removed vulnerable `key.startsWith('HD-OWNER')` authorization logic. Owner authority now requires exact database username match, bcrypt password verification, and hardware fingerprint matching.
- **Dual Owner Authorization:** Built dedicated authentication pathways for Owner 1 (`tris_master`, HWID `HD-HWID-5660-KYT0`) and Owner 2 (`co_owner_auth`, HWID `HD-HWID-COWN-0001`).
- **Anti-IDOR Protection:** Implemented strict user room ownership validation. User sessions can only read and mutate their own allocated room document (`403 Forbidden` on cross-user access).
- **Brute-Force & Rate Limiting:** Implemented sliding-window IP rate limiter (5 failed attempts within 15 minutes trigger automatic HTTP 429 lock).
- **Serverless Secrets Isolation:** Scrubbed all hardcoded credentials; all database URIs, Azure keys, and session secrets are managed via server-side environment variables.

### 3. Prediction Engine Preservation & Mathematical Integrity
- **Algorithm Preservation:** Ported the 4-dice 6-color prediction algorithm to TypeScript (`src/engine/diceEngine.ts` and `lib/dice_engine.js`) with 100% mathematical fidelity.
- **Markov Transition Modeling:** Maintained empirical 1st and 2nd order state transition matrices across historical round pairs.
- **Dynamic Recency Progressions:** Preserved 1.0x to 3.4x non-linear recency gradient across entered rolls.
- **Streak & Rebound Dynamics:** Preserved hot-streak persistence bonus (+18.0) and skipped-color rebound bounce bonus (+14.0).
- **Information Theory:** Maintained normalized Shannon entropy calculation ($H / \log_2(6)$).

### 4. UI/UX Transformation & Bug Fixes
- **2026 Liquid Glassmorphism Design:** Dark cyber glass interface (`#05020a`, `#0a0515`, `backdrop-filter: blur(18px)`, vibrant violet `#a855f7` and cyan `#00f0ff` glow accents).
- **Fixed `showToast is not defined`:** Hoisted a Bulletproof Universal Toast Manager in `<head>` that safely attaches to `window.showToast` before any DOM interaction.
- **Fixed `/* cleaned */` Body Artifact:** Scrubbed legacy discord cleaning script replacement artifacts from all HTML and CSS templates.
- **Fixed Scanner Freeze at `0s`:** Rewrote `executePredictionCalculation` countdown logic with strict `try...finally` teardown, explicit `overlay.style.display = 'none'`, and a fallback safety timer.
- **Fixed Mobile Button Misclicks:** Added generous vertical isolation spacing between the roll management action buttons and the calculate prediction trigger to prevent accidental touches.
- **Owner Control Center:** Integrated a responsive, glassmorphic Owner Panel modal supporting license generation, status toggles, HWID unbinding, global announcement broadcasts, and live telemetry feeds.

### 5. Multi-Cloud & Deployment Readiness
- **Vercel Serverless Ready:** Retained Express preset entrypoint (`index.js` and `vercel.json`) with anti-caching HTTP headers.
- **Azure App Service & Functions Ready:** Standardized environment configuration and health endpoints for automated cloud CI/CD pipelines.
- **Strict TypeScript Build:** Full compilation with zero implicit `any` and complete type safety across `dist/`.

