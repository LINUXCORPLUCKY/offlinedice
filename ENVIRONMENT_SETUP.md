# HEADLESS DICE — ENVIRONMENT SETUP & SECRETS CONFIGURATION

**Application:** Headless Dice Online Platform  
**Target Environments:** Local Development, Vercel Serverless, Azure App Service  
**Security Mandate:** Never commit secrets, credentials, or `.env` files to git.  

---

## 1. Required Environment Variables

Configure these variables in your deployment dashboard (e.g. Vercel Project Settings > Environment Variables or Azure App Service Configuration > Application Settings):

```bash
# ==============================================================================
# DATABASE CONFIGURATION (MONGODB ATLAS)
# ==============================================================================
# Connection string with TLS enabled. Connection pool handles serverless lifecycle.
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/headless_dice?retryWrites=true&w=majority&appName=HeadlessDiceCluster

# ==============================================================================
# TWO AUTHORIZED OWNER CREDENTIALS (BCRYPT PROVISIONED)
# ==============================================================================
# Owner 1 (Tris - Primary System Authority)
OWNER_1_USERNAME=tris_master
OWNER_1_PASSWORD=ChangeMeWithStrongPassphrase!2026
OWNER_1_HWID=HD-HWID-5660-KYT0

# Owner 2 (Co-Owner - Secondary System Authority)
OWNER_2_USERNAME=co_owner_auth
OWNER_2_PASSWORD=ChangeMeWithStrongPassphrase!2026
OWNER_2_HWID=HD-HWID-COWN-0001

# ==============================================================================
# SESSION & CRYPTOGRAPHIC SECURITY
# ==============================================================================
# 64-character secret key for HMAC session signing and CSRF tokens
SESSION_SECRET=a8f8d2e4b6c1e9f03458129abfde678123490bcaeffd1234567890abcdef1234
SESSION_TTL_HOURS=24

# ==============================================================================
# NETWORK & CORS ALLOWLIST
# ==============================================================================
# Comma-separated list of permitted origins
ALLOWED_ORIGINS=https://offlinedice-linux-e93f4df3.vercel.app,https://headlessdice.com,http://localhost:3000

# ==============================================================================
# RUNTIME CONFIGURATION
# ==============================================================================
NODE_ENV=production
PORT=3000
```

---

## 2. Local Development Setup

1. Copy `.env.example` to `.env` (do NOT commit `.env` to git):
   ```bash
   cp .env.example .env
   ```
2. Populate `MONGODB_URI` with your MongoDB Atlas connection string.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Seed database indexes and provision initial owners:
   ```bash
   node scripts/seed_database.js
   ```
5. Launch development server:
   ```bash
   npm start
   ```
