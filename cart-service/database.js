import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// In-memory fallback storage
const memoryStore = {
  carts: new Map(),
  summaries: new Map(),
  get: async (key) => {
    return memoryStore.carts.get(key) || null;
  },
  set: async (key, value, ttl) => {
    memoryStore.carts.set(key, value);
    if (ttl) {
      setTimeout(() => memoryStore.carts.delete(key), ttl * 1000);
    }
    return true;
  },
  del: async (key) => {
    return memoryStore.carts.delete(key);
  },
  hGetAll: async (key) => {
    const data = memoryStore.carts.get(key) || {};
    return data;
  },
  hSet: async (key, field, value) => {
    const cart = memoryStore.carts.get(key) || {};
    cart[field] = typeof value === 'string' ? value : JSON.stringify(value);
    memoryStore.carts.set(key, cart);
    return true;
  },
  hDel: async (key, field) => {
    const cart = memoryStore.carts.get(key) || {};
    delete cart[field];
    memoryStore.carts.set(key, cart);
    return 1;
  },
  exists: async (key) => {
    return memoryStore.carts.has(key) ? 1 : 0;
  }
};

// Create Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis reconnection failed after 10 attempts');
        return new Error('Redis reconnection failed');
      }
      return Math.min(retries * 50, 1000);
    }
  }
});

// Handle Redis connection events
redisClient.on('error', (err) => {
  console.error('❌ Redis Client Error:', err);
  console.log('🔄 Falling back to in-memory storage');
});

redisClient.on('connect', () => {
  console.log('✅ Redis client connected');
});

redisClient.on('ready', () => {
  console.log('✅ Redis client ready');
});

redisClient.on('end', () => {
  console.log('🔌 Redis client disconnected');
});

let useRedis = false;

const connectDB = async () => {
  try {
    await redisClient.connect();
    console.log('✅ Redis connected successfully');
    useRedis = true;
    return redisClient;
  } catch (error) {
    console.error('❌ Redis connection error:', error);
    console.log('🔄 Using in-memory storage fallback');
    useRedis = false;
    return { isConnected: false };
  }
};

const initTables = async () => {
  try {
    // Redis doesn't need table initialization
    console.log(`✅ ${useRedis ? 'Redis' : 'In-memory storage'} ready for cart operations`);
  } catch (error) {
    console.error('❌ Error initializing storage:', error);
    throw error;
  }
};

// Redis utility functions
const getCartKey = (userId) => `cart:user:${userId}`;
const getCartItemsKey = (userId) => `cart:items:${userId}`;

// Helper functions for storage operations
const getJSON = async (key) => {
  try {
    if (useRedis && redisClient.isOpen) {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } else {
      return memoryStore.get(key);
    }
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
    } else {
      return await memoryStore.del(key);
    }
  } catch (error) {
    console.error('Error deleting key from storage:', error);
    return false;
  }
};

const getAllHashKeys = async (key) => {
  try {
    if (useRedis && redisClient.isOpen) {
      const exists = await redisClient.exists(key);
      if (!exists) return {};
      
      const hashData = await redisClient.hGetAll(key);
      return hashData;
    } else {
      return await memoryStore.hGetAll(key);
    }
  } catch (error) {
    console.error('Error getting hash from storage:', error);
    return {};
  }
};

const setHashField = async (key, field, value) => {
  try {
    if (useRedis && redisClient.isOpen) {
      await redisClient.hSet(key, field, JSON.stringify(value));
    } else {
      await memoryStore.hSet(key, field, JSON.stringify(value));
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
    } else {
      return await memoryStore.hDel(key, field);
    }
  } catch (error) {
    console.error('Error deleting hash field from storage:', error);
    return false;
  }
};

process.on('SIGINT', async () => {
  if (useRedis && redisClient.isOpen) {
    await redisClient.quit();
    console.log('Redis client closed');
  }
  process.exit(0);
});

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
  deleteHashField
};
