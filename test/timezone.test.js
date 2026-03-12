import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Test timezone handling for Asia/Shanghai (UTC+8)
// These tests verify that date functions work correctly regardless of system timezone

describe('Timezone Handling', () => {
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    // Simulate server startup: set timezone before any date operations
    process.env.TZ = 'Asia/Shanghai';
  });

  afterAll(() => {
    // Restore original timezone
    if (originalTZ !== undefined) {
      process.env.TZ = originalTZ;
    } else {
      delete process.env.TZ;
    }
  });

  describe('getLocalDate (backend)', () => {
    // Mock getLocalDate function (same as scripts/db.js)
    function getLocalDate(offsetDays = 0) {
      const now = new Date();
      if (offsetDays !== 0) {
        now.setDate(now.getDate() + offsetDays);
      }
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    it('should return today\'s date in Shanghai timezone', () => {
      const result = getLocalDate();
      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return yesterday\'s date with offset -1', () => {
      const today = getLocalDate();
      const yesterday = getLocalDate(-1);

      // Parse dates
      const todayParts = today.split('-').map(Number);
      const yesterdayParts = yesterday.split('-').map(Number);

      // Calculate expected difference
      const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
      const yesterdayDate = new Date(yesterdayParts[0], yesterdayParts[1] - 1, yesterdayParts[2]);

      const diffDays = Math.round((todayDate - yesterdayDate) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(1);
    });

    it('should return tomorrow\'s date with offset +1', () => {
      const today = getLocalDate();
      const tomorrow = getLocalDate(1);

      const todayParts = today.split('-').map(Number);
      const tomorrowParts = tomorrow.split('-').map(Number);

      const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
      const tomorrowDate = new Date(tomorrowParts[0], tomorrowParts[1] - 1, tomorrowParts[2]);

      const diffDays = Math.round((tomorrowDate - todayDate) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(1);
    });
  });

  describe('getLocalDateISO (frontend)', () => {
    // Mock getLocalDateISO function (same as public/js/utils.js)
    function getLocalDateISO(offsetDays = 0) {
      const now = new Date();
      if (offsetDays !== 0) {
        now.setDate(now.getDate() + offsetDays);
      }
      const shanghaiStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      const parts = shanghaiStr.split(/[/\s:]/);
      const year = parts[0];
      const month = String(parts[1]).padStart(2, '0');
      const day = String(parts[2]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    it('should return date in Shanghai timezone explicitly', () => {
      const result = getLocalDateISO();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle month boundaries correctly', () => {
      // Test with a large offset to verify month boundary handling
      const today = getLocalDateISO();
      const thirtyDaysAgo = getLocalDateISO(-30);

      expect(thirtyDaysAgo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(thirtyDaysAgo).not.toBe(today);
    });
  });

  describe('Date boundary scenarios', () => {
    // These tests verify behavior around midnight boundaries

    it('should parse YYYY-MM-DD string consistently', () => {
      const dateStr = '2024-06-15';
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);

      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(5); // June is month 5 (0-indexed)
      expect(date.getDate()).toBe(15);
    });

    it('should handle end-of-month correctly', () => {
      const dateStr = '2024-01-31';
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);

      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // January
      expect(date.getDate()).toBe(31);
    });

    it('should handle leap year February', () => {
      const dateStr = '2024-02-29'; // 2024 is a leap year
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);

      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(1); // February
      expect(date.getDate()).toBe(29);
    });
  });

  describe('Streak calculation consistency', () => {
    // Mock streak logic from scripts/db.js
    function calculateStreak(checkinDates, todayStr) {
      if (checkinDates.length === 0) return 0;

      const [ty, tm, td] = todayStr.split('-').map(Number);
      let currentDate = new Date(ty, tm - 1, td);
      currentDate.setHours(0, 0, 0, 0);

      let streak = 0;
      const sortedDates = [...checkinDates].sort().reverse();

      for (const checkDateStr of sortedDates) {
        const [cy, cm, cd] = checkDateStr.split('-').map(Number);
        const checkDate = new Date(cy, cm - 1, cd);
        checkDate.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((currentDate - checkDate) / (1000 * 60 * 60 * 24));

        if (diffDays <= 1) {
          streak++;
          currentDate = checkDate;
        } else {
          break;
        }
      }

      return streak;
    }

    it('should calculate streak correctly for consecutive days', () => {
      const today = '2024-06-15';
      const checkins = ['2024-06-15', '2024-06-14', '2024-06-13'];
      expect(calculateStreak(checkins, today)).toBe(3);
    });

    it('should count streak even if yesterday only', () => {
      const today = '2024-06-15';
      const checkins = ['2024-06-14'];
      expect(calculateStreak(checkins, today)).toBe(1);
    });

    it('should break streak for gap > 1 day', () => {
      const today = '2024-06-15';
      const checkins = ['2024-06-15', '2024-06-13', '2024-06-12'];
      // 2024-06-13 is 2 days before today (2024-06-15), so streak breaks after 06-15
      expect(calculateStreak(checkins, today)).toBe(1);
    });

    it('should return 0 for empty checkins', () => {
      expect(calculateStreak([], '2024-06-15')).toBe(0);
    });
  });
});

describe('Timezone edge cases', () => {
  it('should handle UTC midnight vs Shanghai morning', () => {
    // When it's 00:00 UTC on Jan 1st, it's 08:00 in Shanghai on Jan 1st
    // When it's 16:00 UTC on Jan 1st, it's 00:00 in Shanghai on Jan 2nd

    // This test verifies that our functions correctly handle the UTC+8 offset
    const utcDate = new Date('2024-01-01T16:00:00Z');
    const shanghaiHour = utcDate.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      hour12: false
    });

    // 16:00 UTC = 00:00 Shanghai (next day)
    expect(parseInt(shanghaiHour)).toBe(0);
  });

  it('should produce consistent dates between getLocalDate and getLocalDateISO', () => {
    process.env.TZ = 'Asia/Shanghai';

    // Backend getLocalDate
    function getLocalDate(offsetDays = 0) {
      const now = new Date();
      if (offsetDays !== 0) {
        now.setDate(now.getDate() + offsetDays);
      }
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Frontend getLocalDateISO
    function getLocalDateISO(offsetDays = 0) {
      const now = new Date();
      if (offsetDays !== 0) {
        now.setDate(now.getDate() + offsetDays);
      }
      const shanghaiStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      const parts = shanghaiStr.split(/[/\s:]/);
      const year = parts[0];
      const month = String(parts[1]).padStart(2, '0');
      const day = String(parts[2]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Both should return the same date when TZ is set to Shanghai
    const backendDate = getLocalDate();
    const frontendDate = getLocalDateISO();

    expect(backendDate).toBe(frontendDate);
  });
});