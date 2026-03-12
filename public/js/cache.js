// cache.js - Data Cache Management with IndexedDB Persistence and LRU Eviction

/**
 * Cache Manager with IndexedDB persistence, LRU eviction, and configurable TTL
 */
const Cache = {
  data: {},
  timestamps: {},
  pending: {},
  accessOrder: [], // LRU tracking
  maxSize: 100, // Maximum entries before LRU eviction
  defaultTTL: 30000, // 30 seconds default TTL (increased from 5s)
  dbName: 'HabitTrackerCache',
  dbVersion: 1,
  db: null,
  dbReady: false,

  /**
   * Initialize IndexedDB for persistent storage
   * @returns {Promise<void>}
   */
  async initDB() {
    if (this.dbReady) return;
    if (typeof indexedDB === 'undefined') {
      console.warn('[Cache] IndexedDB not available, using memory-only cache');
      this.dbReady = true;
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.warn('[Cache] IndexedDB open failed:', request.error);
        this.dbReady = true;
        resolve();
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.dbReady = true;
        console.debug('[Cache] IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
      };
    });
  },

  /**
   * Persist entry to IndexedDB
   * @param {string} key - Cache key
   * @param {any} value - Cache value
   * @param {number} ttl - TTL in milliseconds
   */
  async persistToDB(key, value, ttl) {
    if (!this.db) return;

    try {
      const tx = this.db.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      store.put({
        key,
        value,
        timestamp: Date.now(),
        ttl: ttl || this.defaultTTL
      });
    } catch (e) {
      console.warn('[Cache] Failed to persist to IndexedDB:', e);
    }
  },

  /**
   * Load entry from IndexedDB
   * @param {string} key - Cache key
   * @returns {Promise<any|null>}
   */
  async loadFromDB(key) {
    if (!this.db) return null;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('cache', 'readonly');
        const store = tx.objectStore('cache');
        const request = store.get(key);

        request.onsuccess = () => {
          const entry = request.result;
          if (!entry) {
            resolve(null);
            return;
          }

          // Check if expired
          const age = Date.now() - entry.timestamp;
          if (age > entry.ttl) {
            // Delete expired entry
            this.deleteFromDB(key);
            resolve(null);
            return;
          }

          resolve(entry.value);
        };

        request.onerror = () => {
          resolve(null);
        };
      } catch (e) {
        console.warn('[Cache] Failed to load from IndexedDB:', e);
        resolve(null);
      }
    });
  },

  /**
   * Delete entry from IndexedDB
   * @param {string} key - Cache key
   */
  async deleteFromDB(key) {
    if (!this.db) return;

    try {
      const tx = this.db.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      store.delete(key);
    } catch (e) {
      console.warn('[Cache] Failed to delete from IndexedDB:', e);
    }
  },

  /**
   * Get TTL for a key
   * @param {string} key - Cache key
   * @returns {number} - TTL in milliseconds
   */
  getTTL(key) {
    // Custom TTL based on resource type
    if (key.includes('/api/habits/streaks')) return 60000; // 1 minute
    if (key.includes('/api/stats/')) return 60000; // 1 minute
    if (key.includes('/api/habits')) return 120000; // 2 minutes
    if (key.includes('/api/stream')) return 10000; // 10 seconds (real-time data)
    if (key.includes('/api/heatmap')) return 300000; // 5 minutes
    return this.defaultTTL;
  },

  /**
   * Update LRU access order
   * @param {string} key - Cache key
   */
  updateLRU(key) {
    // Remove from current position
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    // Add to end (most recently used)
    this.accessOrder.push(key);

    // Evict if over max size
    while (this.accessOrder.length > this.maxSize) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey && oldestKey !== key) {
        this.delete(oldestKey);
      }
    }
  },

  /**
   * Get cached data
   * @param {string} key - Cache key
   * @returns {any|null} - Cached data or null
   */
  get(key) {
    const now = Date.now();
    const entry = this.data[key];
    const ttl = this.getTTL(key);

    if (entry && (now - this.timestamps[key]) < ttl) {
      this.updateLRU(key);
      console.debug(`[Cache] Hit: ${key}`);
      return entry;
    }

    // Clean up expired entry
    if (entry) {
      this.delete(key);
    }

    console.debug(`[Cache] Miss: ${key}`);
    return null;
  },

  /**
   * Get cached data with IndexedDB fallback
   * @param {string} key - Cache key
   * @returns {Promise<any|null>}
   */
  async getAsync(key) {
    // Check memory cache first
    const memoryCached = this.get(key);
    if (memoryCached !== null) {
      return memoryCached;
    }

    // Check IndexedDB
    const dbCached = await this.loadFromDB(key);
    if (dbCached !== null) {
      // Restore to memory cache
      this.data[key] = dbCached;
      this.timestamps[key] = Date.now();
      this.updateLRU(key);
      console.debug(`[Cache] Restored from IndexedDB: ${key}`);
      return dbCached;
    }

    return null;
  },

  /**
   * Set cache data
   * @param {string} key - Cache key
   * @param {any} value - Data to cache
   * @param {number} ttl - Optional custom TTL
   */
  set(key, value, ttl) {
    const effectiveTTL = ttl || this.getTTL(key);

    this.data[key] = value;
    this.timestamps[key] = Date.now();
    this.updateLRU(key);

    // Persist to IndexedDB (async, non-blocking)
    this.persistToDB(key, value, effectiveTTL);

    console.debug(`[Cache] Set: ${key} (TTL: ${effectiveTTL}ms)`);
  },

  /**
   * Check if cache has key
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  },

  /**
   * Delete cache entry
   * @param {string} key - Cache key
   */
  delete(key) {
    delete this.data[key];
    delete this.timestamps[key];

    // Remove from LRU order
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }

    // Remove from IndexedDB
    this.deleteFromDB(key);

    console.debug(`[Cache] Delete: ${key}`);
  },

  /**
   * Invalidate cache entries matching pattern
   * @param {string} pattern - Pattern to match (substring match)
   */
  invalidate(pattern) {
    const keys = Object.keys(this.data);
    let count = 0;

    for (const key of keys) {
      if (!pattern || key.includes(pattern)) {
        this.delete(key);
        count++;
      }
    }

    if (count > 0) {
      console.debug(`[Cache] Invalidated ${count} entries matching: ${pattern || '*'}`);
    }
  },

  /**
   * Invalidate all cache entries related to a specific resource
   * @param {string} resourceType - Type of resource (e.g., 'habits', 'checkins', 'logs')
   */
  invalidateRelated(resourceType) {
    const relatedPatterns = {
      'habits': ['habits', 'streak', 'badges', 'progress'],
      'checkins': ['checkins', 'streak', 'history', 'heatmap', 'progress', 'timeline', 'stream', 'stats'],
      'logs': ['logs', 'timeline', 'stream']
    };

    const patterns = relatedPatterns[resourceType] || [resourceType];

    for (const pattern of patterns) {
      this.invalidate(pattern);
    }

    console.debug(`[Cache] Invalidated all entries related to: ${resourceType}`);
  },

  /**
   * Clear all cache (memory and IndexedDB)
   */
  async clear() {
    this.data = {};
    this.timestamps = {};
    this.accessOrder = [];

    // Clear IndexedDB
    if (this.db) {
      try {
        const tx = this.db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        store.clear();
        console.debug('[Cache] Cleared IndexedDB');
      } catch (e) {
        console.warn('[Cache] Failed to clear IndexedDB:', e);
      }
    }

    console.debug('[Cache] Cleared all');
  },

  /**
   * Get or fetch data (with deduplication and IndexedDB fallback)
   * @param {string} key - Cache key
   * @param {Function} fetcher - Async function to fetch data
   * @returns {Promise<any>}
   */
  async getOrFetch(key, fetcher) {
    // Check memory cache first
    const memoryCached = this.get(key);
    if (memoryCached !== null) {
      return memoryCached;
    }

    // Check IndexedDB
    const dbCached = await this.loadFromDB(key);
    if (dbCached !== null) {
      this.data[key] = dbCached;
      this.timestamps[key] = Date.now();
      this.updateLRU(key);
      return dbCached;
    }

    // Check if there's a pending request
    if (this.pending[key]) {
      console.debug(`[Cache] Waiting for pending: ${key}`);
      return this.pending[key];
    }

    // Start new fetch
    console.debug(`[Cache] Fetching: ${key}`);
    this.pending[key] = fetcher();

    try {
      const data = await this.pending[key];
      this.set(key, data);
      return data;
    } finally {
      delete this.pending[key];
    }
  },

  /**
   * Get cache statistics
   * @returns {Object}
   */
  stats() {
    return {
      memoryEntries: Object.keys(this.data).length,
      keys: Object.keys(this.data),
      pending: Object.keys(this.pending).length,
      lruSize: this.accessOrder.length,
      maxSize: this.maxSize,
      hasIndexedDB: !!this.db
    };
  },

  /**
   * Configure cache settings
   * @param {Object} options - Configuration options
   */
  configure(options = {}) {
    if (options.maxSize) this.maxSize = options.maxSize;
    if (options.defaultTTL) this.defaultTTL = options.defaultTTL;
    console.debug('[Cache] Configured:', options);
  }
};

// Initialize IndexedDB on load
if (typeof window !== 'undefined') {
  Cache.initDB().catch(e => console.warn('[Cache] Init failed:', e));
}

// CommonJS export (for Node.js/testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Cache;
}