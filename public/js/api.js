// api.js - API Request Wrapper with Error Handling, Cancellation, and Deduplication

/**
 * @typedef {Object} RequestOptions
 * @property {boolean} [skipDedup] - Skip request deduplication
 * @property {AbortSignal} [signal] - External abort signal
 * @property {number} [timeout] - Request timeout in ms
 * @property {number} [retries] - Number of retries on failure
 */

/**
 * @typedef {Object} ApiError
 * @property {string} message - Error message
 * @property {number} status - HTTP status code
 * @property {string} [code] - Error code
 * @property {any} [details] - Additional error details
 */

/**
 * @typedef {Object} Habit
 * @property {number} id - Habit ID
 * @property {string} name - Habit name
 * @property {string} [icon] - Habit icon emoji
 * @property {string} [description] - Habit description
 * @property {string} category - Habit category
 * @property {string[]} [tags] - Habit tags
 * @property {string} [identity] - Associated identity
 * @property {string} [reminder_period] - Reminder period
 * @property {string} repeat_mode - Repeat mode (new_record/append)
 * @property {number} streak - Current streak count
 * @property {number} max_streak - Maximum streak count
 * @property {string} created_at - Creation timestamp
 */

/**
 * @typedef {Object} Checkin
 * @property {number} id - Checkin ID
 * @property {number} habit_id - Associated habit ID
 * @property {string} date - Checkin date (YYYY-MM-DD)
 * @property {string} [note] - Checkin note
 * @property {string} created_at - Creation timestamp
 */

/**
 * @typedef {Object} Log
 * @property {number} id - Log ID
 * @property {string} content - Log content (HTML)
 * @property {string} date - Log date (YYYY-MM-DD)
 * @property {string} created_at - Creation timestamp
 */

/**
 * @typedef {Object} ApiResponse<T>
 * @property {T} [data] - Response data
 * @property {ApiError} [error] - Error object
 */

/**
 * API Client with retry, error handling, request cancellation, and deduplication
 * @type {{
 *   baseUrl: string,
 *   maxRetries: number,
 *   retryDelay: number,
 *   timeout: number,
 *   pendingRequests: Map<string, Promise<any>>,
 *   abortControllers: Map<string, AbortController>,
 *   setBaseUrl: (url: string) => void,
 *   getRequestKey: (url: string, options?: Object) => string,
 *   cancel: (pattern?: string) => void,
 *   createAbortController: (key: string) => AbortController,
 *   cleanup: (key: string) => void,
 *   request: (url: string, options?: Object, requestOptions?: RequestOptions) => Promise<any>,
 *   get: (url: string, options?: RequestOptions) => Promise<any>,
 *   post: (url: string, data?: Object, options?: RequestOptions) => Promise<any>,
 *   put: (url: string, data?: Object, options?: RequestOptions) => Promise<any>,
 *   delete: (url: string, options?: RequestOptions) => Promise<any>,
 *   stats: () => { pending: number, controllers: number }
 * }}
 */
