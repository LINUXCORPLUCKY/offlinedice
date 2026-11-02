# HEADLESS DICE — MULTI-CLOUD DEPLOYMENT GUIDE

**Supported Targets:** Vercel Serverless (Primary Production) & Microsoft Azure App Service  
**Runtime:** Node.js 18.x / 20.x / 22.x (LTS)  
**Architecture:** Stateless Express.js application with serverless connection-pooled MongoDB Atlas persistence  

---

## 1. Vercel Serverless Deployment (Primary Target)

### 1.1 Architecture & Rewrites
Vercel executes incoming HTTP traffic via the Express serverless handler defined in `index.js`.
`vercel.json` provides anti-caching headers and forwards all routes to the Express instance:

```json
{
  "version": 2,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate, max-age=0" },
        { "key": "Pragma", "value": "no-cache" },
        { "key": "Expires", "value": "0" }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.js"
    }
  ]
}
```

### 1.2 Deployment Steps
1. Push branch to GitHub:
   ```bash
   git push origin main
   ```
2. In Vercel Project Settings:
   - Framework Preset: **Express.js** (or Other).
   - Build Command: None (or `npm run build`).
   - Output Directory: Optional (root).
   - Node.js Version: `20.x` or `22.x`.
   - Environment Variables: Enter `MONGODB_URI`, `OWNER_1_USERNAME`, `OWNER_1_PASSWORD`, `OWNER_1_HWID`, `OWNER_2_USERNAME`, `OWNER_2_PASSWORD`, `OWNER_2_HWID`, `SESSION_SECRET`.
3. Vercel automatically deploys with zero-downtime atomic rollouts.

---

## 2. Microsoft Azure Deployment (Enterprise Compatibility)

### 2.1 Azure App Service (Linux Node.js)
1. Provision Azure App Service (Plan B1 or higher for production).
2. Configure Runtime Stack: Node.js 20 LTS.
3. In Azure Portal > App Service > **Configuration** > **Application Settings**:
   - Set `MONGODB_URI`
   - Set `PORT=8080` (Azure sets `WEBSITES_PORT=8080` or routes to `process.env.PORT`)
   - Set `OWNER_1_*`, `OWNER_2_*`, and `SESSION_SECRET`
4. Deploy using Azure CLI or GitHub Actions:
   ```bash
   az webapp up --name headless-dice-app --resource-group headless-dice-rg --plan headless-dice-plan
   ```
5. `index.js` automatically listens on `process.env.PORT` when run directly.

---

## 3. Serverless Database Optimization & Cold-Start Mitigation
- In `lib/db.js`, MongoDB connections are cached on the global Node.js context across Lambda/container invocations:
  ```javascript
  let cachedDb = null;
  let cachedClient = null;
  ```
- Connection pooling limits (`maxPoolSize: 10`) prevent connection exhaustion on MongoDB Atlas during traffic surges.
- Fail-closed error handling guarantees that if MongoDB Atlas is momentarily unreachable, the application denies authentication attempts rather than failing open.
