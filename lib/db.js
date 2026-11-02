// ==============================================================================
// HEADLESS DICE — CENTRALIZED MONGODB ATLAS DATABASE CLIENT
// Serverless Context Connection Pooling & Schema Collection Manager
// ==============================================================================

const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch(e) {}

const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

let cachedClient = null;
let cachedDb = null;
let indexesInitialized = false;

const DB_NAME = 'headless_dice';

function loadEnvIfPresent() {
  if (process.env.MONGODB_URI) return;
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
}
loadEnvIfPresent();

/**
 * Returns connection pool to MongoDB Atlas with Lambda context reuse.
 */
async function getDb() {
  const DEFAULT_ATLAS_URI = 'mongodb+srv://luckybhaiop7890_db_user:WIgzs2S6a62GieYz@dice.kb3ays5.mongodb.net/headless_dice?retryWrites=true&w=majority&appName=dice';
  const uri = process.env.MONGODB_URI || DEFAULT_ATLAS_URI;

  if (uri && uri.trim() !== '') {
    if (cachedClient && cachedDb) {
      return { client: cachedClient, db: cachedDb, isAtlas: true };
    }

    try {
      const client = new MongoClient(uri, {
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 10000,
      });

      await client.connect();
      const db = client.db(DB_NAME);

      cachedClient = client;
      cachedDb = db;

      if (!indexesInitialized) {
        indexesInitialized = true;
        ensureIndexes(db).catch(e => console.warn('[INDEX_WARN]', e.message));
      }

      return { client: cachedClient, db: cachedDb, isAtlas: true };
    } catch (err) {
      console.warn('[DATABASE ADVISORY] MongoDB Atlas handshake rejected (Check Atlas Network Access for 0.0.0.0/0):', err.message);
      // Fallback to secure local store containing all 14 migrated HWID-bound licenses and owner accounts
      const memoryDb = getLocalMemoryAdapter();
      return { client: null, db: memoryDb, isAtlas: false, atlasError: err.message };
    }
  }

  const memoryDb = getLocalMemoryAdapter();
  return { client: null, db: memoryDb, isAtlas: false };
}

/**
 * Initializes strict unique indexes on MongoDB collections.
 */
async function ensureIndexes(db) {
  try {
    await db.collection('users').createIndex({ username: 1 }, { unique: true, sparse: true });
    await db.collection('users').createIndex({ licenseKey: 1 }, { unique: true });
    await db.collection('users').createIndex({ roomId: 1 }, { unique: true });
    await db.collection('users').createIndex({ boundHwid: 1 });

    await db.collection('licenses').createIndex({ key: 1 }, { unique: true });
    await db.collection('licenses').createIndex({ boundHwid: 1 });
    await db.collection('licenses').createIndex({ status: 1 });

    await db.collection('owner_accounts').createIndex({ ownerId: 1 }, { unique: true });
    await db.collection('owner_accounts').createIndex({ username: 1 }, { unique: true });

    await db.collection('user_rooms').createIndex({ roomId: 1 }, { unique: true });
    await db.collection('user_rooms').createIndex({ userId: 1 }, { unique: true });

    await db.collection('sessions').createIndex({ sessionToken: 1 }, { unique: true });
    await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    await db.collection('system_settings').createIndex({ key: 1 }, { unique: true });
    await db.collection('audit_logs').createIndex({ timestamp: -1 });
  } catch (err) {
    console.warn('[DB WARNING] Index creation warning:', err.message);
  }
}

// ------------------------------------------------------------------------------
// Local Memory / File Adapter for Offline & High-Availability Fallback
// ------------------------------------------------------------------------------
let localStore = null;

function loadLocalStore() {
  if (localStore) return localStore;
  const storePath = path.join(__dirname, '..', 'api', '_data', 'mongodb_local_mock.json');
  try {
    if (fs.existsSync(storePath)) {
      localStore = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      return localStore;
    }
  } catch(e) {}
  localStore = {
    users: [],
    licenses: [],
    owner_accounts: [],
    user_rooms: [],
    sessions: [],
    system_settings: [
      { key: 'maintenance', value: { enabled: false, updatedAt: Date.now() } },
      { key: 'control', value: { timestamp: 1730538000000 } }
    ],
    announcements: [],
    audit_logs: [],
    migration_records: []
  };
  return localStore;
}

function saveLocalStore() {
  if (!localStore) return;
  const storePath = path.join(__dirname, '..', 'api', '_data', 'mongodb_local_mock.json');
  try {
    fs.writeFileSync(storePath, JSON.stringify(localStore, null, 2), 'utf8');
  } catch(e) {}
}

function getLocalMemoryAdapter() {
  const store = loadLocalStore();

  return {
    collection: (name) => {
      if (!store[name]) store[name] = [];
      const col = store[name];

      return {
        findOne: async (query) => {
          return col.find(doc => matchQuery(doc, query)) || null;
        },
        find: (query = {}) => {
          const res = col.filter(doc => matchQuery(doc, query));
          return {
            toArray: async () => res,
            sort: () => ({ toArray: async () => res }),
            limit: (n) => ({ toArray: async () => res.slice(0, n) })
          };
        },
        insertOne: async (doc) => {
          const newDoc = { _id: new ObjectId(), ...doc, createdAt: doc.createdAt || new Date() };
          col.push(newDoc);
          saveLocalStore();
          return { insertedId: newDoc._id, acknowledged: true };
        },
        updateOne: async (query, update) => {
          const idx = col.findIndex(doc => matchQuery(doc, query));
          if (idx !== -1) {
            if (update.$set) Object.assign(col[idx], update.$set);
            if (update.$inc) {
              for (const [k, v] of Object.entries(update.$inc)) {
                col[idx][k] = (col[idx][k] || 0) + v;
              }
            }
            saveLocalStore();
            return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
          }
          return { matchedCount: 0, modifiedCount: 0, acknowledged: true };
        },
        findOneAndUpdate: async (query, update, opts = {}) => {
          const idx = col.findIndex(doc => matchQuery(doc, query));
          if (idx !== -1) {
            const original = { ...col[idx] };
            if (update.$set) Object.assign(col[idx], update.$set);
            saveLocalStore();
            return { value: opts.returnDocument === 'after' ? col[idx] : original };
          }
          return { value: null };
        },
        deleteOne: async (query) => {
          const idx = col.findIndex(doc => matchQuery(doc, query));
          if (idx !== -1) {
            col.splice(idx, 1);
            saveLocalStore();
            return { deletedCount: 1, acknowledged: true };
          }
          return { deletedCount: 0, acknowledged: true };
        },
        countDocuments: async (query = {}) => {
          return col.filter(doc => matchQuery(doc, query)).length;
        }
      };
    }
  };
}

function matchQuery(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;
  for (const [key, expected] of Object.entries(query)) {
    if (typeof expected === 'object' && expected !== null) {
      if (expected.$in && Array.isArray(expected.$in)) {
        if (!expected.$in.includes(doc[key])) return false;
      } else if (expected.$ne !== undefined) {
        if (doc[key] === expected.$ne) return false;
      }
    } else {
      if (doc[key] !== expected) return false;
    }
  }
  return true;
}

module.exports = {
  getDb,
  ObjectId
};
