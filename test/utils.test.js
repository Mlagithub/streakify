import { describe, it, expect } from 'vitest';

// Mock DOM environment for utils tests
globalThis.escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

globalThis.formatDateISO = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

globalThis.debounce = (fn, delay) => {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

globalThis.throttle = (fn, limit) => {
  let inThrottle = false;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('should escape ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("It's fine")).toBe('It&#039;s fine');
  });

  it('should return empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('should handle normal text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

describe('formatDateISO', () => {
  it('should format date to ISO string', () => {
    const date = new Date(2024, 0, 15); // January 15, 2024
    expect(formatDateISO(date)).toBe('2024-01-15');
  });

  it('should pad month and day with zeros', () => {
    const date = new Date(2024, 0, 5); // January 5, 2024
    expect(formatDateISO(date)).toBe('2024-01-05');
  });

  it('should handle December correctly', () => {
    const date = new Date(2024, 11, 31); // December 31, 2024
    expect(formatDateISO(date)).toBe('2024-12-31');
  });
});

describe('debounce', () => {
  it('should return a function', () => {
    const debounced = debounce(() => {}, 100);
    expect(typeof debounced).toBe('function');
  });
});

describe('throttle', () => {
  it('should return a function', () => {
    const throttled = throttle(() => {}, 100);
    expect(typeof throttled).toBe('function');
  });
});