const API = {
  baseUrl: '',
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 10000,

  // Pending requests for deduplication
  pendingRequests: new Map(),

  // Abort controllers for cancellation
  abortControllers: new Map(),

  /**
   * Set base URL for API requests
   * @param {string} url - Base URL
   */
  setBaseUrl(url) {
    this.baseUrl = url;
  },

  /**
   * Generate a unique request key for deduplication
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @returns {string}
   */
  getRequestKey(url, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(options.body) : '';
    return `${method}:${url}:${body}`;
  },

  /**
   * Cancel a specific request or all requests matching a pattern
   * @param {string} [pattern] - URL pattern to match (optional, cancels all if not provided)
   */
  cancel(pattern) {
    if (!pattern) {
      // Cancel all pending requests
      for (const [key, controller] of this.abortControllers) {
        controller.abort();
      }
      this.abortControllers.clear();
      this.pendingRequests.clear();
      console.debug('[API] Cancelled all requests');
      return;
    }

    // Cancel requests matching pattern
    for (const [key, controller] of this.abortControllers) {
      if (key.includes(pattern)) {
        controller.abort();
        this.abortControllers.delete(key);
        this.pendingRequests.delete(key);
      }
    }
    console.debug(`[API] Cancelled requests matching: ${pattern}`);
  },

  /**
   * Create an abort controller for a request
   * @param {string} key - Request key
   * @returns {AbortController}
   */
  createAbortController(key) {
    const controller = new AbortController();
    this.abortControllers.set(key, controller);
    return controller;
  },

  /**
   * Clean up after request completes
   * @param {string} key - Request key
   */
  cleanup(key) {
    this.abortControllers.delete(key);
    this.pendingRequests.delete(key);
  },

  /**
   * Make HTTP request with error handling, cancellation, and deduplication
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @param {Object} requestOptions - Additional request options
   * @returns {Promise<any>}
   */
  async request(url, options = {}, requestOptions = {}) {
    const fullUrl = this.baseUrl + url;
    const key = this.getRequestKey(url, options);
    const { skipDedup = false, signal: externalSignal } = requestOptions;

    // Check for duplicate pending request (GET requests only by default)
    if (!skipDedup && (options.method || 'GET') === 'GET') {
      const pending = this.pendingRequests.get(key);
      if (pending) {
        console.debug(`[API] Reusing pending request: ${key}`);
        return pending;
      }
    }

    // Create abort controller for this request
    const controller = this.createAbortController(key);
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Combine signals if external signal provided
    let combinedSignal = controller.signal;
    if (externalSignal) {
      // Listen to external abort
      externalSignal.addEventListener('abort', () => controller.abort());
    }

    const requestPromise = (async () => {
      try {
        const response = await fetch(fullUrl, {
          ...options,
          signal: combinedSignal,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await this.parseError(response);
          throw new APIError(error.message, response.status, error.data);
        }

        // Handle empty responses
        const text = await response.text();
        try {
          const json = text ? JSON.parse(text) : null;
          // Unwrap data from unified response format { success: true, data: ... }
          if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
            if (!json.success) {
              throw new APIError(json.error || 'Request failed', response.status);
            }
            return json.data;
          }
          return json;
        } catch (parseErr) {
          if (parseErr instanceof APIError) throw parseErr;
          console.error('[API] JSON parse error:', parseErr.message);
          throw new APIError('Invalid JSON response from server', 500, { raw: text?.slice(0, 200) });
        }

      } catch (err) {
        clearTimeout(timeoutId);

        if (err.name === 'AbortError') {
          throw new APIError('请求已取消或超时', 408);
        }

        if (err instanceof APIError) {
          throw err;
        }

        // Network error
        throw new APIError('网络连接失败，请检查网络设置', 0, err);
      } finally {
        this.cleanup(key);
      }
    })();

    // Store pending request for deduplication
    this.pendingRequests.set(key, requestPromise);

    return requestPromise;
  },

  /**
   * Parse error response
   * @param {Response} response - Fetch response
   * @returns {Promise<Object>}
   */
  async parseError(response) {
    try {
      const data = await response.json();
      return {
        message: data.error || data.message || `HTTP Error ${response.status}`,
        data
      };
    } catch {
      return {
        message: `HTTP Error ${response.status}`,
        data: null
      };
    }
  },

  /**
   * Retry wrapper
   * @param {Function} fn - Async function to retry
   * @param {number} retries - Number of retries
   * @returns {Promise<any>}
   */
  async withRetry(fn, retries = this.maxRetries) {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        // Don't retry on client errors (4xx)
        if (err instanceof APIError && err.status >= 400 && err.status < 500) {
          throw err;
        }

        // Don't retry on abort
        if (err.name === 'AbortError' || (err instanceof APIError && err.status === 408)) {
          throw err;
        }

        if (i === retries - 1) {
          throw err;
        }

        console.warn(`[API] Retry ${i + 1}/${retries}:`, err.message);
        await this.delay(this.retryDelay * (i + 1));
      }
    }
  },

  /**
   * Delay helper
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * GET request
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise<any>}
   */
  async get(url, options = {}) {
    const { useCache = true, signal, skipDedup = false } = options;

    if (useCache && typeof Cache !== 'undefined') {
      return Cache.getOrFetch(url, () => this.withRetry(() =>
        this.request(url, { method: 'GET' }, { signal, skipDedup })
      ));
    }

    return this.withRetry(() =>
      this.request(url, { method: 'GET' }, { signal, skipDedup })
    );
  },

  /**
   * POST request
   * @param {string} url - Request URL
   * @param {Object} body - Request body
   * @param {Object} options - Request options
   * @returns {Promise<any>}
   */
  async post(url, body = {}, options = {}) {
    if (typeof Cache !== 'undefined') {
      Cache.invalidate(url);
    }

    const { signal } = options;
    return this.withRetry(() =>
      this.request(url, {
        method: 'POST',
        body: JSON.stringify(body)
      }, { skipDedup: true, signal })
    );
  },

  /**
   * PUT request
   * @param {string} url - Request URL
   * @param {Object} body - Request body
   * @param {Object} options - Request options
   * @returns {Promise<any>}
   */
  async put(url, body = {}, options = {}) {
    if (typeof Cache !== 'undefined') {
      Cache.invalidate(url);
    }

    const { signal } = options;
    return this.withRetry(() =>
      this.request(url, {
        method: 'PUT',
        body: JSON.stringify(body)
      }, { skipDedup: true, signal })
    );
  },

  /**
   * DELETE request
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise<any>}
   */
  async delete(url, options = {}) {
    if (typeof Cache !== 'undefined') {
      Cache.invalidate(url);
    }

    const { signal } = options;
    return this.withRetry(() =>
      this.request(url, { method: 'DELETE' }, { skipDedup: true, signal })
    );
  },

  /**
   * Get request statistics
   * @returns {Object}
   */
  stats() {
    return {
      pendingCount: this.pendingRequests.size,
      pendingKeys: Array.from(this.pendingRequests.keys()),
      abortControllerCount: this.abortControllers.size
    };
  }
};

/**
 * Custom API Error class
 */
class APIError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }

  isNetworkError() {
    return this.status === 0;
  }

  isTimeout() {
    return this.status === 408;
  }

  isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  isServerError() {
    return this.status >= 500;
  }

  isCancelled() {
    return this.status === 408 && this.message.includes('取消');
  }
}

// CommonJS export (for Node.js/testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API, APIError };
}