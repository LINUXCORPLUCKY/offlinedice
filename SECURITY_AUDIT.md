# HEADLESS DICE — COMPREHENSIVE CYBERSECURITY AUDIT

**Target:** Headless Dice Online Platform  
**Auditor:** Principal Cybersecurity & DevSecOps Architecture Team  
**Date:** November 2026  
**Classification:** Confidential Security Audit Report  

---

## 1. Executive Summary

A comprehensive, line-by-line security audit was performed across all frontend, backend, serverless API, database, and repository components. The assessment uncovered **7 Critical Severity**, **5 High Severity**, and **4 Medium Severity** vulnerabilities spanning authentication, authorization, secret management, session integrity, and data persistence.

All identified vulnerabilities have been documented below with root causes, proof of vulnerability, and concrete remediation specifications.

---

## 2. Vulnerability Findings Matrix

| Ref ID | Vulnerability Name | Severity | Affected Component(s) | Fix Status |
| :--- | :--- | :--- | :--- | :--- |
| **VULN-01** | Arbitrary Owner Privilege Escalation via Key Prefix | **CRITICAL** | `api/admin.js`, `api/verify.js` | **FIXED** |
| **VULN-02** | Exposed Firebase Database Secret in Source Code | **CRITICAL** | `api/admin.js`, `api/verify.js`, `*.js` | **FIXED** |
| **VULN-03** | In-Memory & Local Hardcoded Key Vault Fallback | **CRITICAL** | `api/verify.js`, `api/_data/keys_vault.json` | **FIXED** |
| **VULN-04** | Client-Side Security Through Obscurity & DOM Bypasses | **CRITICAL** | `index.html`, `app.html` | **FIXED** |
| **VULN-05** | Cryptographically Insecure Pseudo-Session Tokens | **CRITICAL** | `api/verify.js` | **FIXED** |
| **VULN-06** | Mutable Local Filesystem Storage on Ephemeral Serverless | **CRITICAL** | `api/_data/*.json`, `index.js` | **FIXED** |
| **VULN-07** | Deterministic Insecure Direct Object Reference (IDOR) on Rooms | **CRITICAL** | `api/verify.js`, `index.js` | **FIXED** |
| **VULN-08** | Permissive Cross-Origin Resource Sharing (`*`) | **HIGH** | `api/admin.js`, `api/verify.js`, `api/system.js` | **FIXED** |
| **VULN-09** | Spoofable Client-Generated HWID Values | **HIGH** | `assets/app.js`, `index.html`, `api/verify.js` | **FIXED** |
| **VULN-10** | Missing Rate Limiting on Authentication & Admin Endpoints | **HIGH** | `api/verify.js`, `api/admin.js` | **FIXED** |
| **VULN-11** | Unauthenticated Remote Control Sentinel Polling | **HIGH** | `api/system.js`, `index.html` | **FIXED** |
| **VULN-12** | Information Leakage in API Error Responses | **HIGH** | `api/verify.js`, `assets/app.js` | **FIXED** |
| **VULN-13** | Lack of CSRF Protection & Insecure Cookie Flags | **MEDIUM** | `index.js`, `api/*` | **FIXED** |
| **VULN-14** | Unrestricted Request Body Payload Size | **MEDIUM** | `index.js` | **FIXED** |
| **VULN-15** | Residual Code Comments Leaking into Rendered DOM (`/* cleaned */`) | **MEDIUM** | `index.html`, `app.html` | **FIXED** |
| **VULN-16** | Unhandled ReferenceError Crashing UI Flow (`showToast`) | **MEDIUM** | `index.html`, `assets/app.js` | **FIXED** |

---

## 3. Deep-Dive Vulnerability Technical Analysis

### VULN-01: Arbitrary Owner Privilege Escalation via Key Prefix (`startsWith('HD-OWNER')`)
- **Severity:** CRITICAL (CVSS 9.8)
- **Affected File:** `api/admin.js` (Line 205), `api/verify.js` (Line 225)
- **Technical Explanation:**
  The server authorization check evaluated:
  ```javascript
  const isAuthorizedOwner = ownerKey === OWNER_KEY || 
    ownerKey.startsWith('HD-OWNER') || 
    (ownerKeyData && (ownerKeyData.role === 'OWNER' || ownerKeyData.role === 'ADMIN'));
  ```
  Any attacker supplying an arbitrary key such as `HD-OWNER-HACKED-BYPASS` was immediately recognized by the server as an authorized Owner, granting full administrative privileges, license creation, and system control without checking the database.
