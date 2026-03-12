// performance.js - Performance Monitoring

/**
 * Web Vitals and Performance Monitoring
 * Tracks page load metrics and key operation timings
 */

const PerformanceMonitor = {
  // Store metrics
  metrics: {
    // Web Vitals
    lcp: null,  // Largest Contentful Paint
    fid: null,  // First Input Delay
    cls: null,  // Cumulative Layout Shift
    fcp: null,  // First Contentful Paint
    ttfb: null, // Time to First Byte

    // Custom metrics
    initTime: null,      // App initialization time
    habitLoadTime: null, // Habits load time
    streamLoadTime: null // Stream load time
  },

  // Operation timings
  operations: new Map(),

  // Observers
  observers: [],

  /**
   * Initialize performance monitoring
   */
  init() {
    this.observeWebVitals();
    this.observeLongTasks();
    console.log('[Performance] Monitoring initialized');
  },

  /**
   * Observe Web Vitals using PerformanceObserver
   */
  observeWebVitals() {
    // Largest Contentful Paint
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.metrics.lcp = lastEntry.startTime;
          this.reportMetric('LCP', lastEntry.startTime);
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        this.observers.push(lcpObserver);
      } catch (e) {
        console.debug('[Performance] LCP observer not supported');
      }

      // First Input Delay
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            this.metrics.fid = entry.processingStart - entry.startTime;
            this.reportMetric('FID', this.metrics.fid);
          });
        });
        fidObserver.observe({ type: 'first-input', buffered: true });
        this.observers.push(fidObserver);
      } catch (e) {
        console.debug('[Performance] FID observer not supported');
      }

      // Cumulative Layout Shift
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
          this.metrics.cls = clsValue;
          this.reportMetric('CLS', clsValue);
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
        this.observers.push(clsObserver);
      } catch (e) {
        console.debug('[Performance] CLS observer not supported');
      }
    }

    // First Contentful Paint and TTFB from Navigation Timing
    if ('performance' in window && performance.timing) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const timing = performance.timing;
          this.metrics.fcp = timing.domContentLoadedEventStart - timing.navigationStart;
          this.metrics.ttfb = timing.responseStart - timing.navigationStart;
          this.reportMetric('FCP', this.metrics.fcp);
          this.reportMetric('TTFB', this.metrics.ttfb);
        }, 0);
      });
    }
  },

  /**
   * Observe long tasks (tasks > 50ms that block main thread)
   */
  observeLongTasks() {
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            console.warn(`[Performance] Long task detected: ${entry.duration.toFixed(2)}ms`);
            // Could report to analytics here
          }
        });
        longTaskObserver.observe({ type: 'longtask', buffered: true });
        this.observers.push(longTaskObserver);
      } catch (e) {
        console.debug('[Performance] Long task observer not supported');
      }
    }
  },

  /**
   * Start timing an operation
   * @param {string} name - Operation name
   */
  startOperation(name) {
    this.operations.set(name, {
      start: performance.now(),
      end: null,
      duration: null
    });
  },

  /**
   * End timing an operation
   * @param {string} name - Operation name
   * @returns {number|null} Duration in ms
   */
  endOperation(name) {
    const op = this.operations.get(name);
    if (!op) {
      console.warn(`[Performance] No operation found: ${name}`);
      return null;
    }

    op.end = performance.now();
    op.duration = op.end - op.start;

    // Store as metric if it's a known operation
    if (name === 'app-init') {
      this.metrics.initTime = op.duration;
    } else if (name === 'load-habits') {
      this.metrics.habitLoadTime = op.duration;
    } else if (name === 'load-stream') {
      this.metrics.streamLoadTime = op.duration;
    }

    this.reportMetric(name, op.duration);
    return op.duration;
  },

  /**
   * Measure an operation with a callback
   * @param {string} name - Operation name
   * @param {Function} fn - Function to measure
   * @returns {*} Result of the function
   */
  async measure(name, fn) {
    this.startOperation(name);
    try {
      const result = await fn();
      return result;
    } finally {
      this.endOperation(name);
    }
  },

  /**
   * Report a metric
   * @param {string} name - Metric name
   * @param {number} value - Metric value in ms
   */
  reportMetric(name, value) {
    // Log to console in development
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      const formatted = value < 1000 ? `${value.toFixed(2)}ms` : `${(value / 1000).toFixed(2)}s`;
      console.log(`[Performance] ${name}: ${formatted}`);
    }

    // Could send to analytics endpoint here
    // this.sendToAnalytics(name, value);
  },

  /**
   * Get all collected metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    return { ...this.metrics };
  },

  /**
   * Get performance summary
   * @returns {string} Formatted summary
   */
  getSummary() {
    const m = this.metrics;
    const lines = ['Performance Summary:'];

    if (m.lcp) lines.push(`  LCP: ${m.lcp.toFixed(0)}ms`);
    if (m.fid) lines.push(`  FID: ${m.fid.toFixed(0)}ms`);
    if (m.cls !== null) lines.push(`  CLS: ${m.cls.toFixed(3)}`);
    if (m.fcp) lines.push(`  FCP: ${m.fcp.toFixed(0)}ms`);
    if (m.ttfb) lines.push(`  TTFB: ${m.ttfb.toFixed(0)}ms`);
    if (m.initTime) lines.push(`  App Init: ${m.initTime.toFixed(0)}ms`);
    if (m.habitLoadTime) lines.push(`  Habits Load: ${m.habitLoadTime.toFixed(0)}ms`);
    if (m.streamLoadTime) lines.push(`  Stream Load: ${m.streamLoadTime.toFixed(0)}ms`);

    return lines.join('\n');
  },

  /**
   * Cleanup observers
   */
  destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
};

// Auto-initialize
if (typeof window !== 'undefined') {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PerformanceMonitor.init());
  } else {
    PerformanceMonitor.init();
  }

  // Expose globally
  window.PerformanceMonitor = PerformanceMonitor;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceMonitor;
}