// src/server.js - Web API server for habit tracker (optimized)

// CRITICAL: Set timezone BEFORE any module loading to ensure consistent date handling
// This makes Node.js Date, SQLite localtime, and toLocaleString all use Asia/Shanghai
process.env.TZ = process.env.TIMEZONE || 'Asia/Shanghai';

const express = require('express');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const path = require('path');

// Import database utilities
const { getLocalDate: getLocalDateShared } = require('./db');

// Import shared configuration
const {
  VALID_CATEGORIES,
  VALID_REPEAT_MODES,
  VALID_REMINDER_PERIODS,
  ValidationConfig
} = require('../public/js/config');

const app = express();

// Environment configuration
const PORT = parseInt(process.env.PORT) || 3847;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Shanghai';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Constants from shared config
const NOTE_MAX_LENGTH = ValidationConfig.noteMaxLength;
const NAME_MAX_LENGTH = ValidationConfig.nameMaxLength;
const DEFAULT_PAGE_SIZE = ValidationConfig.defaultPageSize;

// Date validation regex (YYYY-MM-DD)
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Validate date string format and validity
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} - True if valid
 */
function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!DATE_REGEX.test(dateStr)) return false;
  
  // Check if date actually exists
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
         date.getMonth() === month - 1 &&
         date.getDate() === day;
}

// Database connection with error handling
const dbPath = path.join(__dirname, '..', 'data', 'habits.db');
let db;

try {
  db = new Database(dbPath);
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // === Database Migrations ===
  // Create migrations table first
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrations = [
    { name: 'category', sql: `ALTER TABLE habits ADD COLUMN category TEXT DEFAULT 'other'` },
    { name: 'allow_duplicate', sql: `ALTER TABLE habits ADD COLUMN allow_duplicate INTEGER DEFAULT 0` },
    // Habit Loop Optimization - New fields
    { name: 'reminder_period', sql: `ALTER TABLE habits ADD COLUMN reminder_period TEXT DEFAULT ''` },
    { name: 'stack_after_id', sql: `ALTER TABLE habits ADD COLUMN stack_after_id INTEGER DEFAULT NULL` },
    { name: 'tags', sql: `ALTER TABLE habits ADD COLUMN tags TEXT DEFAULT '[]'` },
    { name: 'identity_label', sql: `ALTER TABLE habits ADD COLUMN identity_label TEXT DEFAULT ''` },
    // Checkin skip reason
    { name: 'skip_reason', sql: `ALTER TABLE checkins ADD COLUMN skip_reason TEXT DEFAULT ''` },
    // Repeat mode for duplicate checkins (new_record | append)
    { name: 'repeat_mode', sql: `ALTER TABLE habits ADD COLUMN repeat_mode TEXT DEFAULT 'new_record'` },
  ];

  // Get already executed migrations
  const executedMigrations = new Set(
    db.prepare('SELECT name FROM migrations').all().map(m => m.name)
  );

  for (const migration of migrations) {
    // Skip if already executed
    if (executedMigrations.has(migration.name)) {
      continue;
    }

    try {
      db.exec(migration.sql);
      // Record successful migration
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
      console.log(`Migration ${migration.name}: applied successfully`);
    } catch (e) {
      if (e.message.includes('duplicate column name')) {
        // Column already exists, record it as executed
        db.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)').run(migration.name);
        console.log(`Migration ${migration.name}: already exists, recorded`);
      } else {
        console.error(`Migration ${migration.name} failed:`, e.message);
      }
    }
  }
  
  // Create indexes for better performance (only for existing tables)
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date(checked_at))`,
    `CREATE INDEX IF NOT EXISTS idx_checkins_habit_date ON checkins(habit_id, date(checked_at))`,
    `CREATE INDEX IF NOT EXISTS idx_habits_stack_after ON habits(stack_after_id)`,
  ];
  
  for (const sql of indexes) {
    try {
      db.exec(sql);
    } catch (e) {
      console.log('Index creation:', e.message);
    }
  }
  
  // Create logs table for gap journals (间隙日志) - must be created before index
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create index for logs table after table is created
    db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_date ON logs(date(created_at))`);
  } catch (e) {
    if (!e.message.includes('already exists')) {
      console.log('Logs table creation:', e.message);
    }
  }
  
} catch (err) {
  console.error('Failed to connect to database:', err.message);
  process.exit(1);
}

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX) || 500, // limit each IP to 500 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.', success: false }
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// Basic Authentication middleware
app.use((req, res, next) => {
  // Skip auth if no password configured (development mode)
  if (!ADMIN_PASSWORD) {
    return next();
  }
  
  // Allow static files without auth
  if (!req.path.startsWith('/api/')) {
    return next();
  }
  
  const auth = req.headers.authorization;
  
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Habit Tracker"');
    return res.status(401).json({ error: 'Authentication required', success: false });
  }
  
  const credentials = Buffer.from(auth.slice(6), 'base64').toString();
  const [username, password] = credentials.split(':');
  
  // We only check password, username can be anything
  if (password !== ADMIN_PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Habit Tracker"');
    return res.status(401).json({ error: 'Invalid credentials', success: false });
  }
  
  next();
});

