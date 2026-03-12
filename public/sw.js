// Service Worker for Habit Tracker PWA
// Enhanced version with offline-first strategy and background sync

const CACHE_NAME = 'habit-tracker-v6';
const API_CACHE_NAME = 'habit-tracker-api-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/config.js',
  '/js/utils.js',
  '/js/cache.js',
  '/js/api.js',
  '/js/components.js',
  '/js/app.js',
  '/js/performance.js',
  '/js/tiptap-bundle.js',
  '/manifest.json'
];

// API endpoints to cache with TTL (in milliseconds)
const API_CACHE_CONFIG = {
  '/api/habits': { ttl: 60000 },       // 1 minute
  '/api/habits/streaks': { ttl: 30000 }, // 30 seconds
  '/api/stats': { ttl: 60000 },          // 1 minute
  '/api/logs': { ttl: 30000 }            // 30 seconds
};

// Pending operations for background sync
let pendingOperations = [];

// =====================
// Install Event
// =====================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        // Load pending operations from IndexedDB
        return loadPendingOperations();
      })
      .then(() => {
        console.log('[SW] Service worker installed');
        return self.skipWaiting();
      })
  );
});

// =====================
// Activate Event
// =====================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim();
    })
  );
});

// =====================
// Fetch Event
// =====================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // API requests: network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request, url));
    return;
  }

  // Static assets: cache first, then network
  event.respondWith(handleStaticRequest(request));
});

/**
 * Handle API requests with network-first strategy
 * @param {Request} request - The request object
 * @param {URL} url - The URL object
 * @returns {Response} - The response
 */
async function handleApiRequest(request, url) {
  const method = request.method.toUpperCase();

  // For write operations, try network first, queue if offline
  if (['POST', 'PUT', 'DELETE'].includes(method)) {
    try {
      const response = await fetch(request);
      // Invalidate related caches after successful write
      await invalidateApiCache(url.pathname);
      return response;
    } catch (error) {
      // Queue operation for background sync
      if ('sync' in self.registration) {
        await queueOperation(request);
        return new Response(JSON.stringify({
          queued: true,
          message: '操作已保存，将在网络恢复后同步'
        }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return createOfflineResponse();
    }
  }

  // For GET requests, use network-first with cache
  const cacheConfig = findCacheConfig(url.pathname);

  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok && cacheConfig) {
      const responseClone = response.clone();
      const cache = await caches.open(API_CACHE_NAME);

      // Add timestamp for TTL checking
      const headers = new Headers(responseClone.headers);
      headers.set('x-cache-timestamp', Date.now().toString());

      const cachedResponse = new Response(await responseClone.blob(), {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });

      cache.put(request, cachedResponse);
    }

    return response;
  } catch (error) {
    // Try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse && cacheConfig) {
      // Check TTL
      const timestamp = parseInt(cachedResponse.headers.get('x-cache-timestamp') || '0');
      if (Date.now() - timestamp < cacheConfig.ttl) {
        console.log('[SW] Serving from cache:', url.pathname);
        return cachedResponse;
      }
    }

    return createOfflineResponse();
  }
}

/**
 * Handle static asset requests with cache-first strategy
 * @param {Request} request - The request object
 * @returns {Response} - The response
 */
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    // Return cached version, update in background
    updateCacheInBackground(request);
    return cachedResponse;
  }

  // Not in cache, fetch from network
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const cachedIndex = await caches.match('/index.html');
      if (cachedIndex) {
        return cachedIndex;
      }
    }
    return new Response('离线状态', { status: 503 });
  }
}

/**
 * Update cache in background
 * @param {Request} request - The request object
 */
async function updateCacheInBackground(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response);
    }
  } catch (e) {
    // Ignore network errors for background updates
  }
}

/**
 * Find cache configuration for a pathname
 * @param {string} pathname - The API pathname
 * @returns {Object|null} - Cache config or null
 */
function findCacheConfig(pathname) {
  for (const [pattern, config] of Object.entries(API_CACHE_CONFIG)) {
    if (pathname.startsWith(pattern)) {
      return config;
    }
  }
  return null;
}

/**
 * Invalidate API cache after write operations
 * @param {string} pathname - The API pathname
 */
