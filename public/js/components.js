// components.js - UI Components and Rendering
// Note: Configuration (HabitCategories, IdentityLabels, etc.) is defined in config.js

/**
 * Escape HTML special characters for safe attribute values
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Global Markdown/HTML renderer - unified implementation
 * Used by renderRecordItem, renderStream, etc.
 * Supports both HTML content (from TipTap) and plain text/Markdown
 * Uses DOMPurify for XSS protection
 */
function renderMd(text) {
  if (!text) return '';

  // Check if DOMPurify is available
  if (typeof window.DOMPurify !== 'undefined') {
    // Check if content is HTML (from TipTap editor)
    if (text.trim().startsWith('<') && text.includes('</')) {
      // Use DOMPurify to sanitize HTML content
      return window.DOMPurify.sanitize(text);
    }

    // Check for marked library for Markdown
    if (typeof marked !== 'undefined' && marked.parse) {
      try {
        marked.setOptions({
          breaks: true,
          gfm: true,
          headerIds: false,
          mangle: false
        });
        const html = marked.parse(text);
        // Sanitize the parsed Markdown HTML
        return window.DOMPurify.sanitize(html);
      } catch (e) {
        console.warn('Markdown parse error, using fallback:', e);
      }
    }

    // Fallback: Simple markdown parsing then sanitize
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const html = escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\[(.+?)\]\((.+?)\)/g, (match, linkText, url) => {
        const trimmedUrl = url.trim();
        // Only allow safe protocols
        if (trimmedUrl.startsWith('http://') ||
            trimmedUrl.startsWith('https://') ||
            trimmedUrl.startsWith('mailto:') ||
            trimmedUrl.startsWith('/')) {
          return `<a href="${trimmedUrl}">${linkText}</a>`;
        }
        return `[${linkText}](${trimmedUrl})`;
      })
      .replace(/\n/g, '<br>');

    return window.DOMPurify.sanitize(html);
  }

  // DOMPurify not available - fallback to basic sanitization (should not happen)
  console.warn('DOMPurify not loaded, using fallback sanitization');
  if (text.trim().startsWith('<') && text.includes('</')) {
    return text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<(iframe|object|embed|form|input|button|link|style|base|meta|applet|xml)\b[^>]*>.*?<\/\1>/gi, '')
      .replace(/<(iframe|object|embed|form|input|button|link|style|base|meta|applet|xml)\b[^>]*\/?>/gi, '')
      .replace(/(<[^>]+)(\s+on\w+=)/gi, '$1')
      .replace(/(href|src)\s*=\s*["']?\s*(javascript|data|vbscript)\s*:[^"'\s>]*/gi, '$1=""');
  }

  // Plain text fallback
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

/**
 * Empty State Component
 */
function renderEmpty(icon, text, action = null) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-text">${text}</div>
      ${action ? `<button class="btn btn-primary btn-sm" onclick="${action.onclick}">${action.text}</button>` : ''}
    </div>
  `;
}

/**
 * Parse habit tags from JSON string
 */
function parseHabitTags(tagsJson) {
  try {
    return tagsJson ? JSON.parse(tagsJson) : [];
  } catch (e) {
    console.warn('Failed to parse habit tags:', e);
    return [];
  }
}

/**
 * Get badge info from streak value
 */
function getHabitBadge(streak, streakData) {
  if (streakData && streakData.badge) {
    return streakData.badge;
  }
  if (streak) {
    if (streak >= 100) return { emoji: '🥇', name: '金牌', level: 3 };
    if (streak >= 30) return { emoji: '🥈', name: '银牌', level: 2 };
    if (streak >= 7) return { emoji: '🥉', name: '铜牌', level: 1 };
  }
  return null;
}

/**
 * Render habit tags HTML
 */
function renderHabitTags(tags) {
  if (!tags || tags.length === 0) return '';

  return `
    <span class="habit-tags">
      ${tags.slice(0, 3).map(tag => {
        const preset = window.PresetTags.find(p => p.name === tag);
        return `<span class="habit-tag" style="--tag-color: ${preset?.color || '#64748b'}">${tag}</span>`;
      }).join('')}
    </span>
  `;
}

/**
 * Habit Item Component
 */
function renderHabitItem(habit, index = 0, streakData = null) {
  const icon = window.HabitIcons[habit.name] || '✓';
  const done = habit.today_checkins > 0;
  const category = habit.category || 'other';
  const catInfo = window.HabitCategories[category] || window.HabitCategories.other;
  const allowDuplicate = habit.allow_duplicate ? '🔁' : '';

  const tags = parseHabitTags(habit.tags);
  const identityKey = habit.identity_label;
  const identityInfo = identityKey && window.IdentityLabels[identityKey] ? window.IdentityLabels[identityKey] : null;
  const badge = getHabitBadge(habit.streak, streakData);

  return `
    <div class="habit-item ${done ? 'checked' : ''}"
         data-id="${habit.id}"
         data-category="${category}"
         style="animation-delay: ${index * 0.05}s">
      <div class="habit-check ${done ? 'checked' : ''}"
           role="button"
           aria-label="${done ? '取消打卡' : '打卡'} ${escapeHtml(habit.name)}"
           aria-pressed="${done}"
           tabindex="0"
           data-action="toggle-checkin"
           data-params='{"habitId":${habit.id}}'>
        ${done ? '<span class="check-icon">✓</span>' : ''}
      </div>
      <div class="habit-content">
        <div class="habit-name">
          <span class="habit-icon">${icon}</span>
          ${escapeHtml(habit.name)}
          ${badge ? `<span class="streak-badge ${['bronze', 'silver', 'gold'][badge.level - 1]}" title="${badge.name} - 连续${habit.streak || streakData?.streak || 0}天">${badge.emoji}</span>` : ''}
          ${allowDuplicate ? `<span class="habit-dup-icon" title="允许重复打卡">${allowDuplicate}</span>` : ''}
        </div>
        <div class="habit-meta">
          <span class="habit-category" style="--cat-color: ${catInfo.color}">
            ${catInfo.icon} ${catInfo.name}
          </span>
          ${identityInfo ? `<span class="identity-label" style="--tag-color: ${identityInfo.color}">${identityInfo.icon} ${identityInfo.name}</span>` : ''}
          ${renderHabitTags(tags)}
          ${habit.reminder_hours ? `<span class="habit-time">⏰ ${habit.reminder_hours}</span>` : ''}
          <span class="habit-streak" data-streak="${habit.id}">🔥 加载中...</span>
        </div>
      </div>
      <div class="habit-actions">
        <button class="btn btn-xs btn-ghost" data-action="edit-habit" data-params='{"habitId":${habit.id}}' aria-label="编辑习惯 ${escapeHtml(habit.name)}">✏️</button>
        <button class="btn btn-xs btn-ghost" data-action="delete-habit" data-params='{"habitId":${habit.id}}' aria-label="删除习惯 ${escapeHtml(habit.name)}">🗑️</button>
      </div>
    </div>
  `;
}

/**
 * Quick Action Button Component
 */
function renderQuickButton(habit) {
  const icon = window.HabitIcons[habit.name] || '✓';
  const done = habit.today_checkins > 0;

  return `
    <button class="quick-btn ${done ? 'done' : ''}"
            data-action="toggle-checkin"
            data-params='{"habitId":${habit.id}}'
            data-habit-id="${habit.id}">
      ${icon} ${escapeHtml(habit.name)}
    </button>
  `;
}

/**
 * Calendar Day Component
 */
function renderCalendarDay(dateStr, day, isToday, isChecked, isOtherMonth) {
  let classes = 'calendar-day';
  if (isOtherMonth) classes += ' other-month';
  if (isToday) classes += ' today';
  if (isChecked) classes += ' checked';

  // Escape dateStr for safe insertion into data-params
  const escapedDateStr = escapeAttr(dateStr);
  return `
    <div class="${classes}" data-action="show-date-detail" data-params='{"date":"${escapedDateStr}"}'>${day}</div>
  `;
}

/**
 * Calendar Grid Component
 */
function renderCalendarGrid(year, month, checkedDates = []) {
  const today = formatDateISO(new Date());
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  
  let html = days.map(d => `<div class="calendar-day-header">${d}</div>`).join('');
  
  const firstDay = start.getDay();
  const daysInMonth = end.getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  
  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    html += `<div class="calendar-day other-month">${d}</div>`;
  }
  
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === today;
    const isChecked = checkedDates.includes(dateStr);
    html += renderCalendarDay(dateStr, d, isToday, isChecked, false);
  }
  
  // Next month days (fill to 42 cells)
  const remaining = 42 - (firstDay + daysInMonth);
  for (let d = 1; d <= remaining; d++) {
    html += `<div class="calendar-day other-month">${d}</div>`;
  }
  
  return html;
}

/**
 * Meal Card Component
 */
function renderMealCard(name, meal) {
  const icons = { '早餐': '🌅', '午餐': '☀️', '晚餐': '🌙' };
  const icon = icons[name] || '🍽️';
  const hasRecord = meal && meal.note;

  return `
    <div class="meal-card ${hasRecord ? 'has-record' : ''}" data-action="open-meal-input" data-params='{"name":"${name}"}'>
      <div class="meal-icon">${icon}</div>
      <div class="meal-content">
        <div class="meal-name">${name}</div>
        <div class="meal-note ${!hasRecord ? 'empty' : ''}">${hasRecord ? escapeHtml(meal.note) : '点击记录'}</div>
        ${hasRecord ? '<div class="meal-status">✅ 已记录</div>' : ''}
      </div>
    </div>
  `;
}

/**
 * Record Item Component
 */
function renderRecordItem(record) {
  return `
    <div class="record-item" data-id="${record.id}" data-note="${escapeHtml(record.note || '')}">
      <div class="record-header">
        <span class="record-habit-name">📌 ${escapeHtml(record.habit_name)}</span>
        <span class="record-time">🕐 ${record.check_time || ''}</span>
        <div class="record-actions">
          <button class="record-btn edit" data-action="edit-record" title="编辑">✏️</button>
          <button class="record-btn delete" data-action="delete-record" title="删除">🗑️</button>
        </div>
      </div>
      <div class="record-note markdown-content ${!record.note ? 'empty' : ''}">${record.note ? renderMd(record.note) : '无备注'}</div>
    </div>
  `;
}

/**
 * Date Group Component (for history)
 */
function renderDateGroup(date, records) {
  const dateObj = new Date(date);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = weekdays[dateObj.getDay()];

  return `
    <div class="date-group">
      <div class="date-group-header" data-action="toggle-date-group">
        <span class="date-group-title">📅 ${date} ${weekday}</span>
        <div class="date-group-stats">
          <span class="date-group-badge">${records.length} 条</span>
          <span class="date-group-toggle">▼</span>
        </div>
      </div>
      <div class="date-group-content" style="max-height: ${records.length * 80}px">
        ${records.map(r => renderRecordItem(r)).join('')}
      </div>
    </div>
  `;
}

/**
 * Full Record Item Component (supports both checkin and log types)
 */
function renderFullRecordItem(record) {
  const isLog = record.type === 'log';
  const renderedNote = record.note ? renderMd(record.note) : '';

  if (isLog) {
    // 日记项
    return `
      <div class="record-item log-item" data-id="${record.id}" data-type="log" data-checked-at="${record.checked_at}" data-note="${escapeHtml(record.note || '')}" data-rendered-note="${escapeHtml(renderedNote)}">
        <div class="record-header">
          <span class="record-habit-name" style="color: var(--purple);">💭 日记</span>
          <span class="record-time">🕐 ${record.check_time || ''}</span>
          <div class="record-actions">
            <button class="record-btn edit" data-action="edit-history-log" title="编辑">✏️</button>
            <button class="record-btn delete" data-action="delete-history-log" title="删除">🗑️</button>
          </div>
        </div>
        <div class="record-note markdown-content">${renderedNote || '无内容'}</div>
      </div>
    `;
  } else {
    // 打卡项
    return `
      <div class="record-item checkin-item" data-id="${record.id}" data-type="checkin" data-checked-at="${record.checked_at}" data-note="${escapeHtml(record.note || '')}" data-rendered-note="${escapeHtml(renderedNote)}">
        <div class="record-header">
          <span class="record-habit-name">📌 ${escapeHtml(record.habit_name)}</span>
          <span class="record-time">🕐 ${record.check_time || ''}</span>
          <div class="record-actions">
            <button class="record-btn edit" data-action="edit-history-checkin" title="编辑">✏️</button>
            <button class="record-btn delete" data-action="delete-history-checkin" title="删除">🗑️</button>
          </div>
        </div>
        <div class="record-note markdown-content ${!record.note ? 'empty' : ''}">${renderedNote || '无备注'}</div>
      </div>
    `;
  }
}

/**
 * Full Date Group Component (includes both checkins and logs)
 */
function renderFullDateGroup(date, records) {
  const dateObj = new Date(date);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = weekdays[dateObj.getDay()];

  const checkinCount = records.filter(r => r.type !== 'log').length;
  const logCount = records.filter(r => r.type === 'log').length;
  const statsText = logCount > 0 ? `${checkinCount} 打卡 · ${logCount} 日记` : `${records.length} 条`;

  return `
    <div class="date-group">
      <div class="date-group-header" data-action="toggle-date-group">
        <span class="date-group-title">📅 ${date} ${weekday}</span>
        <div class="date-group-stats">
          <span class="date-group-badge">${statsText}</span>
          <span class="date-group-toggle">▼</span>
        </div>
      </div>
      <div class="date-group-content" style="max-height: ${records.length * 200}px">
        ${records.map(r => renderFullRecordItem(r)).join('')}
      </div>
    </div>
  `;
}

/**
 * Stat Pill Component
 */
function renderStatPill(value, label, id = '') {
  return `
    <div class="stat-pill">
      <div class="val" id="${id}">${value}</div>
      <div class="lbl">${label}</div>
    </div>
  `;
}

/**
 * Tab Button Component
 */
function renderTab(id, icon, label, active = false) {
  return `
    <div class="tab ${active ? 'active' : ''}" data-tab="${id}" data-action="switch-tab" data-params='{"tab":"${id}"}'>
      ${icon} ${label}
    </div>
  `;
}

/**
 * Category Filter Buttons
 */
function renderCategoryFilter(selected = '') {
  const categories = Object.entries(window.HabitCategories);

  return `
    <div class="category-filter">
      <button class="category-btn ${!selected ? 'active' : ''}" data-action="filter-category" data-params='{"category":""}'>全部</button>
      ${categories.map(([key, cat]) => `
        <button class="category-btn ${selected === key ? 'active' : ''}"
                data-action="filter-category"
                data-params='{"category":"${key}"}'
                style="--cat-color: ${cat.color}">
          ${cat.icon} ${cat.name}
        </button>
      `).join('')}
    </div>
  `;
}

/**
 * Statistics Chart Component (using CSS bars)
 */
function renderStatsChart(data, title = '打卡统计') {
  if (!data || data.length === 0) {
    return renderEmpty('📊', '暂无数据');
  }
  
  const maxCount = Math.max(...data.map(d => d.count), 1);
  
  return `
    <div class="stats-chart">
      <h3 class="chart-title">${title}</h3>
      <div class="chart-bars">
        ${data.slice(0, 7).map(d => `
          <div class="chart-bar-container">
            <div class="chart-bar" style="height: ${(d.count / maxCount) * 100}%">
              <span class="chart-value">${d.count}</span>
            </div>
            <span class="chart-label">${d.label || d.date}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Modal Component
 */
let lastFocusedElement = null; // Store element that opened modal for focus restoration

function showModal(title, content, options = {}) {
  const modal = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');

  // Store the currently focused element for restoration later
  lastFocusedElement = document.activeElement;

  titleEl.innerHTML = title;
  bodyEl.innerHTML = content;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');

  // Trap focus within modal
  modal.addEventListener('keydown', trapModalFocus);

  // Focus first input if any, otherwise focus the close button
  const firstInput = bodyEl.querySelector('input, textarea, [tabindex]:not([tabindex="-1"])');
  const closeBtn = modal.querySelector('.modal-close');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 100);
  } else if (closeBtn) {
    setTimeout(() => closeBtn.focus(), 100);
  }
}

/**
 * Trap focus within modal dialog
 * @param {KeyboardEvent} e - Keyboard event
 */
function trapModalFocus(e) {
  if (e.key !== 'Tab') return;

  const modal = document.getElementById('modalOverlay');
  const focusableElements = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  if (e.shiftKey) {
    // Shift+Tab
    if (document.activeElement === firstFocusable) {
      e.preventDefault();
      lastFocusable.focus();
    }
  } else {
    // Tab
    if (document.activeElement === lastFocusable) {
      e.preventDefault();
      firstFocusable.focus();
    }
  }
}

/**
 * Close modal and clean up resources
 * @param {Event} [event] - Optional click event (if called from overlay click)
 * @param {boolean} [force] - Force close regardless of event target
 */
function closeModal(event, force = false) {
  // Only ignore if clicked inside modal content (not on overlay)
  // unless force is true
  if (!force && event && event.target !== document.getElementById('modalOverlay')) {
    return;
  }
  const modal = document.getElementById('modalOverlay');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');

  // Remove focus trap
  modal.removeEventListener('keydown', trapModalFocus);

  // Destroy modal TipTap editor if exists
  if (typeof destroyModalTipTapEditor === 'function') {
    destroyModalTipTapEditor();
  }

  // Restore focus to the element that opened the modal
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

/**
 * Virtual Scroll Container (for large lists)
 */
class VirtualScroll {
  constructor(container, options = {}) {
    this.container = container;
    this.itemHeight = options.itemHeight || 80;
    this.buffer = options.buffer || 5;
    this.items = [];
    this.renderFn = options.renderFn || ((item) => `<div>${item}</div>`);
    this.scrollTop = 0;
    this.visibleStart = 0;
    this.visibleEnd = 0;
    
    this.init();
  }
  
  init() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'virtual-scroll-wrapper';
    this.viewport = document.createElement('div');
    this.viewport.className = 'virtual-scroll-viewport';
    
    this.container.innerHTML = '';
    this.container.appendChild(this.wrapper);
    this.wrapper.appendChild(this.viewport);
    
    this.wrapper.addEventListener('scroll', throttle(() => this.onScroll(), 16));
  }
  
  setItems(items) {
    this.items = items;
    this.totalHeight = items.length * this.itemHeight;
    this.viewport.style.height = `${this.totalHeight}px`;
    this.render();
  }
  
  onScroll() {
    this.scrollTop = this.wrapper.scrollTop;
    this.render();
  }
  
  render() {
    const start = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.buffer);
    const end = Math.min(this.items.length, Math.ceil((this.scrollTop + this.wrapper.clientHeight) / this.itemHeight) + this.buffer);
    
    if (start !== this.visibleStart || end !== this.visibleEnd) {
      this.visibleStart = start;
      this.visibleEnd = end;
      
      const fragment = document.createDocumentFragment();
      const offsetY = start * this.itemHeight;
      
      const content = document.createElement('div');
      content.style.transform = `translateY(${offsetY}px)`;
      content.className = 'virtual-scroll-content';
      
      for (let i = start; i < end; i++) {
        const itemEl = document.createElement('div');
        itemEl.className = 'virtual-scroll-item';
        itemEl.innerHTML = this.renderFn(this.items[i], i);
        content.appendChild(itemEl);
      }
      
      this.viewport.innerHTML = '';
      this.viewport.appendChild(content);
    }
  }
  
  scrollTo(index) {
    this.wrapper.scrollTop = index * this.itemHeight;
  }
}

/**
 * Render Daily Progress Bar
 */
function renderProgressBar(progress) {
  const container = document.getElementById('progressBarContainer');
  if (!container) return;
  
  const stats = document.getElementById('progressStats');
  const fill = document.getElementById('progressBarFill');
  const percentage = document.getElementById('progressPercentage');
  
  if (stats) stats.textContent = `${progress.completed}/${progress.total}`;
  if (fill) fill.style.width = `${progress.percentage}%`;
  if (percentage) percentage.textContent = `${progress.percentage}%`;
}

/**
 * Render Heatmap
 */
function renderHeatmap(data) {
  const grid = document.getElementById('heatmapGrid');
  if (!grid || !data || data.length === 0) return;
  
  // Take last 90 days
  const recentData = data.slice(-90);

  grid.innerHTML = recentData.map(day => `
    <div class="heatmap-cell level-${day.level}"
         title="${day.date}: ${day.count}次 (${day.percentage}%)"
         data-action="show-heatmap-date"
         data-params='{"date":"${day.date}"}'>
    </div>
  `).join('');
}

/**
 * Render Timeline (checkins + logs merged)
 */
function renderTimeline(timeline) {
  const container = document.getElementById('timelineList');
  if (!container) return;
  
  if (!timeline || timeline.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">今天还没有记录</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="timeline-list">
      ${timeline.map(item => {
        const isLog = item.type === 'log';
        const time = item.check_time?.slice(0, 5) || '';

        if (isLog) {
          // Log entry - different style
          return `
            <div class="timeline-item timeline-log">
              <span class="timeline-time">${time}</span>
              <span class="timeline-content timeline-log-content">
                💭 ${renderMd(item.note || '')}
              </span>
            </div>
          `;
        } else {
          // Checkin entry
          return `
            <div class="timeline-item">
              <span class="timeline-time">${time}</span>
              <span class="timeline-content">
                ${window.HabitIcons[item.habit_name] || '✓'} ${escapeHtml(item.habit_name)}
                ${item.note ? `<span style="color: var(--text-light); font-size: 12px;">- ${renderMd(item.note)}</span>` : ''}
              </span>
            </div>
          `;
        }
      }).join('')}
    </div>
  `;
}

/**
 * Render Stream Log Item (日志项)
 */
function renderStreamLogItem(item) {
  const time = item.check_time?.slice(0, 5) || '';
  const createdAt = item.checked_at || '';
  const renderedNote = renderMd(item.note || '');

  return `
    <div class="stream-item log" data-id="${item.id}" data-checked-at="${createdAt}" data-note="${escapeHtml(item.note || '')}" data-rendered-note="${escapeHtml(renderedNote)}">
      <div class="stream-time">${time}</div>
      <div class="stream-content">
        <div class="stream-title">
          <span class="stream-type-icon">💭</span>
          想法
        </div>
        <div class="stream-note markdown-content">${renderedNote}</div>
      </div>
      <div class="stream-actions">
        <button class="stream-action-btn" data-action="edit-log" data-params='{"logId":${item.id}}' aria-label="修改日志">🕐</button>
        <button class="stream-action-btn" data-action="delete-log" data-params='{"logId":${item.id}}' aria-label="删除日志">🗑️</button>
      </div>
    </div>
  `;
}

/**
 * Render Stream Checkin Item (打卡项)
 */
function renderStreamCheckinItem(item) {
  const time = item.check_time?.slice(0, 5) || '';
  const checkedAt = item.checked_at || '';
  const renderedNote = item.note ? renderMd(item.note) : '';

  return `
    <div class="stream-item checkin" data-id="${item.id}" data-checked-at="${checkedAt}" data-habit-name="${escapeHtml(item.habit_name)}" data-note="${escapeHtml(item.note || '')}" data-rendered-note="${escapeHtml(renderedNote)}">
      <div class="stream-time">${time}</div>
      <div class="stream-content">
        <div class="stream-title">
          <span class="stream-type-icon">${window.HabitIcons[item.habit_name] || '✓'}</span>
          ${escapeHtml(item.habit_name)}
        </div>
        <div class="stream-note markdown-content">${renderedNote || '<span style="color: var(--text-light); font-style: italic;">无备注</span>'}</div>
      </div>
      <div class="stream-actions">
        <button class="stream-action-btn" data-action="edit-checkin" data-params='{"checkinId":${item.id}}' aria-label="修改打卡时间">🕐</button>
        <button class="stream-action-btn" data-action="delete-checkin" data-params='{"checkinId":${item.id}}' aria-label="删除打卡">🗑️</button>
      </div>
    </div>
  `;
}

/**
 * Render Stream (记录流 - 首页)
 */
function renderStream(stream) {
  const container = document.getElementById('streamList');
  if (!container) return;

  if (!stream || stream.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px 20px;">
        <div class="empty-icon">📭</div>
        <div class="empty-text">今天还没有记录</div>
        <div style="font-size: 12px; color: var(--text-light); margin-top: 8px;">
          在上方输入框写下想法，或点击「打卡」记录习惯
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = stream.map(item => {
    return item.type === 'log'
      ? renderStreamLogItem(item)
      : renderStreamCheckinItem(item);
  }).join('');
}

/**
 * Render Streak Badge
 */
function renderStreakBadge(streak) {
  if (streak >= 100) {
    return `<span class="streak-badge gold" title="金牌 - 连续${streak}天">🥇</span>`;
  }
  if (streak >= 30) {
    return `<span class="streak-badge silver" title="银牌 - 连续${streak}天">🥈</span>`;
  }
  if (streak >= 7) {
    return `<span class="streak-badge bronze" title="铜牌 - 连续${streak}天">🥉</span>`;
  }
  return '';
}

/**
 * Render Tag Selector
 */
function renderTagSelector(selectedTags = []) {
  return `
    <div class="form-group">
      <label>标签</label>
      <div class="tag-selector">
        ${window.PresetTags.map(tag => `
          <button type="button" class="tag-option ${selectedTags.includes(tag.name) ? 'selected' : ''}"
                  data-action="toggle-tag" data-params='{"tag":"${tag.name}"}'
                  style="--tag-color: ${tag.color}">
            ${tag.name}
          </button>
        `).join('')}
      </div>
      <input type="text" id="customTagInput" placeholder="自定义标签（逗号分隔）"
             value="${selectedTags.filter(t => !window.PresetTags.find(p => p.name === t)).join(', ')}"
             style="margin-top: 8px;">
    </div>
  `;
}

/**
 * Render Identity Selector
 */
function renderIdentitySelector(selectedKey = '') {
  return `
    <div class="form-group">
      <label>身份认同 - 我想成为...</label>
      <div class="identity-selector">
        ${Object.entries(window.IdentityLabels).map(([key, label]) => `
          <div class="identity-option ${selectedKey === key ? 'selected' : ''}"
               data-action="select-identity" data-params='{"key":"${key}"}'>
            <div class="identity-option-icon">${label.icon}</div>
            <div class="identity-option-text">${label.name}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render Reminder Period Selector
 */
function renderReminderPeriodSelector(selectedPeriod = '') {
  return `
    <div class="form-group">
      <label>提醒时段</label>
      <div class="reminder-period-grid">
        ${Object.entries(window.ReminderPeriods).map(([key, period]) => `
          <div class="reminder-period-option ${selectedPeriod === key ? 'selected' : ''}"
               data-action="select-reminder-period" data-params='{"key":"${key}"}'>
            ${period.icon} ${period.name}
            <br><small style="color: var(--text-light)">${period.time}</small>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render Habit Stack Selector
 */
function renderHabitStackSelector(habits, currentHabitId = null, selectedStackId = null) {
  const availableHabits = habits.filter(h => h.id !== currentHabitId);
  
  return `
    <div class="form-group stack-habit-select">
      <label>习惯堆叠 - 当完成以下习惯后提醒</label>
      <select id="stackAfterSelect" class="filter-select">
        <option value="">无</option>
        ${availableHabits.map(h => `
          <option value="${h.id}" ${selectedStackId === h.id ? 'selected' : ''}>
            ${window.HabitIcons[h.name] || '✓'} ${escapeHtml(h.name)}
          </option>
        `).join('')}
      </select>
      <p class="stack-hint">当选择的前置习惯完成后，会自动提醒这个习惯</p>
    </div>
  `;
}

/**
 * Render Skip Reason Modal
 */
function renderSkipReasonModal(checkinId, habitName) {
  // Escape habitName for safe insertion
  const escapedName = escapeHtml(habitName);
  const escapedNameAttr = escapeAttr(habitName);

  return `
    <div class="skip-reason-container">
      <p style="margin-bottom: 12px; color: var(--text-light);">
        为什么没有完成「<strong>${escapedName}</strong>」？
      </p>
      ${window.SkipReasons.map(reason => `
        <button class="skip-reason-btn" data-action="submit-skip-reason" data-params='{"checkinId":${checkinId},"reason":"${escapeAttr(reason)}"}'>
          ${escapeHtml(reason)}
        </button>
      `).join('')}
      <button class="btn btn-secondary" style="margin-top: 12px; width: 100%;" data-action="close-modal">
        取消
      </button>
    </div>
  `;
}

/**
 * Render Repeat Mode Selector (重复打卡模式选择)
 */
function renderRepeatModeSelector(selectedMode = 'new_record') {
  return `
    <div class="form-group">
      <label>重复打卡模式</label>
      <div class="repeat-mode-selector">
        ${Object.entries(window.RepeatModes).map(([key, mode]) => `
          <div class="repeat-mode-option ${selectedMode === key ? 'selected' : ''}"
               data-action="select-repeat-mode" data-params='{"key":"${key}"}'>
            <div class="repeat-mode-icon">${mode.icon}</div>
            <div class="repeat-mode-content">
              <div class="repeat-mode-name">${mode.name}</div>
              <div class="repeat-mode-desc">${mode.desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Check Success Animation
 */
function playCheckSuccessAnimation(habitItem) {
  if (!habitItem) return;
  
  // Add animation classes
  habitItem.classList.add('success-animation');
  const checkBox = habitItem.querySelector('.habit-check');
  if (checkBox) checkBox.classList.add('success-animation');
  
  // Add success text
  const successText = document.createElement('span');
  successText.className = 'check-success-text';
  successText.textContent = '✓ 完成！';
  habitItem.appendChild(successText);
  
  // Remove after animation
  setTimeout(() => {
    habitItem.classList.remove('success-animation');
    if (checkBox) checkBox.classList.remove('success-animation');
    successText.remove();
  }, 1500);
}

// CommonJS export (for Node.js/testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LoadingState,
    Toast,
    renderEmpty,
    renderHabitItem,
    renderQuickButton,
    renderCalendarGrid,
    renderMealCard,
    renderRecordItem,
    renderDateGroup,
    renderStatPill,
    renderTab,
    renderCategoryFilter,
    renderStatsChart,
    showModal,
    closeModal,
    VirtualScroll,
    renderProgressBar,
    renderHeatmap,
    renderTimeline,
    renderStreakBadge,
    renderTagSelector,
    renderIdentitySelector,
    renderReminderPeriodSelector,
    renderHabitStackSelector,
    renderSkipReasonModal,
    renderRepeatModeSelector,
    playCheckSuccessAnimation
  };
}