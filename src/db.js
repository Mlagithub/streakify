// src/db.js - Database utility functions

/**
 * Get local date string in YYYY-MM-DD format
 * Uses the timezone set in process.env.TZ (defaults to Asia/Shanghai)
 *
 * @param {number} daysOffset - Days offset from today (0 = today, -1 = yesterday, 7 = week later)
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getLocalDate(daysOffset = 0) {
  const date = new Date();

  // Apply offset
  if (daysOffset !== 0) {
    date.setDate(date.getDate() + daysOffset);
  }

  // Format as YYYY-MM-DD using local timezone
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Get current local datetime string
 * @returns {string} Datetime string in YYYY-MM-DD HH:MM:SS format
 */
function getLocalDateTime() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Parse date string to Date object (handles YYYY-MM-DD format)
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date|null} Date object or null if invalid
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);

  // Validate the date actually exists
  if (date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day) {
    return null;
  }

  return date;
}

module.exports = {
  getLocalDate,
  getLocalDateTime,
  parseDate
};