// Middleware
app.use(express.json({ limit: '10kb' })); // Issue 10: Explicit body size limit
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/dist', express.static(path.join(__dirname, '..', 'dist')));

/**
 * Get local date string - uses shared implementation from src/db.js
 * This ensures consistent timezone handling across all modules.
 */
const getLocalDate = getLocalDateShared;

/**
 * Unified error response helper
 * @param {Response} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
function errorResponse(res, statusCode, message) {
  return res.status(statusCode).json({ error: message, success: false });
}

/**
 * Unified success response helper
 * @param {Response} res - Express response object
 * @param {any} data - Response data
 */
function successResponse(res, data) {
  if (data === undefined) {
    return res.json({ success: true });
  }
  return res.json({ success: true, data });
}

/**
 * Validate habitId parameter
 * @param {any} id - The ID to validate
 * @returns {number|null} - Parsed ID or null if invalid
 */
function validateHabitId(id) {
  const habitId = parseInt(id);
  if (isNaN(habitId) || habitId <= 0) {
    return null;
  }
  return habitId;
}

/**
 * Validate and sanitize string input
 * @param {any} str - The string to validate
 * @param {number} maxLength - Maximum allowed length
 * @returns {object} - { valid: boolean, value: string, error?: string }
 */
function validateString(str, maxLength) {
  if (str === undefined || str === null) {
    return { valid: true, value: '' };
  }
  if (typeof str !== 'string') {
    return { valid: false, value: '', error: 'Invalid string format' };
  }
  if (str.length > maxLength) {
    return { valid: false, value: '', error: `Exceeds maximum length of ${maxLength} characters` };
  }
  return { valid: true, value: str.trim() };
}

