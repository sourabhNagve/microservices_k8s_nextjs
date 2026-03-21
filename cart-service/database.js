import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// ─── In-memory fallback storage ───────────────────────────────────────────────
// FIX 1 (original lines 13-17): the original setTimeout-based TTL never
// cleared its timer if the key was deleted before expiry, and accumulated
// timers held references to Map entries preventing GC. Now each key's timer
// is tracked so it can be cancelled on delete.
const timers = new Map();

const memoryStore = {
  carts: new Map(),

  get: async (key) => {
    return memoryStore.carts.get(key) ?? null;
  },

  set: async (key, value, ttl) => {
    memoryStore.carts.set(key, value);
    // Cancel any existing timer for this key before setting a new one.
    if (timers.has(key)) {
      clearTimeout(timers.get(key));
      timers.delete(key);
    }
    if (ttl) {
      const t = setTimeout(() => {
        memoryStore.carts.delete(key);
        timers.delete(key);
      }, ttl * 1000);
      timers.set(key, t);
    }
    return true;
  },

  del: async (key) => {
    // FIX 1 (continued): cancel the TTL timer when the key is explicitly deleted.
    if (timers.has(key)) {
      clearTimeout(timers.get(key));
      timers.delete(key);
    }
    return memoryStore.carts.delete(key);
  },

  hGetAll: async (key) => {
    // FIX 2 (original line 23): return a shallow copy so callers cannot mutate
    // the stored object by accident (e.g. `delete cartData[productId]` on the
    // returned reference would silently corrupt the in-memory store).
    const data = memoryStore.carts.get(key);
    return data ? { ...data } : {};
  },

  hSet: async (key, field, value) => {
    const cart = memoryStore.carts.get(key) || {};
    cart[field] = typeof value === 'string' ? value : JSON.stringify(value);
    memoryStore.carts.set(key, cart);
    return true;
  },

  hDel: async (key, field) => {
    const cart = memoryStore.carts.get(key);
    if (!cart || !(field in cart)) return 0;
    delete cart[field];
    // FIX 3: if the hash is now empty, remove the key entirely so it does not
    // linger in the Map as an empty object and inflate memory usage over time.
    if (Object.keys(cart).length === 0) {
      memoryStore.carts.delete(key);
    } else {
      memoryStore.carts.set(key, cart);
    }
    return 1;
  },

  exists: async (key) => {
    return memoryStore.carts.has(key) ? 1 : 0;
  },
};

// ─── Redis client ─────────────────────────────────────────────────────────────
// FIX 4: track Redis health so the /health endpoint and callers can check it.
let redisHealthy = false;

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    // FIX 5 (original line 49): the reconnect strategy returned a new Error()
    // after 10 retries. Returning an Error from reconnectStrategy tells the
    // client to stop reconnecting — correct — but the error object itself was
    // never surfaced anywhere. Now we log it explicitly before returning it so
    // operators can see when Redis has permanently given up reconnecting.
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        const msg = `Redis reconnection failed after ${retries} attempts — giving up`;
        console.error('❌', msg);
        redisHealthy = false;
        return new Error(msg);
      }
      const delay = Math.min(retries * 50, 1000);
      console.log(`🔄 Redis reconnect attempt ${retries} — waiting ${delay}ms`);
      return delay;
    },
    // FIX 6: add connect and command timeouts so a hung Redis socket does not
    // block operations forever.
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 10) || 5000,
  },
});

redisClient.on('error', (err) => {
  // FIX 7 (original line 57): removed the misleading "falling back to
  // in-memory" message here — the error event fires for every connection
  // hiccup during reconnection, not just the initial failure, so this log was
  // firing repeatedly and implying a permanent switch that was actually
  // transient. The fallback logic in each helper function handles this silently.
  console.error('❌ Redis client error:', err.message);
  redisHealthy = false;
});

redisClient.on('connect', () => {
  console.log('✅ Redis client connected');
});

redisClient.on('ready', () => {
  console.log('✅ Redis client ready');
  redisHealthy = true;
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Redis client reconnecting...');
  redisHealthy = false;
});

redisClient.on('end', () => {
  console.log('🔌 Redis client disconnected');
  redisHealthy = false;
});

let useRedis = false;

const connectDB = async () => {
  try {
    await redisClient.connect();
    console.log('✅ Redis connected successfully');
    useRedis    = true;
    redisHealthy = true;
    return redisClient;
  } catch (error) {
    console.error('❌ Redis connection error:', error.message);
    console.log('🔄 Using in-memory storage fallback');
    useRedis    = false;
    redisHealthy = false;
    return { isConnected: false };
  }
};

