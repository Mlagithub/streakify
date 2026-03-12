// utils.js - Utility Functions

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format date to ISO string (YYYY-MM-DD) using local timezone
 * @param {Date} date - Date object
 * @returns {string} - ISO date string
 */
function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date in Asia/Shanghai timezone as YYYY-MM-DD string
 * Use this for all "today" operations to ensure consistent timezone handling
 * @param {number} offsetDays - Days offset from today (negative for past)
 * @returns {string} - Date string in YYYY-MM-DD format
 */
function getLocalDateISO(offsetDays = 0) {
  const now = new Date();
  if (offsetDays !== 0) {
    now.setDate(now.getDate() + offsetDays);
  }
  // Explicitly use Asia/Shanghai timezone
  const shanghaiStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const parts = shanghaiStr.split(/[/\s:]/);
  // Handle both "2026/3/11" and "2026-3-11" formats
  const year = parts[0];
  const month = String(parts[1]).padStart(2, '0');
  const day = String(parts[2]).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date for display
 * @param {string} dateStr - ISO date string
 * @returns {string} - Formatted date
 */
function formatDateDisplay(dateStr) {
  const date = new Date(dateStr);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${dateStr} ${weekdays[date.getDay()]}`;
}

/**
 * Debounce function execution
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Throttle function execution
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} - Throttled function
 */
function throttle(fn, limit) {
  let inThrottle = false;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Generate unique ID
 * @returns {string} - Unique ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Check if device is mobile
 * @returns {boolean}
 */
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Check if touch device
 * @returns {boolean}
 */
function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Download data as file
 * @param {string} content - File content
 * @param {string} filename - File name
 * @param {string} mimeType - MIME type
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format number with locale
 * @param {number} num - Number to format
 * @returns {string}
 */
function formatNumber(num) {
  return new Intl.NumberFormat('zh-CN').format(num);
}

/**
 * Parse query string
 * @param {string} queryString - Query string
 * @returns {Object}
 */
function parseQueryString(queryString) {
  const params = {};
  const searchParams = new URLSearchParams(queryString);
  for (const [key, value] of searchParams) {
    params[key] = value;
  }
  return params;
}

// CommonJS export (for Node.js/testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
    formatDateISO,
    getLocalDateISO,
    formatDateDisplay,
    debounce,
    throttle,
    generateId,
    isMobile,
    isTouchDevice,
    downloadFile,
    formatNumber,
    parseQueryString
  };
}

// =====================
// UI Utilities
// =====================

/**
 * Loading State Manager
 */
const LoadingState = {
  show(message = '加载中...') {
    let loader = document.getElementById('globalLoader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'globalLoader';
      loader.className = 'global-loader';
      loader.innerHTML = `
        <div class="loader-content">
          <div class="loader-spinner"></div>
          <span class="loader-text">${message}</span>
        </div>
      `;
      document.body.appendChild(loader);
    }
    loader.querySelector('.loader-text').textContent = message;
    loader.classList.add('show');
  },

  hide() {
    const loader = document.getElementById('globalLoader');
    if (loader) {
      loader.classList.remove('show');
    }
  }
};

/**
 * Toast Notification System
 */
const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toastContainer';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'success', duration = 3000) {
    this.init();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || '✅'}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
    `;

    this.container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));

    // Auto remove
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
  },

  success(message) { return this.show(message, 'success'); },
  error(message) { return this.show(message, 'error'); },
  warning(message) { return this.show(message, 'warning'); },
  info(message) { return this.show(message, 'info'); }
};