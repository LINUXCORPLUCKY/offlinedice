# HEADLESS DICE — MONGODB ATLAS DATABASE SCHEMA SPECIFICATION

**Database Platform:** MongoDB Atlas  
**Engine Driver:** Native MongoDB Driver / Connection Pooling with Serverless Lambda Context Reuse  
**Database Name:** `headless_dice`  
**Security Level:** Production TLS, Scram-SHA-256 Auth, Strict Indexing, Schema Validation  

---

## 1. Overview & Connection Architecture

The application transitions from Firebase Realtime Database to a fully relational, document-based schema in MongoDB Atlas.

### Connection Resilience (`db/mongodb.js`)
```javascript
// Connection pooling pattern optimized for Vercel Serverless Functions
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }
  // Connect with maxPoolSize: 10, socketTimeoutMS: 5000, serverSelectionTimeoutMS: 5000
}
```

---

## 2. Collections & Field Specifications

### 2.1 Collection: `users`
Represents an individual authenticated user who has redeemed an active license.
```json
{
  "_id": "ObjectId",
  "username": "String (unique, indexed)",
  "role": "String ('USER' | 'VIP')",
  "licenseKey": "String (unique, indexed)",
  "boundHwid": "String (indexed)",
  "roomId": "String (unique, indexed, UUID format)",
  "status": "String ('ACTIVE' | 'SUSPENDED' | 'REVOKED')",
  "createdAt": "Date",
  "lastLoginAt": "Date",
  "metadata": "Object"
}
```
**Indexes:**
- `{ username: 1 }` (unique)
- `{ licenseKey: 1 }` (unique)
- `{ boundHwid: 1 }`
- `{ roomId: 1 }` (unique)

---

### 2.2 Collection: `licenses`
Maintains all generated, active, redeemed, and migrated license keys.
```json
{
  "_id": "ObjectId",
  "key": "String (unique, indexed, format: HD-USER-XXXX-XXXX-XXXX)",
  "role": "String ('USER' | 'VIP')",
  "boundHwid": "String (indexed)",
  "status": "String ('ACTIVE' | 'REDEEMED' | 'REVOKED' | 'EXPIRED' | 'BLACKLISTED')",
  "duration": "String ('24hours' | '7days' | '30days' | '60days' | 'lifetime')",
  "hwidLock": "Boolean (default: true)",
  "isRedeemed": "Boolean (default: false)",
  "redeemedBy": "ObjectId (reference to users._id, optional)",
  "redeemedAt": "Date (optional)",
  "createdTimestamp": "Number (Unix epoch)",
  "expireTimestamp": "Number (Unix epoch, nullable)",
  "notes": "String",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```
**Indexes:**
- `{ key: 1 }` (unique)
- `{ boundHwid: 1 }`
- `{ status: 1 }`
- `{ expireTimestamp: 1 }`

---

### 2.3 Collection: `owner_accounts`
Stores the **exactly two provisioned owner accounts**. No third account can ever be provisioned without direct database access.
```json
{
  "_id": "ObjectId",
  "ownerId": "String (unique, 'OWNER_PRIMARY' | 'OWNER_SECONDARY')",
  "username": "String (unique, indexed)",
  "displayName": "String",
  "passwordHash": "String (bcrypt, 12 rounds)",
  "boundHwid": "String (hardware-locked)",
  "role": "String ('OWNER')",
  "status": "String ('ACTIVE' | 'DISABLED')",
  "failedLoginAttempts": "Number (default: 0)",
  "lockUntil": "Date (nullable)",
  "lastLoginAt": "Date",
  "lastLoginIp": "String",
  "createdAt": "Date"
}
```
**Indexes:**
- `{ ownerId: 1 }` (unique)
- `{ username: 1 }` (unique)
- `{ boundHwid: 1 }`

---

### 2.4 Collection: `user_rooms`
Dedicated isolated sandbox allocated to each user upon license activation.
```json
{
  "_id": "ObjectId",
  "roomId": "String (unique, indexed, cryptographically secure UUIDv4)",
  "userId": "ObjectId (unique, indexed, reference to users._id)",
  "licenseKey": "String (indexed)",
  "ownerHwid": "String",
  "roomName": "String ('Personal Dice Sanctuary')",
  "rollsState": "Array (5 sequential rolls of 4 dice colors each)",
  "predictionHistory": "Array of Object (latest 50 calculated targets)",
  "settings": {
    "soundEnabled": "Boolean",
    "theme": "String ('cyber_purple')",
    "autoCalculate": "Boolean"
  },
  "updatedAt": "Date",
  "createdAt": "Date"
}
```
**Indexes:**
- `{ roomId: 1 }` (unique)
- `{ userId: 1 }` (unique)

---

### 2.5 Collection: `sessions`
Cryptographically secure session records replacing predictable pseudo-tokens.
```json
{
  "_id": "ObjectId",
  "sessionToken": "String (unique, indexed, 64-char hex SHA-256 hash)",
  "userId": "String (indexed)",
  "role": "String ('OWNER' | 'VIP' | 'USER')",
  "hwid": "String",
  "ipHash": "String",
  "userAgent": "String",
  "expiresAt": "Date (TTL Index - auto document removal)",
  "isValid": "Boolean (default: true)",
  "createdAt": "Date"
}
```
**Indexes:**
- `{ sessionToken: 1 }` (unique)
- `{ userId: 1 }`
- `{ expiresAt: 1 }` (expireAfterSeconds: 0)

---

### 2.6 Collection: `system_settings`
Global system flags including maintenance mode and operational parameters.
```json
{
  "_id": "ObjectId",
  "key": "String (unique, indexed)",
  "value": "Object",
  "updatedBy": "String",
  "updatedAt": "Date"
}
```

---

### 2.7 Collection: `announcements`
Real-time system broadcast messages.
```json
{
  "_id": "ObjectId",
  "text": "String",
  "type": "String ('info' | 'warning' | 'alert' | 'event')",
  "active": "Boolean (default: false)",
  "broadcastTimestamp": "Number",
  "author": "String",
  "createdAt": "Date"
}
```

---

### 2.8 Collection: `audit_logs`
Immutable administrative and security event logs.
```json
{
  "_id": "ObjectId",
  "action": "String",
  "actor": "String",
  "actorRole": "String",
  "ip": "String",
  "hwid": "String",
  "details": "Object",
  "timestamp": "Date (default: Date.now)"
}
```
**Indexes:**
- `{ action: 1 }`
- `{ timestamp: -1 }`

---

### 2.9 Collection: `migration_records`
Audit trial for the Firebase to MongoDB license ingestion.
```json
{
  "_id": "ObjectId",
  "source": "String ('Firebase Realtime Database')",
  "batchId": "String",
  "totalSourceRecords": "Number",
  "eligibleCount": "Number",
  "excludedCount": "Number",
  "status": "String ('COMPLETED')",
  "importedAt": "Date"
}
```