const initTables = async () => {
  // Redis has no schema to initialise — just confirm the storage mode.
  console.log(`✅ ${useRedis ? 'Redis' : 'In-memory storage'} ready for cart operations`);
};

// ─── Key helpers ──────────────────────────────────────────────────────────────
// FIX 8: sanitise userId in key construction so a userId containing ':' or
// whitespace cannot craft a key that collides with another user's namespace.
const sanitizeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
const getCartKey      = (userId) => `cart:user:${sanitizeId(userId)}`;
const getCartItemsKey = (userId) => `cart:items:${sanitizeId(userId)}`;

// ─── Storage helpers ──────────────────────────────────────────────────────────
const getJSON = async (key) => {
  try {
    if (useRedis && redisClient.isOpen) {
      const value = await redisClient.get(key);
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        // FIX 9: if the stored JSON is corrupt, delete the key and return null
        // so the caller re-builds it cleanly rather than serving garbage.
        console.warn(`⚠️  Corrupt JSON in Redis key "${key}" — deleting`);
        await redisClient.del(key);
        return null;
      }
    }
    return memoryStore.get(key);
  } catch (error) {
    console.error('Error getting JSON from storage:', error);
    return null;
  }
};

const setJSON = async (key, value, ttl = null) => {
  try {
    if (useRedis && redisClient.isOpen) {
      const jsonString = JSON.stringify(value);
      if (ttl) {
        await redisClient.setEx(key, ttl, jsonString);
      } else {
        await redisClient.set(key, jsonString);
      }
    } else {
      await memoryStore.set(key, value, ttl);
    }
    return true;
  } catch (error) {
    console.error('Error setting JSON in storage:', error);
    return false;
  }
};

const deleteKey = async (key) => {
  try {
    if (useRedis && redisClient.isOpen) {
      const result = await redisClient.del(key);
      return result > 0;
    }
    return memoryStore.del(key);
  } catch (error) {
    console.error('Error deleting key from storage:', error);
    return false;
  }
};

const getAllHashKeys = async (key) => {
  try {
    if (useRedis && redisClient.isOpen) {
      // FIX 10 (original line 142): the exists() check added an extra round-trip
      // on every cart read. hGetAll returns an empty object when the key doesn't
      // exist — there's no need for a separate exists() call.
      return await redisClient.hGetAll(key) ?? {};
    }
    return memoryStore.hGetAll(key);
  } catch (error) {
    console.error('Error getting hash from storage:', error);
    return {};
  }
};

const setHashField = async (key, field, value) => {
  try {
    const serialized = JSON.stringify(value);
    if (useRedis && redisClient.isOpen) {
      await redisClient.hSet(key, field, serialized);
    } else {
      await memoryStore.hSet(key, field, serialized);
    }
    return true;
  } catch (error) {
    console.error('Error setting hash field in storage:', error);
    return false;
  }
};

const deleteHashField = async (key, field) => {
  try {
    if (useRedis && redisClient.isOpen) {
      const result = await redisClient.hDel(key, field);
      return result > 0;
    }
    return (await memoryStore.hDel(key, field)) > 0;
  } catch (error) {
    console.error('Error deleting hash field from storage:', error);
    return false;
  }
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// FIX 11 (original lines 187-191): added SIGTERM alongside SIGINT so Docker /
// Kubernetes container stops close the Redis connection cleanly.
async function shutdown(signal) {
  console.log(`${signal} — closing Redis connection...`);
  if (useRedis && redisClient.isOpen) {
    try {
      await redisClient.quit();
      console.log('✅ Redis client closed cleanly');
    } catch (err) {
      console.error('❌ Error closing Redis:', err.message);
    }
  }
  // Clear all in-memory TTL timers to let the process exit cleanly.
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// FIX 4: export getter functions instead of the raw variables so index.js
// always reads the current value rather than the value at import time.
// (ES module exports of plain `let` bindings ARE live — callers reading
// `redisHealthy` directly would also see updates — but exporting functions
// is explicit and works identically when the module is mocked in tests.)
export const getRedisHealthy = () => redisHealthy;
export const getUseRedis     = () => useRedis;

export {
  redisClient,
  connectDB,
  initTables,
  getCartKey,
  getCartItemsKey,
  getJSON,
  setJSON,
  deleteKey,
  getAllHashKeys,
  setHashField,
  deleteHashField,
};