- **Remediation:** Remove all prefix-based authorization. Implement explicit server-side role verification against provisioned owner accounts stored with secure bcrypt credentials in MongoDB Atlas.

---

### VULN-02: Exposed Firebase Database Secret in Source Code
- **Severity:** CRITICAL (CVSS 9.8)
- **Affected File:** `api/verify.js`, `api/admin.js`, git history
- **Technical Explanation:**
  The Firebase database master authentication secret was concatenated and embedded in plain source code:
  `const FIREBASE_SECRET = process.env.FIREBASE_SECRET || ['zJKN', 'McxAIslQHFY2nxaQ', 'kW3owy2sEJdiyZu2r994'].join('');`
  This gave anyone with repository access root administrative read/write access to the entire Firebase Realtime Database.
- **Remediation:** Completely migrate from Firebase to MongoDB Atlas. Remove all Firebase secrets from source code. Require database connection URIs strictly through environment variables (`MONGODB_URI`).

---

### VULN-03: In-Memory & Local Hardcoded Key Vault Fallback
- **Severity:** CRITICAL (CVSS 9.1)
- **Affected File:** `api/verify.js` (Lines 16-53), `api/_data/keys_vault.json`
- **Technical Explanation:**
  The codebase bundled active license keys and hardcoded owner keys directly in source code and in repository JSON files. If Firebase was unreachable or slow, the server fell back to these keys, allowing unauthorized sessions.
- **Remediation:** Purge all embedded keys and JSON key vaults. Store all license and owner records exclusively in MongoDB Atlas with unique indexes.

---

### VULN-04: Client-Side Security Through Obscurity & DOM Bypasses
- **Severity:** CRITICAL (CVSS 8.8)
- **Affected File:** `index.html`, `app.html`
- **Technical Explanation:**
  The application rendered the full prediction engine and application markup into the client DOM and attempted to restrict access simply by displaying an overlay modal (`#key-gate-modal`). Anyone using browser DevTools or adblockers could delete `#key-gate-modal` or execute `STATE.isCalculating = false` in the console.
- **Remediation:** Implement server-side route guarding and authentication validation. Sensitive prediction actions and state transitions must be verified on the server.

---

### VULN-05: Cryptographically Insecure Pseudo-Session Tokens
- **Severity:** CRITICAL (CVSS 8.6)
- **Affected File:** `api/verify.js` (Lines 266-267)
- **Technical Explanation:**
  Upon license verification, the API returned:
  ```javascript
  sessionId: `HD-SESS-${keyClean}-${Date.now()}`,
  token: `HD-AUTH-${finalRole}-${Date.now()}`
  ```
  These tokens were predictable, unencrypted, unsigned, and stored in `localStorage`, vulnerable to XSS and token forgery.
- **Remediation:** Generate cryptographically secure random session tokens (32 bytes entropy via `crypto.randomBytes`). Store sessions in MongoDB Atlas with TTL expiration and transmit session cookies with `HttpOnly`, `Secure`, and `SameSite=Strict`.

---

### VULN-06: Mutable Local Filesystem Storage on Ephemeral Serverless
- **Severity:** CRITICAL (CVSS 8.2)
- **Affected File:** `api/admin.js`, `api/verify.js`, `api/_data/*.json`
- **Technical Explanation:**
  The serverless functions attempted to persist license keys, HWID updates, and system state by writing to `api/_data/keys_vault.json` using `fs.writeFileSync`. On Vercel (AWS Lambda backend), the filesystem is read-only or ephemeral: file writes are either discarded upon container teardown or cause runtime exceptions.
- **Remediation:** Move all mutable state (system state, maintenance flags, announcements, licenses, logs) to MongoDB Atlas.

---

### VULN-07: Deterministic IDOR on Prediction Rooms
- **Severity:** CRITICAL (CVSS 8.5)
- **Affected File:** `api/verify.js` (Line 255), `index.js`
- **Technical Explanation:**
  Room identifiers were constructed deterministically as `ROOM-${hwidClean}-${keyClean}`. Furthermore, `/room/*` routes served identical static HTML without verifying if the requesting user owned that room.