// API: Get all habits with today's status
app.get('/api/habits', (req, res) => {
  try {
    const localDate = getLocalDate();
    const habits = db.prepare(`
      SELECT h.*, 
        (SELECT COUNT(*) FROM checkins c 
         WHERE c.habit_id = h.id AND date(c.checked_at) = ?) as today_checkins
      FROM habits h ORDER BY h.created_at DESC
      LIMIT 100
    `).all(localDate);
    successResponse(res, habits);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get streak for a habit
app.get('/api/habits/:id/streak', (req, res) => {
  try {
    const habitId = validateHabitId(req.params.id);
    if (!habitId) {
      return errorResponse(res, 400, 'Invalid habit ID');
    }

    // Get checkin dates for streak calculation (TZ is set at process level)
    const checkins = db.prepare(`
      SELECT DISTINCT date(checked_at) as check_date
      FROM checkins WHERE habit_id = ? ORDER BY checked_at DESC
      LIMIT 365
    `).all(habitId);

    if (checkins.length === 0) {
      return res.json({ streak: 0 });
    }

    // Get today's date in Asia/Shanghai timezone
    const todayStr = getLocalDate();
    const [ty, tm, td] = todayStr.split('-').map(Number);
    let currentDate = new Date(ty, tm - 1, td);
    currentDate.setHours(0, 0, 0, 0);

    let streak = 0;
    for (const checkin of checkins) {
      const [cy, cm, cd] = checkin.check_date.split('-').map(Number);
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
    successResponse(res, { streak });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get streaks for all habits (batch endpoint to avoid N+1 queries)
app.get('/api/habits/streaks', (req, res) => {
  try {
    // Get all habits with their checkin dates
    const habits = db.prepare(`
      SELECT h.id, h.name,
        GROUP_CONCAT(DISTINCT date(c.checked_at)) as checkin_dates
      FROM habits h
      LEFT JOIN checkins c ON h.id = c.habit_id
      GROUP BY h.id
    `).all();

    // Get today's date in Asia/Shanghai timezone
    const todayStr = getLocalDate();
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const todayDate = new Date(ty, tm - 1, td);
    todayDate.setHours(0, 0, 0, 0);

    // Calculate streak for each habit
    const streaks = {};
    for (const habit of habits) {
      if (!habit.checkin_dates) {
        streaks[habit.id] = 0;
        continue;
      }

      const dates = habit.checkin_dates.split(',').sort().reverse();
      let streak = 0;
      let currentDate = new Date(todayDate);

      for (const dateStr of dates) {
        const [cy, cm, cd] = dateStr.split('-').map(Number);
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
      streaks[habit.id] = streak;
    }

    successResponse(res, streaks);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get check-ins for a habit
app.get('/api/habits/:id/checkins', (req, res) => {
  try {
    const habitId = validateHabitId(req.params.id);
    if (!habitId) {
      return errorResponse(res, 400, 'Invalid habit ID');
    }
    
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const startDate = getLocalDate(-days);  // Fixed: negative days for past dates
    
    const checkins = db.prepare(`
      SELECT * FROM checkins
      WHERE habit_id = ? AND date(checked_at) >= ?
      ORDER BY checked_at DESC
      LIMIT ?
    `).all(habitId, startDate, days * 10);  // Limit results
    
    res.json(checkins);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Check-in (supports repeat_mode: new_record | append)
app.post('/api/checkin', (req, res) => {
  try {
    const { habitId, note, date } = req.body;
    
    // Validate habitId
    const validHabitId = validateHabitId(habitId);
    if (!validHabitId) {
      return errorResponse(res, 400, 'Valid habitId required');
    }
    
    // Validate note
    const noteResult = validateString(note, NOTE_MAX_LENGTH);
    if (!noteResult.valid) {
      return errorResponse(res, 400, `Note: ${noteResult.error}`);
    }
    
    // Support specified date for makeup check-in
    let targetDate = getLocalDate();
    if (date) {
      if (!isValidDate(date)) {
        return errorResponse(res, 400, 'Invalid date format. Use YYYY-MM-DD');
      }
      targetDate = date;
    }
    
    // Get habit's repeat_mode (default to 'new_record' for backwards compatibility)
    const habit = db.prepare(`SELECT repeat_mode, allow_duplicate FROM habits WHERE id = ?`).get(validHabitId);
    const repeatMode = habit?.repeat_mode || 'new_record';

    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':'
                    + now.getMinutes().toString().padStart(2, '0') + ':'
                    + now.getSeconds().toString().padStart(2, '0');
    const timestamp = targetDate + ' ' + timeStr;

    // Handle based on repeat_mode - use transaction for atomicity
    if (repeatMode === 'append') {
      // Transaction for atomic read-modify-write
      // 使用 immediate 事务防止竞态条件
      const appendTransaction = db.transaction(() => {
        // Get existing record for the date (within transaction)
        const existing = db.prepare(`
          SELECT id, note FROM checkins
          WHERE habit_id = ? AND date(checked_at) = ?
          ORDER BY id DESC LIMIT 1
        `).get(validHabitId, targetDate);

        if (existing) {
          // Append mode: update existing record's note
          let finalNote = existing.note || '';
          if (noteResult.value) {
            finalNote = finalNote ? finalNote + '\n' + noteResult.value : noteResult.value;
          }

          db.prepare(`UPDATE checkins SET note = ? WHERE id = ?`).run(finalNote, existing.id);

          return { id: existing.id, note: finalNote, date: targetDate, mode: 'append' };
        } else {
          // No existing record, create new one
          const result = db.prepare(`
            INSERT INTO checkins (habit_id, checked_at, note) VALUES (?, ?, ?)
          `).run(validHabitId, timestamp, noteResult.value);

          return { id: result.lastInsertRowid, note: noteResult.value, date: targetDate, mode: 'new_record' };
        }
      }, 'immediate');

      const checkinResult = appendTransaction();
      successResponse(res, checkinResult);
    } else {
      // New record mode (default): create new record
      let finalNote = noteResult.value;

      const result = db.prepare(`
        INSERT INTO checkins (habit_id, checked_at, note) VALUES (?, ?, ?)
      `).run(validHabitId, timestamp, finalNote);

      successResponse(res, {
        id: result.lastInsertRowid,
        note: finalNote,
        date: targetDate,
        mode: 'new_record'
      });
    }
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get all check-ins with filtering (for history view) - with pagination
app.get('/api/history', (req, res) => {
  try {
    const { start, end, habitId } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || DEFAULT_PAGE_SIZE, 1), 500);
    const offset = (page - 1) * limit;
    
    // Validate date parameters
    if (start && !isValidDate(start)) {
      return errorResponse(res, 400, 'Invalid start date format. Use YYYY-MM-DD');
    }
    if (end && !isValidDate(end)) {
      return errorResponse(res, 400, 'Invalid end date format. Use YYYY-MM-DD');
    }
    
    // Build base WHERE conditions
    let whereConditions = [];
    let params = [];
    
    if (start) {
      whereConditions.push('date(c.checked_at) >= ?');
      params.push(start);
    }
    if (end) {
      whereConditions.push('date(c.checked_at) <= ?');
      params.push(end);
    }
    if (habitId) {
      const validId = validateHabitId(habitId);
      if (validId) {
        whereConditions.push('c.habit_id = ?');
        params.push(validId);
      }
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // Get total count with separate query
    const countSql = `
      SELECT COUNT(*) as total
      FROM checkins c 
      JOIN habits h ON c.habit_id = h.id 
      ${whereClause}
    `;
    const countResult = db.prepare(countSql).get(...params);
    const total = countResult ? countResult.total : 0;
    
    // Get paginated data
    const dataSql = `
      SELECT c.id, c.habit_id, c.checked_at, c.note, 
             date(c.checked_at) as check_date,
             time(c.checked_at) as check_time,
             h.name as habit_name
      FROM checkins c 
      JOIN habits h ON c.habit_id = h.id 
      ${whereClause}
      ORDER BY c.checked_at DESC 
      LIMIT ? OFFSET ?
    `;
    const checkins = db.prepare(dataSql).all(...params, limit, offset);
    
    res.json({
      data: checkins,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get full history (checkins + logs) with date filtering
app.get('/api/history/full', (req, res) => {
  try {
    const { start, end, habitId, type } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = (page - 1) * limit;

    // Validate date parameters
    if (start && !isValidDate(start)) {
      return errorResponse(res, 400, 'Invalid start date format. Use YYYY-MM-DD');
    }
    if (end && !isValidDate(end)) {
      return errorResponse(res, 400, 'Invalid end date format. Use YYYY-MM-DD');
    }

    const startDate = start || getLocalDate(-30);
    const endDate = end || getLocalDate();

    // Build filter conditions
    let conditions = [];
    let params = [];

    conditions.push("date(checked_at) >= ?");
    params.push(startDate);
    conditions.push("date(checked_at) <= ?");
    params.push(endDate);

    // Filter by type (checkin or log)
    let typeFilter = '';
    if (type === 'checkin') {
      typeFilter = " AND type = 'checkin'";
    } else if (type === 'log') {
      typeFilter = " AND type = 'log'";
    }

    // Filter by habitId (only applies to checkins)
    if (habitId) {
      const validId = validateHabitId(habitId);
      if (validId) {
        typeFilter = " AND type = 'checkin' AND habit_id = ?";
        params.push(validId);
      }
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // Get total count
    const countSql = `
      SELECT COUNT(*) as total FROM (
        SELECT 'checkin' as type, c.id, c.checked_at
        FROM checkins c
        JOIN habits h ON c.habit_id = h.id
        WHERE date(c.checked_at) >= ? AND date(c.checked_at) <= ?

        UNION ALL

        SELECT 'log' as type, l.id, l.created_at as checked_at
        FROM logs l
        WHERE date(l.created_at) >= ? AND date(l.created_at) <= ?
      ) combined
      ${typeFilter.replace('AND', 'WHERE')}
    `;

    // Get combined data
    const dataSql = `
      SELECT * FROM (
        SELECT 'checkin' as type, c.id, c.habit_id, c.checked_at, c.note,
               date(c.checked_at) as check_date,
               time(c.checked_at) as check_time,
               h.name as habit_name,
               h.category
        FROM checkins c
        JOIN habits h ON c.habit_id = h.id
        WHERE date(c.checked_at) >= ? AND date(c.checked_at) <= ?

        UNION ALL

        SELECT 'log' as type, l.id, NULL as habit_id, l.created_at as checked_at, l.content as note,
               date(l.created_at) as check_date,
               time(l.created_at) as check_time,
               '日记' as habit_name,
               NULL as category
        FROM logs l
        WHERE date(l.created_at) >= ? AND date(l.created_at) <= ?
      ) combined
      ${typeFilter.replace('AND', 'WHERE')}
      ORDER BY checked_at DESC
      LIMIT ? OFFSET ?
    `;

    const data = db.prepare(dataSql).all(
      startDate, endDate,  // checkins 子查询参数
      startDate, endDate,  // logs 子查询参数
      ...params.slice(2),  // typeFilter 额外参数
      limit, offset        // 分页参数
    );

    // Get total for pagination
    const totalResult = db.prepare(`
      SELECT COUNT(*) as total FROM (
        SELECT 'checkin' as type FROM checkins
        WHERE date(checked_at) >= ? AND date(checked_at) <= ?
        UNION ALL
        SELECT 'log' as type FROM logs
        WHERE date(created_at) >= ? AND date(created_at) <= ?
      )
    `).get(startDate, endDate, startDate, endDate);

    res.json({
      data,
      pagination: {
        page,
        limit,
        total: totalResult ? totalResult.total : 0,
        totalPages: Math.ceil((totalResult ? totalResult.total : 0) / limit)
      }
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get daily statistics for a date range
app.get('/api/stats/daily', (req, res) => {
  try {
    const { start, end } = req.query;
    
    // Validate date parameters
    if (start && !isValidDate(start)) {
      return errorResponse(res, 400, 'Invalid start date format. Use YYYY-MM-DD');
    }
    if (end && !isValidDate(end)) {
      return errorResponse(res, 400, 'Invalid end date format. Use YYYY-MM-DD');
    }
    
    const startDate = start || getLocalDate(-30);
    const endDate = end || getLocalDate();
    
    const stats = db.prepare(`
      SELECT date(checked_at) as date, COUNT(*) as count
      FROM checkins
      WHERE date(checked_at) >= ? AND date(checked_at) <= ?
      GROUP BY date(checked_at)
      ORDER BY date DESC
      LIMIT 366
    `).all(startDate, endDate);
    
    res.json(stats);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Add habit
app.post('/api/habits', (req, res) => {
  try {
    const { 
      name, description, reminder_hours, category, allow_duplicate,
      reminder_period, stack_after_id, tags, identity_label, repeat_mode
    } = req.body;
    
    // Validate name
    if (!name) {
      return errorResponse(res, 400, 'name required');
    }
    
    const nameResult = validateString(name, NAME_MAX_LENGTH);
    if (!nameResult.valid || !nameResult.value) {
      return errorResponse(res, 400, `name: ${nameResult.error || 'cannot be empty'}`);
    }
    
    // Validate description
    const descResult = validateString(description, NOTE_MAX_LENGTH);
    if (!descResult.valid) {
      return errorResponse(res, 400, `description: ${descResult.error}`);
    }
    
    // Validate category
    const validCategory = VALID_CATEGORIES.includes(category) ? category : 'other';
    
    // Validate allow_duplicate (0 or 1)
    const allowDup = allow_duplicate ? 1 : 0;
    
    // Validate repeat_mode
    const validRepeatMode = VALID_REPEAT_MODES.includes(repeat_mode) ? repeat_mode : 'new_record';
    
    // Validate reminder_period
    const validReminderPeriod = VALID_REMINDER_PERIODS.includes(reminder_period) ? (reminder_period || '') : '';
    
    // Validate stack_after_id (must be a valid habit ID or null)
    const validStackAfterId = stack_after_id ? validateHabitId(stack_after_id) : null;
    
    // Validate tags (must be valid JSON array)
    let validTags = '[]';
    if (tags) {
      try {
        const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        if (Array.isArray(parsedTags)) {
          validTags = JSON.stringify(parsedTags.slice(0, 10)); // Max 10 tags
        }
      } catch (e) {
        // Invalid JSON, use empty array
      }
    }
    
    // Validate identity_label
    const identityResult = validateString(identity_label, 50);
    const validIdentityLabel = identityResult.valid ? identityResult.value : '';
    
    const result = db.prepare(`
      INSERT INTO habits (name, description, reminder_hours, category, allow_duplicate, 
                          reminder_period, stack_after_id, tags, identity_label, repeat_mode) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nameResult.value, descResult.value, reminder_hours || '', validCategory, allowDup,
           validReminderPeriod, validStackAfterId, validTags, validIdentityLabel, validRepeatMode);
    
    res.json({ 
      id: result.lastInsertRowid, 
      name: nameResult.value, 
      description: descResult.value, 
      reminder_hours: reminder_hours || '', 
      category: validCategory,
      reminder_period: validReminderPeriod,
      stack_after_id: validStackAfterId,
      tags: validTags,
      identity_label: validIdentityLabel,
      repeat_mode: validRepeatMode,
      success: true 
    });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return errorResponse(res, 400, 'Habit already exists');
    }
    return errorResponse(res, 500, err.message);
  }
});

// API: Delete habit
app.delete('/api/habits/:id', (req, res) => {
  try {
    const habitId = validateHabitId(req.params.id);
    if (!habitId) {
      return errorResponse(res, 400, 'Invalid habit ID');
    }
    
    db.prepare('DELETE FROM checkins WHERE habit_id = ?').run(habitId);
    const result = db.prepare('DELETE FROM habits WHERE id = ?').run(habitId);
    successResponse(res, { deleted: result.changes > 0 });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Update habit
app.put('/api/habits/:id', (req, res) => {
  try {
    const habitId = validateHabitId(req.params.id);
    if (!habitId) {
      return errorResponse(res, 400, 'Invalid habit ID');
    }
    
    const { 
      name, description, reminder_hours, category, allow_duplicate,
      reminder_period, stack_after_id, tags, identity_label, repeat_mode
    } = req.body;
    
    // Build update query dynamically
    const updates = [];
    const params = [];
    
    if (name !== undefined) {
      const nameResult = validateString(name, NAME_MAX_LENGTH);
      if (!nameResult.valid || !nameResult.value) {
        return errorResponse(res, 400, `name: ${nameResult.error || 'cannot be empty'}`);
      }
      updates.push('name = ?');
      params.push(nameResult.value);
    }
    
    if (description !== undefined) {
      const descResult = validateString(description, NOTE_MAX_LENGTH);
      if (!descResult.valid) {
        return errorResponse(res, 400, `description: ${descResult.error}`);
      }
      updates.push('description = ?');
      params.push(descResult.value);
    }
    
    if (reminder_hours !== undefined) {
      updates.push('reminder_hours = ?');
      params.push(reminder_hours || '');
    }
    
    if (category !== undefined) {
      const validCategory = VALID_CATEGORIES.includes(category) ? category : 'other';
      updates.push('category = ?');
      params.push(validCategory);
    }
    
    if (allow_duplicate !== undefined) {
      updates.push('allow_duplicate = ?');
      params.push(allow_duplicate ? 1 : 0);
    }
    
    // New Habit Loop fields
    if (reminder_period !== undefined) {
      const validReminderPeriod = VALID_REMINDER_PERIODS.includes(reminder_period) ? (reminder_period || '') : '';
      updates.push('reminder_period = ?');
      params.push(validReminderPeriod);
    }
    
    if (stack_after_id !== undefined) {
      const validStackAfterId = stack_after_id ? validateHabitId(stack_after_id) : null;
      updates.push('stack_after_id = ?');
      params.push(validStackAfterId);
    }
    
    if (tags !== undefined) {
      let validTags = '[]';
      try {
        const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        if (Array.isArray(parsedTags)) {
          validTags = JSON.stringify(parsedTags.slice(0, 10));
        }
      } catch (e) {}
      updates.push('tags = ?');
      params.push(validTags);
    }
    
    if (identity_label !== undefined) {
      const identityResult = validateString(identity_label, 50);
      updates.push('identity_label = ?');
      params.push(identityResult.valid ? identityResult.value : '');
    }
    
    if (repeat_mode !== undefined) {
      const validRepeatMode = VALID_REPEAT_MODES.includes(repeat_mode) ? repeat_mode : 'new_record';
      updates.push('repeat_mode = ?');
      params.push(validRepeatMode);
    }
    
    if (updates.length === 0) {
      return errorResponse(res, 400, 'No fields to update');
    }
    
    params.push(habitId);
    const result = db.prepare(`
      UPDATE habits SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);
    
    res.json({ success: result.changes > 0 });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return errorResponse(res, 400, 'Habit name already exists');
    }
    return errorResponse(res, 500, err.message);
  }
});

// API: Update checkin note and/or checked_at time
app.put('/api/checkins/:id', (req, res) => {
  try {
    const checkinId = validateHabitId(req.params.id);
    if (!checkinId) {
      return errorResponse(res, 400, 'Invalid checkin ID');
    }
    
    const { note, checked_at } = req.body;
    
    // Validate note if provided
    let noteResult = { valid: true, value: null };
    if (note !== undefined) {
      noteResult = validateString(note, NOTE_MAX_LENGTH);
      if (!noteResult.valid) {
        return errorResponse(res, 400, `note: ${noteResult.error}`);
      }
    }
    
    // Validate checked_at if provided (format: YYYY-MM-DD HH:MM:SS)
    let checkedAtValid = null;
    if (checked_at !== undefined) {
      // Validate datetime format: YYYY-MM-DD HH:MM:SS or YYYY-MM-DDTHH:MM
      const datetimeRegex = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
      const match = checked_at.match(datetimeRegex);
      if (!match) {
        return errorResponse(res, 400, 'Invalid checked_at format. Use YYYY-MM-DD HH:MM:SS or datetime-local format');
      }
      
      // Reconstruct in standard format: YYYY-MM-DD HH:MM:SS
      const [, year, month, day, hour, minute, second = '00'] = match;
      checkedAtValid = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
      
      // Validate date exists
      const dateStr = `${year}-${month}-${day}`;
      if (!isValidDate(dateStr)) {
        return errorResponse(res, 400, 'Invalid date in checked_at');
      }
    }
    
    // Build update based on what's provided
    if (checkedAtValid !== null && noteResult.value !== null) {
      // Update both
      db.prepare('UPDATE checkins SET checked_at = ?, note = ? WHERE id = ?')
        .run(checkedAtValid, noteResult.value, checkinId);
    } else if (checkedAtValid !== null) {
      // Update only checked_at
      db.prepare('UPDATE checkins SET checked_at = ? WHERE id = ?')
        .run(checkedAtValid, checkinId);
    } else if (noteResult.value !== null) {
      // Update only note
      db.prepare('UPDATE checkins SET note = ? WHERE id = ?')
        .run(noteResult.value, checkinId);
    } else {
      return errorResponse(res, 400, 'No fields to update');
    }
    
    res.json({ success: true, checked_at: checkedAtValid, note: noteResult.value });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Delete checkin
app.delete('/api/checkins/:id', (req, res) => {
  try {
    const checkinId = validateHabitId(req.params.id);
    if (!checkinId) {
      return errorResponse(res, 400, 'Invalid checkin ID');
    }
    
    const result = db.prepare('DELETE FROM checkins WHERE id = ?').run(checkinId);
    res.json({ success: result.changes > 0 });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get today's meals
app.get('/api/meals/today', (req, res) => {
  try {
    const localDate = getLocalDate();
    const meals = db.prepare(`
      SELECT h.name, c.note, c.checked_at 
      FROM checkins c 
      JOIN habits h ON c.habit_id = h.id 
      WHERE h.name IN ('早餐', '午餐', '晚餐') AND date(c.checked_at) = ?
      ORDER BY c.checked_at
      LIMIT 10
    `).all(localDate);
    res.json(meals);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get check-ins by date range
app.get('/api/checkins', (req, res) => {
  try {
    const { start, end } = req.query;
    
    // Validate date parameters
    if (!start || !end) {
      return errorResponse(res, 400, 'start and end required');
    }
    
    if (!isValidDate(start)) {
      return errorResponse(res, 400, 'Invalid start date format. Use YYYY-MM-DD');
    }
    if (!isValidDate(end)) {
      return errorResponse(res, 400, 'Invalid end date format. Use YYYY-MM-DD');
    }
    
    const checkins = db.prepare(`
      SELECT h.name, c.note, c.checked_at, date(c.checked_at) as check_date
      FROM checkins c 
      JOIN habits h ON c.habit_id = h.id 
      WHERE date(c.checked_at) >= ? AND date(c.checked_at) <= ?
      ORDER BY c.checked_at DESC
      LIMIT 1000
    `).all(start, end);
    
    res.json(checkins);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// ============================================
// Habit Loop Optimization APIs
// ============================================

// API: Get heatmap data for all habits (last 90 days by default)
app.get('/api/heatmap', (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 90, 7), 365);
    const endDate = getLocalDate();
    const startDate = getLocalDate(-days);
    
    // Get all checkins grouped by date
    const checkins = db.prepare(`
      SELECT date(checked_at) as date, COUNT(*) as count
      FROM checkins
      WHERE date(checked_at) >= ? AND date(checked_at) <= ?
      GROUP BY date(checked_at)
      ORDER BY date ASC
    `).all(startDate, endDate);
    
    // Get total habits count for percentage calculation
    const totalHabits = db.prepare('SELECT COUNT(*) as count FROM habits').get().count;
    
    // Create a map for quick lookup
    const checkinMap = {};
    checkins.forEach(c => {
      checkinMap[c.date] = c.count;
    });
    
    // Generate all dates in range
    const result = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const count = checkinMap[dateStr] || 0;
      const percentage = totalHabits > 0 ? Math.round((count / totalHabits) * 100) : 0;
      result.push({
        date: dateStr,
        count,
        percentage,
        level: getHeatmapLevel(percentage)
      });
    }
    
    res.json(result);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// Helper: Get heatmap level (0-4) based on percentage
function getHeatmapLevel(percentage) {
  if (percentage === 0) return 0;
  if (percentage <= 25) return 1;
  if (percentage <= 50) return 2;
  if (percentage <= 75) return 3;
  return 4;
}

// API: Get today's stream (checkins + logs merged)
app.get('/api/stream/today', (req, res) => {
  try {
    const localDate = getLocalDate();
    
    // Union checkins and logs, ordered by time
    const stream = db.prepare(`
      SELECT 'checkin' as type, c.id, c.habit_id, c.checked_at, c.note, 
             time(c.checked_at) as check_time,
             h.name as habit_name,
             h.category
      FROM checkins c 
      JOIN habits h ON c.habit_id = h.id 
      WHERE date(c.checked_at) = ?
      
      UNION ALL
      
      SELECT 'log' as type, l.id, NULL as habit_id, l.created_at as checked_at, 
             l.content as note, 
             time(l.created_at) as check_time,
             NULL as habit_name,
             NULL as category
      FROM logs l
      WHERE date(l.created_at) = ?
      
      ORDER BY checked_at ASC
    `).all(localDate, localDate);
    
    res.json(stream);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get habit stacking info (which habits should be reminded after completing a habit)
app.get('/api/habits/:id/stack-next', (req, res) => {
  try {
    const habitId = validateHabitId(req.params.id);
    if (!habitId) {
      return errorResponse(res, 400, 'Invalid habit ID');
    }
    
    // Find habits that have this habit as their stack_after_id
    const nextHabits = db.prepare(`
      SELECT h.*, 
        (SELECT COUNT(*) FROM checkins c 
         WHERE c.habit_id = h.id AND date(c.checked_at) = ?) as today_checkins
      FROM habits h
      WHERE h.stack_after_id = ?
    `).all(getLocalDate(), habitId);
    
    res.json(nextHabits);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Update checkin with skip reason
app.put('/api/checkins/:id/skip', (req, res) => {
  try {
    const checkinId = validateHabitId(req.params.id);
    if (!checkinId) {
      return errorResponse(res, 400, 'Invalid checkin ID');
    }
    
    const { skip_reason } = req.body;
    const validReasons = ['忘了', '太忙', '身体不适', '其他'];
    const reason = validReasons.includes(skip_reason) ? skip_reason : '其他';
    
    db.prepare('UPDATE checkins SET skip_reason = ? WHERE id = ?').run(reason, checkinId);
    res.json({ success: true, skip_reason: reason });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get habits with streak badges
app.get('/api/habits-with-badges', (req, res) => {
  try {
    const localDate = getLocalDate();
    const habits = db.prepare(`
      SELECT h.*,
        (SELECT COUNT(*) FROM checkins c
         WHERE c.habit_id = h.id AND date(c.checked_at) = ?) as today_checkins
      FROM habits h ORDER BY h.created_at DESC
      LIMIT 100
    `).all(localDate);

    // Get today's date in Asia/Shanghai timezone for streak calculation
    const [ty, tm, td] = localDate.split('-').map(Number);
    const todayDate = new Date(ty, tm - 1, td);
    todayDate.setHours(0, 0, 0, 0);

    // Calculate streak for each habit
    const habitsWithBadges = habits.map(habit => {
      const checkins = db.prepare(`
        SELECT DISTINCT date(checked_at) as check_date
        FROM checkins WHERE habit_id = ? ORDER BY checked_at DESC
        LIMIT 100
      `).all(habit.id);

      let streak = 0;
      let currentDate = new Date(todayDate);

      for (const checkin of checkins) {
        const [cy, cm, cd] = checkin.check_date.split('-').map(Number);
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
      
      // Determine badge
      let badge = null;
      if (streak >= 100) badge = { emoji: '🥇', name: '金牌', level: 3 };
      else if (streak >= 30) badge = { emoji: '🥈', name: '银牌', level: 2 };
      else if (streak >= 7) badge = { emoji: '🥉', name: '铜牌', level: 1 };
      
      return {
        ...habit,
        streak,
        badge
      };
    });
    
    res.json(habitsWithBadges);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get daily progress (completed/total for today)
app.get('/api/stats/progress', (req, res) => {
  try {
    const localDate = getLocalDate();
    
    const totalHabits = db.prepare('SELECT COUNT(*) as count FROM habits').get().count;
    
    const completedHabits = db.prepare(`
      SELECT COUNT(DISTINCT habit_id) as count
      FROM checkins
      WHERE date(checked_at) = ?
    `).get(localDate).count;
    
    const percentage = totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0;
    
    res.json({
      total: totalHabits,
      completed: completedHabits,
      remaining: totalHabits - completedHabits,
      percentage
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// ============================================
// Gap Journal (Logs) APIs
// ============================================

// API: Create a log entry
app.post('/api/logs', (req, res) => {
  try {
    const { content, date } = req.body;
    
    // Validate content
    if (!content || typeof content !== 'string' || !content.trim()) {
      return errorResponse(res, 400, 'Content is required');
    }
    
    const contentResult = validateString(content, NOTE_MAX_LENGTH);
    if (!contentResult.valid) {
      return errorResponse(res, 400, `content: ${contentResult.error}`);
    }
    
    // Support specified date for backdating
    let targetDate = getLocalDate();
    if (date) {
      if (!isValidDate(date)) {
        return errorResponse(res, 400, 'Invalid date format. Use YYYY-MM-DD');
      }
      targetDate = date;
    }
    
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' + 
                    now.getMinutes().toString().padStart(2, '0') + ':' + 
                    now.getSeconds().toString().padStart(2, '0');
    const timestamp = targetDate + ' ' + timeStr;
    
    const result = db.prepare(`
      INSERT INTO logs (content, created_at) VALUES (?, ?)
    `).run(contentResult.value, timestamp);
    
    res.json({ 
      id: result.lastInsertRowid, 
      content: contentResult.value, 
      created_at: timestamp,
      success: true 
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Get logs by date
app.get('/api/logs', (req, res) => {
  try {
    const { date } = req.query;
    
    const targetDate = date && isValidDate(date) ? date : getLocalDate();
    
    const logs = db.prepare(`
      SELECT id, content, created_at, time(created_at) as check_time
      FROM logs
      WHERE date(created_at) = ?
      ORDER BY created_at ASC
    `).all(targetDate);
    
    res.json(logs);
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Update a log entry
app.put('/api/logs/:id', (req, res) => {
  try {
    const logId = validateHabitId(req.params.id);
    if (!logId) {
      return errorResponse(res, 400, 'Invalid log ID');
    }

    const { content, created_at } = req.body;

    // At least one field must be provided
    if (!content && !created_at) {
      return errorResponse(res, 400, 'At least one field (content or created_at) is required');
    }

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (content !== undefined) {
      const contentResult = validateString(content, NOTE_MAX_LENGTH);
      if (!contentResult.valid) {
        return errorResponse(res, 400, `content: ${contentResult.error}`);
      }
      updates.push('content = ?');
      params.push(content);
    }

    if (created_at !== undefined) {
      // Validate datetime format
      if (!created_at || typeof created_at !== 'string') {
        return errorResponse(res, 400, 'Invalid created_at format');
      }
      updates.push('created_at = ?');
      params.push(created_at);
    }

    params.push(logId);

    const sql = `UPDATE logs SET ${updates.join(', ')} WHERE id = ?`;
    const result = db.prepare(sql).run(...params);

    if (result.changes === 0) {
      return errorResponse(res, 404, 'Log not found');
    }

    res.json({ success: true });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// API: Delete a log entry
app.delete('/api/logs/:id', (req, res) => {
  try {
    const logId = validateHabitId(req.params.id);
    if (!logId) {
      return errorResponse(res, 400, 'Invalid log ID');
    }

    const result = db.prepare('DELETE FROM logs WHERE id = ?').run(logId);
    res.json({ success: result.changes > 0 });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing database connection...');
  if (db) db.close();
  process.exit(0);
});

// Global exception handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Give time for logging before exit
  setTimeout(() => process.exit(1), 1000);
});

// Error handling middleware (must be after all routes)
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (res.headersSent) return next(err);
  return errorResponse(res, 500, err.message || 'Internal server error');
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Habit Tracker Web API running at http://localhost:${PORT}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Timezone: ${TIMEZONE}`);
  console.log(`Auth: ${ADMIN_PASSWORD ? 'Enabled' : 'Disabled (development mode)'}`);
});