async function invalidateApiCache(pathname) {
  const cache = await caches.open(API_CACHE_NAME);

  // Invalidate habits cache for any habit-related write
  if (pathname.includes('/habits') || pathname.includes('/checkin')) {
    const keys = await cache.keys();
    for (const key of keys) {
      if (key.url.includes('/api/habits') || key.url.includes('/api/stats')) {
        await cache.delete(key);
      }
    }
  }

  // Invalidate logs cache
  if (pathname.includes('/logs')) {
    const keys = await cache.keys();
    for (const key of keys) {
      if (key.url.includes('/api/logs')) {
        await cache.delete(key);
      }
    }
  }
}

/**
 * Create offline response
 * @returns {Response} - Offline response
 */
function createOfflineResponse() {
  return new Response(JSON.stringify({
    error: '离线状态',
    message: '请检查网络连接后重试'
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// =====================
// Background Sync
// =====================

/**
 * Queue an operation for background sync
 * @param {Request} request - The request object
 */
async function queueOperation(request) {
  const operation = {
    id: Date.now().toString(),
    url: request.url,
    method: request.method,
    headers: {},
    body: null,
    timestamp: Date.now()
  };

  // Clone headers
  for (const [key, value] of request.headers.entries()) {
    operation.headers[key] = value;
  }

  // Clone body if present
  if (request.body) {
    operation.body = await request.clone().text();
  }

  pendingOperations.push(operation);
  await savePendingOperations();

  // Register for background sync
  if ('sync' in self.registration) {
    await self.registration.sync.register('sync-operations');
  }
}

/**
 * Process queued operations
 */
async function processQueuedOperations() {
  console.log('[SW] Processing queued operations:', pendingOperations.length);

  const failed = [];

  for (const op of pendingOperations) {
    try {
      const response = await fetch(op.url, {
        method: op.method,
        headers: op.headers,
        body: op.body
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      console.log('[SW] Synced operation:', op.id);
    } catch (error) {
      console.warn('[SW] Failed to sync operation:', op.id, error);
      failed.push(op);
    }
  }

  // Keep failed operations for next sync
  pendingOperations = failed;
  await savePendingOperations();

  // Notify clients of sync completion
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_COMPLETE',
      synced: pendingOperations.length - failed.length,
      failed: failed.length
    });
  });
}

// Listen for background sync event
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-operations') {
    event.waitUntil(processQueuedOperations());
  }
});

// =====================
// IndexedDB for Pending Operations
// =====================

/**
 * Open IndexedDB
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HabitTrackerSW', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending', { keyPath: 'id' });
      }
    };
  });
}

/**
 * Save pending operations to IndexedDB
 */
async function savePendingOperations() {
  const db = await openDB();
  const tx = db.transaction('pending', 'readwrite');
  const store = tx.objectStore('pending');

  // Clear existing
  await store.clear();

  // Add current operations
  for (const op of pendingOperations) {
    await store.add(op);
  }

  db.close();
}

/**
 * Load pending operations from IndexedDB
 */
async function loadPendingOperations() {
  try {
    const db = await openDB();
    const tx = db.transaction('pending', 'readonly');
    const store = tx.objectStore('pending');

    pendingOperations = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    db.close();
    console.log('[SW] Loaded pending operations:', pendingOperations.length);
  } catch (error) {
    console.warn('[SW] Failed to load pending operations:', error);
    pendingOperations = [];
  }
}

// =====================
// Message Handling
// =====================

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_PENDING_COUNT':
      event.ports[0]?.postMessage({
        count: pendingOperations.length
      });
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.keys().then(names => {
          return Promise.all(names.map(name => caches.delete(name)));
        }).then(() => {
          event.ports[0]?.postMessage({ cleared: true });
        })
      );
      break;

    case 'GET_CACHE_STATUS':
      event.waitUntil(
        caches.keys().then(async (names) => {
          const status = {};
          for (const name of names) {
            const cache = await caches.open(name);
            const keys = await cache.keys();
            status[name] = keys.length;
          }
          event.ports[0]?.postMessage(status);
        })
      );
      break;
  }
});

console.log('[SW] Service worker loaded');