- **Remediation:** Generate secure UUIDv4 room tokens stored in `user_rooms`. Enforce server-side ownership checks: User A can never query or mutate User B's room document.

---

### VULN-08: Permissive Cross-Origin Resource Sharing (`CORS: *`)
- **Severity:** HIGH (CVSS 7.5)
- **Affected File:** `api/verify.js`, `api/admin.js`, `api/system.js`
- **Technical Explanation:**
  All API handlers sent `Access-Control-Allow-Origin: *`, permitting malicious third-party websites to issue cross-origin requests to administrative and verification endpoints.
- **Remediation:** Restrict CORS headers to authorized application domains (configured via environment variables).

---

### VULN-09: Spoofable Client-Generated HWID Values
- **Severity:** HIGH (CVSS 7.2)
- **Affected File:** `assets/app.js`, `index.html`
- **Technical Explanation:**
  The device HWID was generated via client-side Canvas and WebGL calls and transmitted directly in the request body. An attacker could trivially bypass HWID binding by passing any custom string in `hwid`.
- **Remediation:** Combine client hardware telemetry with server-observed TCP/IP and HTTP headers (User-Agent, Accept-Language, IP subnet hash) to validate fingerprint consistency.

---

### VULN-10: Missing Rate Limiting on Authentication & Admin Endpoints
- **Severity:** HIGH (CVSS 7.5)
- **Affected File:** `api/verify.js`, `api/admin.js`
- **Technical Explanation:**
  Endpoints had zero rate limiting. Attackers could launch automated brute-force attacks against license keys or owner credentials without IP throttling.
- **Remediation:** Implement sliding-window rate limiting in middleware (e.g. max 5 failed attempts per 15-minute window per IP) tracked in MongoDB Atlas.

---

### VULN-11: Unauthenticated Remote Control Sentinel Polling
- **Severity:** HIGH (CVSS 6.5)
- **Affected File:** `api/system.js`
- **Technical Explanation:**
  `/api/system?type=all` exposed system operational timestamps and maintenance reasons to unauthenticated visitors every 3 seconds.
- **Remediation:** Sanitize public system telemetry. Do not leak internal maintenance reasons or administrative author IDs to unauthorized clients.

---

### VULN-12: Information Leakage in API Error Responses
- **Severity:** HIGH (CVSS 6.0)
- **Affected File:** `api/verify.js`, `api/admin.js`
- **Technical Explanation:**
  `catch (err)` blocks returned raw exception messages: `Verification server error: ${err.message}`, leaking internal file paths and stack traces to clients.
- **Remediation:** Return sanitized, user-friendly error messages and log raw errors to server-side `audit_logs` in MongoDB Atlas.

---

### VULN-13: Insecure Cookie Flags & Missing CSRF Protection
- **Severity:** MEDIUM (CVSS 5.3)
- **Affected File:** `index.js`
- **Remediation:** Issue session cookies with `HttpOnly; Secure; SameSite=Strict` flags.

---

### VULN-14: Unrestricted Request Body Payload Size
- **Severity:** MEDIUM (CVSS 4.9)
- **Affected File:** `index.js` (Line 11)
- **Technical Explanation:**
  `app.use(express.json())` was called without a `limit` option, enabling Denial of Service via memory exhaustion through oversized JSON payloads.
- **Remediation:** Restrict JSON body size to `100kb` via `express.json({ limit: '100kb' })`.

---

### VULN-15: Residual Comments Leaking into Rendered DOM (`/* cleaned */`)
- **Severity:** MEDIUM (CVSS 4.0)
- **Affected File:** `index.html`, `app.html`
- **Technical Explanation:**
  A string replacement script substituted CSS comments `/* cleaned */` into HTML body elements, rendering raw comment text above the footer.
- **Remediation:** Completely scrub all residual strings and sanitize build scripts.

---

### VULN-16: Unhandled ReferenceError Crashing UI Flow (`showToast`)
- **Severity:** MEDIUM (CVSS 4.5)
- **Affected File:** `index.html`, `assets/app.js`
- **Technical Explanation:**
  `showToast` calls in `handleUnlockGate()` and `finalize()` crashed when `showToast` was undefined in scope, causing countdown freezing at `0s` and blocking login verification.
- **Remediation:** Implement a global, foolproof Toast Manager guaranteed to exist before any script executes, with `try/catch` guardrails.
