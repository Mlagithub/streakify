// app.js - Main Application Logic
// Note: createReactiveState and AppState are defined in state.js

// =====================
// State Subscriptions
// =====================

// Set up reactive state subscriptions
AppState.subscribe('habits', () => {
  renderHabits();
  renderQuickActions();
});

AppState.subscribe('selectedCategory', () => {
  renderHabits();
  initCategoryFilter();
});

AppState.subscribe('theme', (newTheme) => {
  localStorage.setItem('theme', newTheme);
  updateThemeToggle();
});

// =====================
// Initialization Error Handling
// =====================

/**
 * Critical init functions that block app functionality
 */
const CRITICAL_INIT_FUNCTIONS = ['initTipTap', 'loadHabits'];

/**
 * Important init functions that affect core features
 */
const IMPORTANT_INIT_FUNCTIONS = ['loadProgress', 'loadStream'];

/**
 * Track initialization status
 */
const initStatus = {
  completed: new Set(),
  failed: new Map(), // functionName -> error
  retryCallbacks: new Map() // functionName -> retry function
};

/**
 * Show initialization error UI
 * @param {string} functionName - Name of failed function
 * @param {Error} error - The error that occurred
 * @param {Function} retryCallback - Function to retry initialization
 * @param {boolean} isCritical - Whether this is a critical failure
 */
function showInitError(functionName, error, retryCallback, isCritical = false) {
  initStatus.failed.set(functionName, error);
  initStatus.retryCallbacks.set(functionName, retryCallback);

  // Get or create error container
  let errorContainer = document.getElementById('init-error-container');
  if (!errorContainer) {
    errorContainer = document.createElement('div');
    errorContainer.id = 'init-error-container';
    errorContainer.className = 'init-error-container';
    // Insert after header
    const header = document.querySelector('.header');
    if (header && header.nextSibling) {
      header.parentNode.insertBefore(errorContainer, header.nextSibling);
    } else {
      document.body.insertBefore(errorContainer, document.body.firstChild);
    }
  }

  // Create error message
  const errorDiv = document.createElement('div');
  errorDiv.className = `init-error ${isCritical ? 'critical' : 'warning'}`;
  errorDiv.dataset.function = functionName;

  const icon = isCritical ? '❌' : '⚠️';
  const message = getInitErrorMessage(functionName, error);

  errorDiv.innerHTML = `
    <span class="error-icon">${icon}</span>
    <span class="error-message">${message}</span>
    <button class="btn btn-sm ${isCritical ? 'btn-primary' : 'btn-outline'}" data-action="retry-init" data-params='{"function":"${functionName}"}'>
      重试
    </button>
    <button class="btn btn-sm btn-secondary" data-action="dismiss-init-error" data-params='{"function":"${functionName}"}'>
      忽略
    </button>
  `;

  errorContainer.appendChild(errorDiv);

  // Log for debugging
  console.error(`Init failed [${functionName}]:`, error);
}

/**
 * Get user-friendly error message for init function
 * @param {string} functionName - Name of failed function
 * @param {Error} error - The error
 * @returns {string} User-friendly message
 */
function getInitErrorMessage(functionName, error) {
  const messages = {
    initTipTap: '编辑器初始化失败，无法编辑内容',
    loadHabits: '习惯数据加载失败',
    loadProgress: '进度数据加载失败',
    loadStream: '记录流加载失败',
    initTheme: '主题初始化失败',
    registerServiceWorker: '离线功能初始化失败',
    default: '初始化失败'
  };

  let message = messages[functionName] || messages.default;

  // Add error details for debugging (only in development)
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    message += ` (${error.message || '未知错误'})`;
  }

  return message;
}

/**
 * Retry a failed initialization
 * @param {string} functionName - Name of function to retry
 */
async function retryInitFunction(functionName) {
  const retryCallback = initStatus.retryCallbacks.get(functionName);
  if (!retryCallback) {
    console.warn(`No retry callback for ${functionName}`);
    return;
  }

  const errorDiv = document.querySelector(`.init-error[data-function="${functionName}"]`);
  if (errorDiv) {
    const retryBtn = errorDiv.querySelector('[data-action="retry-init"]');
    if (retryBtn) {
      retryBtn.disabled = true;
      retryBtn.textContent = '重试中...';
    }
  }

  try {
    await retryCallback();

    // Success - remove error display
    initStatus.failed.delete(functionName);
    initStatus.retryCallbacks.delete(functionName);
    initStatus.completed.add(functionName);

    if (errorDiv) {
      errorDiv.remove();
    }

    // Show success toast
    if (typeof showToast === 'function') {
      showToast('重试成功', 'success');
    }

    // Remove container if no more errors
    const container = document.getElementById('init-error-container');
    if (container && container.children.length === 0) {
      container.remove();
    }
  } catch (error) {
    // Retry failed
    if (errorDiv) {
      const retryBtn = errorDiv.querySelector('[data-action="retry-init"]');
      if (retryBtn) {
        retryBtn.disabled = false;
        retryBtn.textContent = '重试';
      }
    }

    if (typeof showToast === 'function') {
      showToast('重试失败: ' + (error.message || '未知错误'), 'error');
    }
  }
}

/**
 * Dismiss an initialization error
 * @param {string} functionName - Name of function to dismiss
 */
function dismissInitError(functionName) {
  const errorDiv = document.querySelector(`.init-error[data-function="${functionName}"]`);
  if (errorDiv) {
    errorDiv.remove();
  }

  initStatus.failed.delete(functionName);
  initStatus.retryCallbacks.delete(functionName);

  // Remove container if no more errors
  const container = document.getElementById('init-error-container');
  if (container && container.children.length === 0) {
    container.remove();
  }
}

/**
 * Show critical error page (when app cannot function)
 * @param {string} message - Error message
 * @param {Function} retryCallback - Retry function
 */
function showCriticalErrorPage(message, retryCallback) {
  const container = document.querySelector('.container');
  if (!container) return;

  container.innerHTML = `
    <div class="critical-error-page">
      <div class="error-icon-large">❌</div>
      <h2>应用加载失败</h2>
      <p class="error-description">${message}</p>
      <div class="error-actions">
        <button class="btn btn-primary" data-action="retry-critical-init">重新加载</button>
        <button class="btn btn-secondary" data-action="reload-page">刷新页面</button>
      </div>
      <p class="error-help">如果问题持续，请检查网络连接或稍后再试</p>
    </div>
  `;

  // Store retry callback
  initStatus.retryCallbacks.set('__critical__', retryCallback);
}

// =====================
// Initialization
// =====================

/**
 * Initialize the application with proper error handling
 */
async function initializeApp() {
  // Start performance measurement
  if (typeof PerformanceMonitor !== 'undefined') {
    PerformanceMonitor.startOperation('app-init');
  }

  // CRITICAL: Init event delegation first (synchronously) so retry buttons work
  // This must succeed before any error UI can be shown
  try {
    initEventDelegation();
    initStatus.completed.add('initEventDelegation');
  } catch (e) {
    console.error('initEventDelegation failed - retry buttons will not work:', e);
    // Still continue, user can refresh page as fallback
  }

  // Define init functions with their retry callbacks
  const initFunctions = [
    { name: 'initTheme', fn: initTheme, priority: 'optional' },
    { name: 'initPullToRefresh', fn: initPullToRefresh, priority: 'optional' },
    { name: 'initTipTap', fn: initTipTap, priority: 'critical' },
    { name: 'loadHabits', fn: loadHabits, priority: 'critical' },
    { name: 'loadProgress', fn: loadProgress, priority: 'important' },
    { name: 'loadStream', fn: loadStream, priority: 'important' },
    { name: 'registerServiceWorker', fn: registerServiceWorker, priority: 'optional' },
    { name: 'initKeyboardShortcuts', fn: initKeyboardShortcuts, priority: 'optional' },
    { name: 'initOfflineIndicator', fn: initOfflineIndicator, priority: 'optional' },
    { name: 'initHorizontalScroll', fn: initHorizontalScroll, priority: 'optional' }
  ];

  let criticalFailed = false;

  for (const { name, fn, priority } of initFunctions) {
    try {
      // Measure critical operations
      if (typeof PerformanceMonitor !== 'undefined' && priority === 'critical') {
        PerformanceMonitor.startOperation(name);
      }

      await fn();
      initStatus.completed.add(name);

      if (typeof PerformanceMonitor !== 'undefined' && priority === 'critical') {
        PerformanceMonitor.endOperation(name);
      }
    } catch (e) {
      const isCritical = priority === 'critical';
      const isImportant = priority === 'important';

      if (typeof PerformanceMonitor !== 'undefined' && priority === 'critical') {
        PerformanceMonitor.endOperation(name);
      }

      if (isCritical) {
        criticalFailed = true;
        showCriticalErrorPage(getInitErrorMessage(name, e), () => initializeApp());
        return; // Stop initialization on critical failure
      }

      showInitError(name, e, fn, isImportant);
      console.error(`${name} failed:`, e);
    }
  }

  // End performance measurement
  if (typeof PerformanceMonitor !== 'undefined') {
    PerformanceMonitor.endOperation('app-init');
    // Log summary in development
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      console.log(PerformanceMonitor.getSummary());
    }
  }
}

document.addEventListener('DOMContentLoaded', initializeApp);

// =====================
// Event Delegation System
// =====================

/**
 * Global event delegation for data-action buttons
 * Replaces inline onclick handlers for better maintainability
 */
function initEventDelegation() {
  // Click event delegation
  document.addEventListener('click', handleDelegatedClick);

  // Keyboard event delegation for accessibility
  document.addEventListener('keydown', handleDelegatedKeydown);
}

/**
 * Handle delegated click events
 * @param {Event} e - Click event
 */
function handleDelegatedClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  const params = target.dataset.params ? JSON.parse(target.dataset.params) : {};

  // Prevent default for buttons
  if (target.tagName === 'BUTTON' || target.classList.contains('btn')) {
    e.preventDefault();
  }

  // Track performance for debugging
  const perfStart = typeof PerformanceMonitor !== 'undefined' && action;

  // Route to appropriate handler
  switch (action) {
    // Header actions
    case 'export-json':
      if (perfStart) PerformanceMonitor.startOperation(`action:${action}`);
      exportData('json');
      if (perfStart) PerformanceMonitor.endOperation(`action:${action}`);
      break;
    case 'export-csv':
      if (perfStart) PerformanceMonitor.startOperation(`action:${action}`);
      exportData('csv');
      if (perfStart) PerformanceMonitor.endOperation(`action:${action}`);
      break;
    case 'toggle-theme':
      toggleTheme();
      break;

    // Tab switching
    case 'switch-tab':
      if (perfStart) PerformanceMonitor.startOperation(`action:${action}`);
      switchTab(params.tab);
      if (perfStart) PerformanceMonitor.endOperation(`action:${action}`);
      break;

    // Editor actions
    case 'insert-emoji':
      insertQuickEmoji(params.emoji);
      break;
    case 'show-habit-picker':
      showHabitPicker();
      break;
    case 'submit-note':
      if (perfStart) PerformanceMonitor.startOperation(`action:${action}`);
      submitQuickNote();
      if (perfStart) PerformanceMonitor.endOperation(`action:${action}`);
      break;

    // Calendar actions
    case 'change-month':
      if (perfStart) PerformanceMonitor.startOperation(`action:${action}`);
      changeMonth(params.delta);
      if (perfStart) PerformanceMonitor.endOperation(`action:${action}`);
      break;
    case 'render-history':
      if (perfStart) PerformanceMonitor.startOperation(`action:${action}`);
      renderHistory();
      if (perfStart) PerformanceMonitor.endOperation(`action:${action}`);
      break;

    // Filter actions
    case 'filter-category':
      filterByCategory(params.category || '');
      break;

    // Modal actions
    case 'close-modal':
      closeModal(null, true);
      break;

    // Habit actions
    case 'toggle-checkin':
      if (params.habitId) toggleCheckin(params.habitId);
      break;
    case 'edit-habit':
      if (params.habitId) editHabit(params.habitId);
      break;
    case 'delete-habit':
      if (params.habitId) deleteHabit(params.habitId);
      break;
    case 'add-habit':
      showAddHabitModal();
      break;

    // Checkin/Log actions
    case 'edit-checkin':
      if (params.checkinId) editCheckinTime(params.checkinId);
      break;
    case 'delete-checkin':
      if (params.checkinId) deleteCheckinFromStream(params.checkinId);
      break;
    case 'edit-log':
      if (params.logId) editLog(params.logId);
      break;
    case 'delete-log':
      if (params.logId) deleteLog(params.logId);
      break;

    // Initialization error handling
    case 'retry-init':
      if (params.function) retryInitFunction(params.function);
      break;
    case 'dismiss-init-error':
      if (params.function) dismissInitError(params.function);
      break;
    case 'retry-critical-init':
      const criticalRetry = initStatus.retryCallbacks.get('__critical__');
      if (criticalRetry) criticalRetry();
      break;
    case 'reload-page':
      location.reload();
      break;

    // Heatmap actions
    case 'show-heatmap-date':
      if (params.date) showHeatmapDateDetail(params.date);
      break;

    // Date group toggle
    case 'toggle-date-group':
      toggleDateGroup(e.target.closest('.date-group-header'));
      break;

    // Skip reason actions
    case 'submit-skip-reason':
      if (params.checkinId && params.reason) submitSkipReason(params.checkinId, params.reason);
      break;

    // Calendar date detail
    case 'show-date-detail':
      if (params.date) showDateDetail(params.date);
      break;

    // Meal input
    case 'open-meal-input':
      if (params.name) openMealInput(params.name);
      break;

    // Record actions (from history)
    case 'edit-record':
      editRecordFromData(e.target.closest('.record-item'));
      break;
    case 'delete-record':
      deleteRecordFromData(e.target.closest('.record-item'));
      break;

    // History log/checkin actions
    case 'edit-history-log':
      editHistoryLog(e.target.closest('.record-item'));
      break;
    case 'delete-history-log':
      deleteHistoryLog(e.target.closest('.record-item'));
      break;
    case 'edit-history-checkin':
      editHistoryCheckin(e.target.closest('.record-item'));
      break;
    case 'delete-history-checkin':
      deleteHistoryCheckin(e.target.closest('.record-item'));
      break;

    // Form selectors
    case 'toggle-tag':
      toggleTagSelection(e.target.closest('.tag-option'), params.tag);
      break;
    case 'select-identity':
      selectIdentity(e.target.closest('.identity-option'), params.key);
      break;
    case 'select-reminder-period':
      selectReminderPeriod(e.target.closest('.reminder-period-option'), params.key);
      break;
    case 'select-repeat-mode':
      selectRepeatMode(e.target.closest('.repeat-mode-option'), params.key);
      break;

    default:
      console.warn('Unknown action:', action);
  }
}

/**
 * Handle delegated keyboard events for accessibility
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleDelegatedKeydown(e) {
  // Tab keyboard navigation
  if (e.target.classList.contains('tab') && e.target.getAttribute('role') === 'tab') {
    const tabs = Array.from(document.querySelectorAll('.tab[role="tab"]'));
    const currentIndex = tabs.indexOf(e.target);

    let newIndex = currentIndex;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      newIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      newIndex = tabs.length - 1;
    }

    if (newIndex !== currentIndex) {
      tabs[newIndex].focus();
      tabs[newIndex].click();
    }
    return;
  }

  // Handle Enter/Space on clickable elements without explicit keyboard handlers
  const target = e.target.closest('[data-action]');
  if (!target) return;

  if (e.key === 'Enter' || e.key === ' ') {
    // Only handle if element doesn't have its own keyboard handler
    if (!target.hasAttribute('onkeydown')) {
      e.preventDefault();
      target.click();
    }
  }
}

// Initialize TipTap WYSIWYG Editor
// Issue 8: Check document.readyState before initialization
function initTipTap() {
  const element = document.getElementById('tiptapEditor');

  if (!element) {
    console.debug('Editor element not found, will retry on DOMContentLoaded');
    // If document not ready, wait for it
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initTipTap());
    }
    return;
  }

  // Check if TipTap is available
  if (typeof window.createTipTapEditor !== 'function') {
    console.error('TipTap bundle not loaded');
    return;
  }

  // Create TipTap editor instance
  const editor = window.createTipTapEditor({
    element: element,
    placeholder: '💭 写下此刻想法，支持所见即所得格式...'
  });

  // Store reference to editor instance
  AppState.tiptapEditor = editor;

  // Initialize toolbar button events
  initToolbarButtons();

  // Set up editor event listeners
  editor.on('update', () => {
    updateToolbarState();
  });

  editor.on('focus', () => {
    element.classList.add('focused');
  });

  editor.on('blur', () => {
    element.classList.remove('focused');
  });

  // Handle Ctrl+Enter to submit
  editor.on('keydown', ({ event }) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitQuickNote();
      return true; // prevent default behavior
    }
    return false;
  });

  console.log('TipTap editor initialized successfully');
}

// Initialize toolbar buttons
function initToolbarButtons() {
  const toolbar = document.getElementById('editorToolbar');
  if (!toolbar) return;

  toolbar.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const level = btn.dataset.level;

      // Get TipTap editor instance
      const editor = AppState.tiptapEditor;
      if (!editor) return;

      // Focus the editor first
      editor.chain().focus();

      switch (action) {
        case 'heading':
          if (level) {
            editor.chain().focus().toggleHeading({ level: parseInt(level) }).run();
          }
          break;
        case 'bold':
          editor.chain().focus().toggleBold().run();
          break;
        case 'italic':
          editor.chain().focus().toggleItalic().run();
          break;
        case 'bulletList':
          editor.chain().focus().toggleBulletList().run();
          break;
        case 'orderedList':
          editor.chain().focus().toggleOrderedList().run();
          break;
        case 'blockquote':
          editor.chain().focus().toggleBlockquote().run();
          break;
        case 'underline':
          editor.chain().focus().toggleUnderline().run();
          break;
        case 'strike':
          editor.chain().focus().toggleStrike().run();
          break;
        case 'code':
          editor.chain().focus().toggleCode().run();
          break;
        case 'link':
          const url = prompt('输入链接地址:', 'https://');
          if (url) {
            // Only allow http/https protocols for security
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              alert('链接地址必须以 http:// 或 https:// 开头');
              break;
            }
            editor.chain().focus().setLink({ href: url }).run();
          }
          break;
        default:
          console.warn('Unknown toolbar action:', action);
      }

      updateToolbarState();
    });
  });
}

// Update toolbar button states (active/inactive)
function updateToolbarState() {
  const toolbar = document.getElementById('editorToolbar');
  if (!toolbar) return;

  const editor = AppState.tiptapEditor;
  if (!editor) return;

  toolbar.querySelectorAll('.tool-btn').forEach(btn => {
    const action = btn.dataset.action;
    let isActive = false;

    switch (action) {
      case 'bold':
        isActive = editor.isActive('bold');
        break;
      case 'italic':
        isActive = editor.isActive('italic');
        break;
      case 'underline':
        isActive = editor.isActive('underline');
        break;
      case 'strike':
        isActive = editor.isActive('strike');
        break;
      case 'code':
        isActive = editor.isActive('code');
        break;
      case 'bulletList':
        isActive = editor.isActive('bulletList');
        break;
      case 'orderedList':
        isActive = editor.isActive('orderedList');
        break;
      case 'blockquote':
        isActive = editor.isActive('blockquote');
        break;
      case 'link':
        isActive = editor.isActive('link');
        break;
      case 'heading':
        if (btn.dataset.level) {
          isActive = editor.isActive('heading', { level: parseInt(btn.dataset.level) });
        }
        break;
      default:
        break;
    }

    btn.classList.toggle('is-active', isActive);
  });
}

// Insert emoji into TipTap editor
function insertQuickEmoji(emoji) {
  const editor = AppState.tiptapEditor;

  if (editor) {
    editor.chain().focus().insertContent(emoji).run();
  }
}

// =====================
// Modal TipTap Editor (for edit modals)
// =====================

// Track modal editor instances for cleanup
const modalEditorRegistry = new Set();

/**
 * Initialize a TipTap editor in a modal
 * @param {string} elementId - The ID of the container element
 * @param {string} content - Initial HTML content
 * @param {string} placeholder - Placeholder text
 * @returns {object|null} - The editor instance or null if failed
 */
function initModalTipTapEditor(elementId, content = '', placeholder = '写点什么...') {
  // Check if TipTap is available
  if (typeof window.createTipTapEditor !== 'function') {
    console.error('TipTap bundle not loaded');
    return null;
  }

  const element = document.getElementById(elementId);
  if (!element) {
    console.error('Editor element not found:', elementId);
    return null;
  }

  // Destroy any existing modal editor first
  destroyModalTipTapEditor();

  // Create TipTap editor instance
  const editor = window.createTipTapEditor({
    element: element,
    placeholder: placeholder,
    content: content
  });

  // Store reference to modal editor instance
  AppState.modalEditor = editor;
  modalEditorRegistry.add(editor);

  return editor;
}

/**
 * Destroy the modal TipTap editor
 */
function destroyModalTipTapEditor() {
  // Clean up tracked instances
  for (const editor of modalEditorRegistry) {
    try {
      editor.destroy();
    } catch (e) {
      console.warn('Failed to destroy editor:', e);
    }
  }
  modalEditorRegistry.clear();

  // Also clean up AppState reference
  if (AppState.modalEditor) {
    try {
      AppState.modalEditor.destroy();
    } catch (e) {
      console.warn('Failed to destroy modal editor:', e);
    }
    AppState.modalEditor = null;
  }
}

/**
 * Get HTML content from modal editor
 * @returns {string} - HTML content
 */
function getModalEditorContent() {
  if (AppState.modalEditor) {
    return AppState.modalEditor.getHTML();
  }
  return '';
}

/**
 * Get plain text content from modal editor
 * @returns {string} - Plain text content
 */
function getModalEditorText() {
  if (AppState.modalEditor) {
    return AppState.modalEditor.getText();
  }
  return '';
}

// Convert TipTap HTML to Markdown

// =====================
// Tab Switching
// =====================
function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    const isActive = tab.dataset.tab === tabId;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  // Update tab content
  document.querySelectorAll('[id^="tab-"]').forEach(content => {
    const isHidden = content.id !== `tab-${tabId}`;
    content.classList.toggle('hidden', isHidden);
    content.setAttribute('aria-hidden', isHidden ? 'true' : 'false');
  });

  // Load content based on tab
  if (tabId === 'habits') {
    renderHabits();
  } else if (tabId === 'stats') {
    renderStats();
    renderCalendar();
    renderHistory();
  } else if (tabId === 'stream') {
    loadStream();
  }
}

// =====================
// Data Sync Helpers
// =====================

/**
 * Check if a date string is today (in Asia/Shanghai timezone)
 * @param {string} dateStr - Date string (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
 * @returns {boolean}
 */
function isToday(dateStr) {
  if (!dateStr) return false;
  const today = getLocalDateISO();
  const date = dateStr.split(' ')[0] || dateStr; // Handle datetime format
  return date === today;
}

/**
 * Refresh both stream and history if the affected data is from today
 * Call this after any create/update/delete operation
 * @param {string} affectedDate - The date of the affected record
 */
function refreshIfToday(affectedDate) {
  if (isToday(affectedDate)) {
    loadStream();
    loadProgress();
    renderHabits();
  }
}

// =====================
// Load Data Functions
// =====================

// Load habits from API
async function loadHabits() {
  try {
    AppState.isLoading = true;
    console.log('[loadHabits] Starting...');
    const habits = await API.get('/api/habits');
    console.log('[loadHabits] Got habits:', habits);
    AppState.habits = habits || [];
    
    // Render quick actions and habits list
    renderQuickActions();
    renderHabits();
    initCategoryFilter();
    updateHabitFilter();
    
    // Load streaks for each habit
    loadStreaks();
  } catch (err) {
    console.error('Failed to load habits:', err);
    Toast.error('加载习惯失败');
  } finally {
    AppState.isLoading = false;
  }
}

// Load streaks for all habits (batch API for performance)
async function loadStreaks() {
  try {
    // Use batch API to avoid N+1 queries
    const streaks = await API.get('/api/habits/streaks');

    // Update DOM for each habit
    for (const habit of AppState.habits) {
      const streak = streaks[habit.id] || 0;
      const streakEl = document.querySelector(`[data-streak="${habit.id}"]`);
      if (streakEl && streak > 0) {
        streakEl.innerHTML = `🔥 ${streak}天`;
      } else if (streakEl) {
        streakEl.innerHTML = '';
      }
    }
  } catch (err) {
    console.error('Failed to load streaks:', err);
  }
}

// Load progress bar
async function loadProgress() {
  try {
    const progress = await API.get('/api/stats/progress');
    renderProgressBar(progress);

    // Update stats display
    const totalCount = document.getElementById('totalCount');
    const todayCount = document.getElementById('todayCount');
    const streakMax = document.getElementById('streakMax');

    if (totalCount) totalCount.textContent = progress.total || 0;
    if (todayCount) todayCount.textContent = progress.completed || 0;

    // Use batch API to get all streaks at once (avoid N+1 queries)
    try {
      const streaks = await API.get('/api/habits/streaks');
      const maxStreak = Object.values(streaks).reduce((max, s) => Math.max(max, s || 0), 0);
      if (streakMax) streakMax.textContent = maxStreak;
    } catch (e) {
      console.warn('Failed to load streaks:', e);
      if (streakMax) streakMax.textContent = 0;
    }
  } catch (err) {
    console.error('Failed to load progress:', err);
  }
}

// Load stream (today's records)
async function loadStream() {
  try {
    const stream = await API.get('/api/stream/today');
    renderStream(stream);
  } catch (err) {
    console.error('Failed to load stream:', err);
  }
}

// =====================
// Render Functions
// =====================

// Render quick action buttons
function renderQuickActions() {
  const container = document.querySelector('.quick-actions');
  if (!container) return;
  
  // Show top 5 most frequent habits
  const quickHabits = AppState.habits.slice(0, 5);
  
  container.innerHTML = quickHabits.map(habit => renderQuickButton(habit)).join('');
}

// Render habits list
function renderHabits() {
  const container = document.getElementById('habitsList');
  if (!container) return;
  
  let habits = AppState.habits;
  
  // Filter by category
  if (AppState.selectedCategory) {
    habits = habits.filter(h => h.category === AppState.selectedCategory);
  }
  
  if (habits.length === 0) {
    container.innerHTML = renderEmpty('📋', '还没有习惯', { text: '添加第一个习惯', onclick: 'showAddHabitModal()' });
    return;
  }
  
  // Load habits with badges
  loadHabitsWithBadges();
}

// Load habits with badges and render
async function loadHabitsWithBadges() {
  const container = document.getElementById('habitsList');
  if (!container) return;
  
  try {
    const habitsWithBadges = await API.get('/api/habits-with-badges');
    
    let habits = habitsWithBadges;
    if (AppState.selectedCategory) {
      habits = habits.filter(h => h.category === AppState.selectedCategory);
    }
    
    container.innerHTML = habits.map((habit, index) => renderHabitItem(habit, index, habit)).join('');
  } catch (err) {
    console.error('Failed to load habits with badges:', err);
    // Fallback to simple render
    let habits = AppState.habits;
    if (AppState.selectedCategory) {
      habits = habits.filter(h => h.category === AppState.selectedCategory);
    }
    container.innerHTML = habits.map((habit, index) => renderHabitItem(habit, index)).join('');
  }
}

// Initialize category filter (wrapper that calls component from components.js)
function initCategoryFilter() {
  const container = document.getElementById('categoryFilter');
  if (!container) return;
  
  // Call the render function from components.js via window
  const componentFn = window.renderCategoryFilter;
  if (typeof componentFn === 'function') {
    container.innerHTML = componentFn(AppState.selectedCategory);
  }
}

// Update habit filter dropdown
function updateHabitFilter() {
  const filter = document.getElementById('historyHabitFilter');
  if (!filter) return;
  
  const options = AppState.habits.map(h => 
    `<option value="${h.id}">${HabitIcons[h.name] || '✓'} ${escapeHtml(h.name)}</option>`
  ).join('');
  
  filter.innerHTML = '<option value="">全部习惯</option>' + options;
}

// =====================
// Check-in Functions
// =====================

// Toggle check-in for a habit
async function toggleCheckin(habitId) {
  const habit = AppState.habits.find(h => h.id === habitId);
  if (!habit) return;
  
  // If already checked in today and not allow_duplicate, show options
  if (habit.today_checkins > 0 && !habit.allow_duplicate) {
    // Show skip reason modal or just toggle
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');
    
    modalTitle.innerHTML = '打卡选项';
    modalBody.innerHTML = `
      <div class="skip-reason-container">
        <p style="margin-bottom: 12px; color: var(--text-light);">
          「${escapeHtml(habit.name)}」今天已打卡，是否再次打卡？
        </p>
        <button class="btn btn-primary" style="width: 100%; margin-bottom: 8px;" onclick="quickCheckin(${habitId}); closeModal();">
          ✅ 再次打卡
        </button>
        <button class="btn btn-secondary" style="width: 100%;" onclick="closeModal()">
          取消
        </button>
      </div>
    `;
    document.getElementById('modalOverlay').classList.add('show');
    return;
  }
  
  // Quick check-in without note
  await quickCheckin(habitId);
}

// Quick check-in
async function quickCheckin(habitId, note = '') {
  try {
    LoadingState.show('打卡中...');
    
    await API.post('/api/checkin', { habitId, note });
    
    // Update UI
    const habit = AppState.habits.find(h => h.id === habitId);
    if (habit) {
      habit.today_checkins = (habit.today_checkins || 0) + 1;
    }
    
    // Refresh displays
    renderHabits();
    renderQuickActions();
    loadStream();
    loadProgress();
    
    Toast.success('打卡成功！');
    
    // Play success animation
    const habitItem = document.querySelector(`[data-id="${habitId}"]`);
    if (habitItem) {
      playCheckSuccessAnimation(habitItem);
    }
  } catch (err) {
    console.error('Check-in failed:', err);
    Toast.error('打卡失败: ' + err.message);
  } finally {
    LoadingState.hide();
  }
}

// Show habit picker for quick check-in
function showHabitPicker() {
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  
  const uncheckedHabits = AppState.habits.filter(h => !h.today_checkins || h.allow_duplicate);
  const checkedHabits = AppState.habits.filter(h => h.today_checkins && !h.allow_duplicate);
  
  modalTitle.innerHTML = '✅ 选择习惯打卡';
  modalBody.innerHTML = `
    <div class="habit-picker">
      ${uncheckedHabits.length > 0 ? `
        <div class="habit-picker-section">
          <div class="habit-picker-label">待打卡</div>
          ${uncheckedHabits.map(habit => `
            <div class="habit-picker-item" onclick="selectHabitForCheckin(${habit.id})">
              <span class="habit-picker-icon">${HabitIcons[habit.name] || '✓'}</span>
              <span class="habit-picker-name">${escapeHtml(habit.name)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${checkedHabits.length > 0 ? `
        <div class="habit-picker-section">
          <div class="habit-picker-label">已完成</div>
          ${checkedHabits.map(habit => `
            <div class="habit-picker-item completed" onclick="selectHabitForCheckin(${habit.id})">
              <span class="habit-picker-icon">${HabitIcons[habit.name] || '✓'}</span>
              <span class="habit-picker-name">${escapeHtml(habit.name)}</span>
              <span class="habit-picker-check">✓</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${AppState.habits.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-text">还没有习惯</div>
          <button class="btn btn-primary btn-sm" onclick="closeModal(); showAddHabitModal();">添加习惯</button>
        </div>
      ` : ''}
    </div>
  `;
  
  document.getElementById('modalOverlay').classList.add('show');
}

// Select habit for check-in (from picker)
function selectHabitForCheckin(habitId) {
  closeModal();
  showCheckinModal(habitId);
}

// Show check-in modal with note input
function showCheckinModal(habitId) {
  const habit = AppState.habits.find(h => h.id === habitId);
  if (!habit) return;
  
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  
  modalTitle.innerHTML = `${HabitIcons[habit.name] || '✓'} ${escapeHtml(habit.name)}`;
  modalBody.innerHTML = `
    <div class="checkin-modal">
      <div class="form-group">
        <label>备注 <span style="color: var(--text-light); font-weight: normal; font-size: 12px;">(可选)</span></label>
        <textarea id="checkinNote" placeholder="写下一些备注..." rows="3"></textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="submitQuickCheckin(${habitId})">打卡</button>
      </div>
    </div>
  `;
  
  document.getElementById('modalOverlay').classList.add('show');
  
  // Focus textarea
  setTimeout(() => {
    const textarea = document.getElementById('checkinNote');
    if (textarea) textarea.focus();
  }, 100);
}

// Submit quick check-in with note
async function submitQuickCheckin(habitId) {
  const noteInput = document.getElementById('checkinNote');
  const note = noteInput ? noteInput.value.trim() : '';
  
  closeModal();
  await quickCheckin(habitId, note);
}

// =====================
// Quick Note Functions
// =====================

// Submit quick note (log entry)
async function submitQuickNote() {
  const editor = AppState.tiptapEditor;

  if (!editor) {
    Toast.error('编辑器未初始化');
    return;
  }

  // Get HTML content from TipTap editor for rich formatting
  const htmlContent = editor.getHTML();
  // Get plain text for validation
  const textContent = editor.getText().trim();

  if (!textContent) {
    Toast.warning('请输入内容');
    return;
  }

  try {
    LoadingState.show('发送中...');

    // Send HTML content to preserve formatting
    await API.post('/api/logs', { content: htmlContent });

    // Clear editor
    editor.chain().clearContent().run();

    // Refresh stream
    loadStream();
    Toast.success('发送成功');
  } catch (err) {
    console.error('Failed to submit note:', err);
    Toast.error('发送失败: ' + err.message);
  } finally {
    LoadingState.hide();
  }
}

// Insert format (bold, italic, etc.)
function insertFormat(before, after = '') {
  const input = document.getElementById('quickNoteInput');
  if (!input) return;
  
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const value = input.value;
  const selectedText = value.substring(start, end);
  
  input.value = value.substring(0, start) + before + selectedText + after + value.substring(end);
  input.selectionStart = start + before.length;
  input.selectionEnd = start + before.length + selectedText.length;
  input.focus();

  // Update render
  const render = document.getElementById('mdRender');
  if (render) {
    render.innerHTML = value.substring(0, start) + before + selectedText + after + value.substring(end);
  }
}

// Format buttons (for toolbar)
function execFormat(format) {
  switch (format) {
    case 'bold':
      insertFormat('**', '**');
      break;
    case 'italic':
      insertFormat('*', '*');
      break;
  }
}

// Insert list
function insertList(type) {
  const input = document.getElementById('quickNoteInput');
  if (!input) return;
  
  const start = input.selectionStart;
  const value = input.value;
  const prefix = type === 'unordered' ? '- ' : '1. ';
  
  // Find start of current line
  let lineStart = start;
  while (lineStart > 0 && value[lineStart - 1] !== '\n') {
    lineStart--;
  }
  
  input.value = value.substring(0, lineStart) + prefix + value.substring(lineStart);
  input.selectionStart = input.selectionEnd = lineStart + prefix.length;
  input.focus();
  
  // Update render
  input.dispatchEvent(new Event('input'));
}

// Insert blockquote
function insertBlockquote() {
  const input = document.getElementById('quickNoteInput');
  if (!input) return;
  
  const start = input.selectionStart;
  const value = input.value;
  
  // Find start of current line
  let lineStart = start;
  while (lineStart > 0 && value[lineStart - 1] !== '\n') {
    lineStart--;
  }
  
  input.value = value.substring(0, lineStart) + '> ' + value.substring(lineStart);
  input.selectionStart = input.selectionEnd = lineStart + 2;
  input.focus();
  
  // Update render
  input.dispatchEvent(new Event('input'));
}

// =====================
// Delete Functions
// =====================

// Delete log entry
async function deleteLog(logId) {
  if (!confirm('确定要删除这条记录吗？')) return;

  // Remove from DOM immediately for instant feedback
  const item = document.querySelector(`.stream-item.log[data-id="${logId}"]`);
  if (item) {
    item.style.opacity = '0';
    item.style.transform = 'translateX(20px)';
    item.style.transition = 'all 0.3s ease';
    setTimeout(() => item.remove(), 300);
  }

  try {
    await API.delete(`/api/logs/${logId}`);
    Toast.success('删除成功');
  } catch (err) {
    console.error('Failed to delete log:', err);
    Toast.error('删除失败: ' + err.message);
    // Reload stream on error to restore the item
    loadStream();
  }
}

// Delete checkin from stream
async function deleteCheckinFromStream(checkinId) {
  if (!confirm('确定要删除这条打卡记录吗？')) return;

  // Remove from DOM immediately for instant feedback
  const item = document.querySelector(`.stream-item.checkin[data-id="${checkinId}"]`);
  if (item) {
    item.style.opacity = '0';
    item.style.transform = 'translateX(20px)';
    item.style.transition = 'all 0.3s ease';
    setTimeout(() => item.remove(), 300);
  }

  try {
    await API.delete(`/api/checkins/${checkinId}`);
    loadProgress();
    renderHabits();
    Toast.success('删除成功');
  } catch (err) {
    console.error('Failed to delete checkin:', err);
    Toast.error('删除失败: ' + err.message);
    // Reload stream on error to restore the item
    loadStream();
  }
}

// Edit checkin time
function editCheckinTime(checkinId) {
  // Get current data from DOM
  const item = document.querySelector(`.stream-item[data-id="${checkinId}"]`);
  if (!item) return;

  const currentDatetime = item.dataset.checkedAt || '';
  const habitName = item.dataset.habitName || '';
  const currentNote = item.dataset.note || '';

  // Format for datetime-local input: YYYY-MM-DDTHH:MM
  const datetimeLocalValue = currentDatetime ? currentDatetime.replace(' ', 'T').slice(0, 16) : '';

  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');

  modalTitle.innerHTML = `🕐 修改时间`;

  // Convert markdown note to HTML for TipTap editor
  const htmlContent = markdownToHtml(currentNote);

  modalBody.innerHTML = `
    <div class="form-group">
      <label>打卡时间</label>
      <input type="datetime-local" id="editCheckinTime" value="${datetimeLocalValue}">
    </div>
    <div class="form-group">
      <label>备注</label>
      <div id="editCheckinNote" class="modal-editor" style="min-height: 80px;"></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveCheckinTime(${checkinId})">保存</button>
    </div>
  `;

  document.getElementById('modalOverlay').classList.add('show');

  // Initialize TipTap editor in modal with HTML converted from original markdown
  initModalTipTapEditor('editCheckinNote', htmlContent, '添加备注...');
}

// Preview note content
function previewNote(text, previewId) {
  const preview = document.getElementById(previewId);
  if (preview) {
    preview.innerHTML = renderMd(text);
  }
}

// Save checkin time
async function saveCheckinTime(checkinId) {
  const timeInput = document.getElementById('editCheckinTime');

  const checkedAt = timeInput ? timeInput.value.replace('T', ' ') + ':00' : null;
  // Get content from modal TipTap editor - save as HTML directly to preserve formatting
  const note = getModalEditorContent();

  try {
    await API.put(`/api/checkins/${checkinId}`, { checked_at: checkedAt, note });
    closeModal();
    loadStream();
    loadProgress();
    renderHabits();
    Toast.success('保存成功');
  } catch (err) {
    console.error('Failed to save checkin time:', err);
    Toast.error('保存失败: ' + err.message);
  }
}

// Convert Markdown to HTML for TipTap editor
// Simplified version that works well with TipTap's expected format
function markdownToHtml(text) {
  if (!text) return '<p></p>';

  // If content looks like HTML already, return as-is (after sanitization)
  if (text.includes('<p>') || text.includes('<div>') || text.includes('<h')) {
    return text;
  }

  // Use marked library if available for better parsing
  if (typeof marked !== 'undefined' && marked.parse) {
    try {
      marked.setOptions({
        breaks: true,
        gfm: true
      });
      return marked.parse(text);
    } catch (e) {
      console.warn('Markdown parse error:', e);
    }
  }

  // Fallback: Simple markdown to HTML conversion
  let html = text;

  // Escape HTML entities
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  // Wrap in paragraphs
  const blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h')) return block;
    block = block.replace(/\n/g, '<br>');
    return `<p>${block}</p>`;
  }).join('');

  return html || '<p></p>';
}

// Convert HTML to Markdown
// Simplified version for clean output
function htmlToMarkdown(html) {
  if (!html || html === '<p></p>') return '';

  let md = html;

  // Headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gis, '\n# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gis, '\n## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gis, '\n### $1\n\n');

  // Code
  md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '\n```\n$1\n```\n\n');
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Lists
  md = md.replace(/<ul[^>]*>/gi, '\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n');

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (m, c) => {
    return c.split('\n').map(l => `> ${l}`).join('\n') + '\n';
  });

  // Bold and italic
  md = md.replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gis, '**$2**');
  md = md.replace(/<(i|em)[^>]*>(.*?)<\/\1>/gis, '*$2*');

  // Underline (keep as HTML since Markdown doesn't support)
  md = md.replace(/<(u|ins)[^>]*>(.*?)<\/\1>/gis, '<u>$2</u>');

  // Strikethrough
  md = md.replace(/<(s|strike|del)[^>]*>(.*?)<\/\1>/gis, '~~$2~~');

  // Paragraphs and breaks
  md = md.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  md = md.replace(/<\/?p[^>]*>/gi, '');
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Horizontal rule
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n');

  // HTML entities decode
  md = md.replace(/&nbsp;/gi, ' ');
  md = md.replace(/&lt;/gi, '<');
  md = md.replace(/&gt;/gi, '>');
  md = md.replace(/&amp;/gi, '&');
  md = md.replace(/&quot;/gi, '"');

  // Preserve underlines (Markdown doesn't have underline syntax)
  const underlines = [];
  md = md.replace(/<u>(.*?)<\/u>/gi, (m, c) => {
    underlines.push(c);
    return `__U${underlines.length - 1}__`;
  });

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Restore underlines
  underlines.forEach((c, i) => {
    md = md.replace(`__U${i}__`, `<u>${c}</u>`);
  });

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

// Edit log (time and content)
function editLog(logId) {
  // Get current data from DOM
  const item = document.querySelector(`.stream-item[data-id="${logId}"]`);
  if (!item) return;

  const currentDatetime = item.dataset.checkedAt || '';
  const currentNote = item.dataset.note || '';

  // Format for datetime-local input: YYYY-MM-DDTHH:MM
  const datetimeLocalValue = currentDatetime ? currentDatetime.replace(' ', 'T').slice(0, 16) : '';

  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');

  modalTitle.innerHTML = `✏️ 修改日记`;

  // Convert markdown note to HTML for TipTap editor
  // Use a simple paragraph wrapper for plain text/markdown
  const htmlContent = markdownToHtml(currentNote);

  modalBody.innerHTML = `
    <div class="form-group">
      <label>时间</label>
      <input type="datetime-local" id="editLogTime" value="${datetimeLocalValue}">
    </div>
    <div class="form-group">
      <label>内容</label>
      <div id="editLogContent" class="modal-editor" style="min-height: 120px;"></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveLog(${logId})">保存</button>
    </div>
  `;

  document.getElementById('modalOverlay').classList.add('show');

  // Initialize TipTap editor in modal with HTML converted from original markdown
  initModalTipTapEditor('editLogContent', htmlContent, '写日记...');
}

// Save log edits
async function saveLog(logId) {
  const timeInput = document.getElementById('editLogTime');

  const createdAt = timeInput ? timeInput.value.replace('T', ' ') + ':00' : null;
  // Get content from modal TipTap editor - save as HTML directly to preserve formatting
  const content = getModalEditorContent();

  if (!content || content === '<p></p>') {
    Toast.warning('内容不能为空');
    return;
  }

  try {
    await API.put(`/api/logs/${logId}`, { content, created_at: createdAt });
    closeModal();
    loadStream();
    loadProgress();
    Toast.success('保存成功');
  } catch (err) {
    console.error('Failed to save log:', err);
    Toast.error('保存失败: ' + err.message);
  }
}

// =====================
// Habit Management
// =====================

// Show add habit modal
function showAddHabitModal() {
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  
  modalTitle.innerHTML = '➕ 添加习惯';
  modalBody.innerHTML = `
    <div class="form-group">
      <label>习惯名称 *</label>
      <input type="text" id="habitName" placeholder="例如：阅读、运动、冥想..." maxlength="50">
    </div>
    <div class="form-group">
      <label>描述</label>
      <input type="text" id="habitDesc" placeholder="可选描述" maxlength="200">
    </div>
    <div class="form-group">
      <label>分类</label>
      <select id="habitCategory">
        ${Object.entries(HabitCategories).map(([key, cat]) => 
          `<option value="${key}">${cat.icon} ${cat.name}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>提醒时间</label>
      <input type="time" id="habitReminder">
    </div>
    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" id="habitAllowDup">
        允许每天重复打卡
      </label>
    </div>
    ${renderTagSelector([])}
    ${renderIdentitySelector('')}
    ${renderRepeatModeSelector('new_record')}
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="addHabit()">添加</button>
    </div>
  `;
  
  document.getElementById('modalOverlay').classList.add('show');
}

// Add habit
async function addHabit() {
  const nameInput = document.getElementById('habitName');
  const descInput = document.getElementById('habitDesc');
  const categoryInput = document.getElementById('habitCategory');
  const reminderInput = document.getElementById('habitReminder');
  const allowDupInput = document.getElementById('habitAllowDup');
  
  const name = nameInput ? nameInput.value.trim() : '';
  
  if (!name) {
    Toast.warning('请输入习惯名称');
    return;
  }
  
  try {
    LoadingState.show('添加中...');
    
    // Get selected tags
    const selectedTags = [];
    document.querySelectorAll('.tag-option.selected').forEach(el => {
      const tagText = el.textContent.trim();
      if (tagText) selectedTags.push(tagText);
    });
    
    // Get custom tags
    const customTagInput = document.getElementById('customTagInput');
    if (customTagInput && customTagInput.value.trim()) {
      const customTags = customTagInput.value.split(',').map(t => t.trim()).filter(t => t);
      selectedTags.push(...customTags);
    }
    
    await API.post('/api/habits', {
      name,
      description: descInput ? descInput.value.trim() : '',
      category: categoryInput ? categoryInput.value : 'other',
      reminder_hours: reminderInput ? reminderInput.value : '',
      allow_duplicate: allowDupInput ? allowDupInput.checked : false,
      tags: JSON.stringify(selectedTags),
      identity_label: AppState.selectedIdentity || '',
      repeat_mode: AppState.selectedRepeatMode || 'new_record'
    });
    
    closeModal();
    loadHabits();
    loadProgress();
    Toast.success('添加成功');
  } catch (err) {
    console.error('Failed to add habit:', err);
    Toast.error('添加失败: ' + err.message);
  } finally {
    LoadingState.hide();
  }
}

// Edit habit
function editHabit(habitId) {
  const habit = AppState.habits.find(h => h.id === habitId);
  if (!habit) return;
  
  // Parse tags
  let tags = [];
  try {
    tags = habit.tags ? JSON.parse(habit.tags) : [];
  } catch (e) {
    console.warn('Failed to parse habit tags:', e);
  }
  
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  
  modalTitle.innerHTML = '✏️ 编辑习惯';
  modalBody.innerHTML = `
    <div class="form-group">
      <label>习惯名称 *</label>
      <input type="text" id="habitName" value="${escapeHtml(habit.name)}" maxlength="50">
    </div>
    <div class="form-group">
      <label>描述</label>
      <input type="text" id="habitDesc" value="${escapeHtml(habit.description || '')}" maxlength="200">
    </div>
    <div class="form-group">
      <label>分类</label>
      <select id="habitCategory">
        ${Object.entries(HabitCategories).map(([key, cat]) => 
          `<option value="${key}" ${habit.category === key ? 'selected' : ''}>${cat.icon} ${cat.name}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>提醒时间</label>
      <input type="time" id="habitReminder" value="${habit.reminder_hours || ''}">
    </div>
    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" id="habitAllowDup" ${habit.allow_duplicate ? 'checked' : ''}>
        允许每天重复打卡
      </label>
    </div>
    ${renderTagSelector(tags)}
    ${renderIdentitySelector(habit.identity_label || '')}
    ${renderRepeatModeSelector(habit.repeat_mode || 'new_record')}
    <div class="form-actions">
      <button class="btn btn-danger" onclick="deleteHabit(${habitId})">删除</button>
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="updateHabit(${habitId})">保存</button>
    </div>
  `;
  
  // Set state for selectors
  AppState.selectedTags = tags;
  AppState.selectedIdentity = habit.identity_label || '';
  AppState.selectedRepeatMode = habit.repeat_mode || 'new_record';
  
  document.getElementById('modalOverlay').classList.add('show');
}

// Update habit
async function updateHabit(habitId) {
  const nameInput = document.getElementById('habitName');
  const descInput = document.getElementById('habitDesc');
  const categoryInput = document.getElementById('habitCategory');
  const reminderInput = document.getElementById('habitReminder');
  const allowDupInput = document.getElementById('habitAllowDup');
  
  const name = nameInput ? nameInput.value.trim() : '';
  
  if (!name) {
    Toast.warning('请输入习惯名称');
    return;
  }
  
  try {
    LoadingState.show('保存中...');
    
    // Get selected tags
    const selectedTags = [];
    document.querySelectorAll('.tag-option.selected').forEach(el => {
      const tagText = el.textContent.trim();
      if (tagText) selectedTags.push(tagText);
    });
    
    await API.put(`/api/habits/${habitId}`, {
      name,
      description: descInput ? descInput.value.trim() : '',
      category: categoryInput ? categoryInput.value : 'other',
      reminder_hours: reminderInput ? reminderInput.value : '',
      allow_duplicate: allowDupInput ? allowDupInput.checked : false,
      tags: JSON.stringify(selectedTags),
      identity_label: AppState.selectedIdentity || '',
      repeat_mode: AppState.selectedRepeatMode || 'new_record'
    });
    
    closeModal();
    loadHabits();
    Toast.success('保存成功');
  } catch (err) {
    console.error('Failed to update habit:', err);
    Toast.error('保存失败: ' + err.message);
  } finally {
    LoadingState.hide();
  }
}

// Delete habit
async function deleteHabit(habitId) {
  if (!confirm('确定要删除这个习惯吗？所有相关的打卡记录也会被删除。')) return;
  
  try {
    await API.delete(`/api/habits/${habitId}`);
    closeModal();
    loadHabits();
    loadProgress();
    Toast.success('删除成功');
  } catch (err) {
    console.error('Failed to delete habit:', err);
    Toast.error('删除失败: ' + err.message);
  }
}

// =====================
// Filter Functions
// =====================

// Filter by category
function filterByCategory(category) {
  AppState.selectedCategory = category;
  initCategoryFilter();
  renderHabits();
}

// Toggle tag selection
function toggleTagSelection(el, tagName) {
  el.classList.toggle('selected');
  if (AppState.selectedTags.includes(tagName)) {
    AppState.selectedTags = AppState.selectedTags.filter(t => t !== tagName);
  } else {
    AppState.selectedTags.push(tagName);
  }
}

// Select identity
function selectIdentity(el, key) {
  document.querySelectorAll('.identity-option').forEach(opt => opt.classList.remove('selected'));
  el.classList.add('selected');
  AppState.selectedIdentity = key;
}

// Select reminder period
function selectReminderPeriod(el, key) {
  document.querySelectorAll('.reminder-period-option').forEach(opt => opt.classList.remove('selected'));
  el.classList.add('selected');
  AppState.selectedReminderPeriod = key;
}

// Select repeat mode
function selectRepeatMode(el, key) {
  document.querySelectorAll('.repeat-mode-option').forEach(opt => opt.classList.remove('selected'));
  el.classList.add('selected');
  AppState.selectedRepeatMode = key;
}

// =====================
// History & Calendar
// =====================

// Render history
async function renderHistory() {
  const container = document.getElementById('historyList');
  if (!container) return;

  const habitFilter = document.getElementById('historyHabitFilter');
  const daysFilter = document.getElementById('historyDaysFilter');
  const typeFilter = document.getElementById('historyTypeFilter');

  const habitId = habitFilter ? habitFilter.value : '';
  const days = daysFilter ? daysFilter.value : '30';
  const recordType = typeFilter ? typeFilter.value : '';

  let start, end;
  end = getLocalDateISO();

  if (days === 'custom') {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    start = startDateInput ? startDateInput.value : getLocalDateISO(-30);
    end = endDateInput ? endDateInput.value : getLocalDateISO();
  } else {
    start = getLocalDateISO(-parseInt(days));
  }

  try {
    // Use the new full history API - request all records (up to 500)
    let url = `/api/history/full?start=${start}&end=${end}&limit=500`;
    if (habitId) url += `&habitId=${habitId}`;
    if (recordType) url += `&type=${recordType}`;

    const result = await API.get(url);
    const records = result.data || result;

    // Group by date
    const grouped = {};
    records.forEach(r => {
      const date = r.check_date || r.checked_at?.split(' ')[0];
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(r);
    });

    // Render
    const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    if (dates.length === 0) {
      container.innerHTML = renderEmpty('📭', '暂无记录');
      return;
    }

    container.innerHTML = dates.map(date => renderFullDateGroup(date, grouped[date])).join('');
  } catch (err) {
    console.error('Failed to load history:', err);
    container.innerHTML = renderEmpty('❌', '加载失败');
  }
}

// On days filter change
function onDaysFilterChange() {
  const daysFilter = document.getElementById('historyDaysFilter');
  const datePickerBar = document.getElementById('datePickerBar');
  
  if (daysFilter && daysFilter.value === 'custom') {
    if (datePickerBar) datePickerBar.classList.remove('hidden');
  } else {
    if (datePickerBar) datePickerBar.classList.add('hidden');
    renderHistory();
  }
}

// Toggle date group
function toggleDateGroup(header) {
  const group = header.closest('.date-group');
  if (group) group.classList.toggle('collapsed');
}

// =====================
// History Edit Functions
// =====================

// Edit checkin from history page
function editHistoryCheckin(btn) {
  const recordItem = btn.closest('.record-item');
  if (!recordItem) return;

  const checkinId = recordItem.dataset.id;
  const currentDatetime = recordItem.dataset.checkedAt || '';
  const currentNote = recordItem.dataset.note || '';

  const datetimeLocalValue = currentDatetime ? currentDatetime.replace(' ', 'T').slice(0, 16) : '';

  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');

  modalTitle.innerHTML = `✏️ 编辑打卡`;

  // Convert markdown note to HTML for TipTap editor
  const htmlContent = markdownToHtml(currentNote);

  modalBody.innerHTML = `
    <div class="form-group">
      <label>时间</label>
      <input type="datetime-local" id="editHistoryTime" value="${datetimeLocalValue}">
    </div>
    <div class="form-group">
      <label>备注</label>
      <div id="editHistoryNote" class="modal-editor" style="min-height: 100px;"></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveHistoryCheckin(${checkinId})">保存</button>
    </div>
  `;

  document.getElementById('modalOverlay').classList.add('show');

  // Initialize TipTap editor in modal with HTML converted from original markdown
  initModalTipTapEditor('editHistoryNote', htmlContent, '添加备注...');
}

// Save checkin from history page
async function saveHistoryCheckin(checkinId) {
  const timeInput = document.getElementById('editHistoryTime');

  const checkedAt = timeInput ? timeInput.value.replace('T', ' ') + ':00' : null;
  // Get content from modal TipTap editor - save as HTML directly to preserve formatting
  const note = getModalEditorContent();

  try {
    await API.put(`/api/checkins/${checkinId}`, { checked_at: checkedAt, note });
    closeModal();
    renderHistory();
    // Refresh stream if today's record was modified
    refreshIfToday(checkedAt);
    Toast.success('保存成功');
  } catch (err) {
    console.error('Failed to save checkin:', err);
    Toast.error('保存失败: ' + err.message);
  }
}

// Delete checkin from history page
async function deleteHistoryCheckin(btn) {
  if (!confirm('确定要删除这条打卡记录吗？')) return;

  const recordItem = btn.closest('.record-item');
  if (!recordItem) return;

  const checkinId = recordItem.dataset.id;
  const checkedAt = recordItem.dataset.checkedAt || '';

  // Remove from DOM immediately
  recordItem.style.opacity = '0';
  recordItem.style.transform = 'translateX(20px)';
  recordItem.style.transition = 'all 0.3s ease';
  setTimeout(() => recordItem.remove(), 300);

  try {
    await API.delete(`/api/checkins/${checkinId}`);
    Toast.success('删除成功');
    // Refresh history list
    renderHistory();
    // Refresh stream if today's record was deleted
    refreshIfToday(checkedAt);
  } catch (err) {
    console.error('Failed to delete checkin:', err);
    Toast.error('删除失败: ' + err.message);
    renderHistory(); // Reload on error
  }
}

// Edit log from history page
function editHistoryLog(btn) {
  const recordItem = btn.closest('.record-item');
  if (!recordItem) return;

  const logId = recordItem.dataset.id;
  const currentDatetime = recordItem.dataset.checkedAt || '';
  const currentNote = recordItem.dataset.note || '';

  const datetimeLocalValue = currentDatetime ? currentDatetime.replace(' ', 'T').slice(0, 16) : '';

  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');

  modalTitle.innerHTML = `✏️ 编辑日记`;

  // Convert markdown note to HTML for TipTap editor
  const htmlContent = markdownToHtml(currentNote);

  modalBody.innerHTML = `
    <div class="form-group">
      <label>时间</label>
      <input type="datetime-local" id="editHistoryTime" value="${datetimeLocalValue}">
    </div>
    <div class="form-group">
      <label>内容</label>
      <div id="editHistoryContent" class="modal-editor" style="min-height: 120px;"></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveHistoryLog(${logId})">保存</button>
    </div>
  `;

  document.getElementById('modalOverlay').classList.add('show');

  // Initialize TipTap editor in modal with HTML converted from original markdown
  initModalTipTapEditor('editHistoryContent', htmlContent, '写日记...');
}

// Save log from history page
async function saveHistoryLog(logId) {
  const timeInput = document.getElementById('editHistoryTime');

  const createdAt = timeInput ? timeInput.value.replace('T', ' ') + ':00' : null;
  // Get content from modal TipTap editor - save as HTML directly to preserve formatting
  const content = getModalEditorContent();

  if (!content || content === '<p></p>') {
    Toast.warning('内容不能为空');
    return;
  }

  try {
    await API.put(`/api/logs/${logId}`, { content, created_at: createdAt });
    closeModal();
    renderHistory();
    // Refresh stream if today's record was modified
    refreshIfToday(createdAt);
    Toast.success('保存成功');
  } catch (err) {
    console.error('Failed to save log:', err);
    Toast.error('保存失败: ' + err.message);
  }
}

// Delete log from history page
async function deleteHistoryLog(btn) {
  if (!confirm('确定要删除这条日记吗？')) return;

  const recordItem = btn.closest('.record-item');
  if (!recordItem) return;

  const logId = recordItem.dataset.id;
  const checkedAt = recordItem.dataset.checkedAt || '';

  // Remove from DOM immediately
  recordItem.style.opacity = '0';
  recordItem.style.transform = 'translateX(20px)';
  recordItem.style.transition = 'all 0.3s ease';
  setTimeout(() => recordItem.remove(), 300);

  try {
    await API.delete(`/api/logs/${logId}`);
    Toast.success('删除成功');
    // Refresh history list
    renderHistory();
    // Refresh stream if today's record was deleted
    refreshIfToday(checkedAt);
  } catch (err) {
    console.error('Failed to delete log:', err);
    Toast.error('删除失败: ' + err.message);
    renderHistory(); // Reload on error
  }
}

// Change calendar month
function changeMonth(delta) {
  AppState.currentMonth.setMonth(AppState.currentMonth.getMonth() + delta);
  renderCalendar();
}

// Render calendar
async function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const title = document.getElementById('calendarTitle');
  if (!grid) return;
  
  const year = AppState.currentMonth.getFullYear();
  const month = AppState.currentMonth.getMonth();
  
  if (title) {
    title.textContent = `${year}年${month + 1}月`;
  }
  
  // Get checked dates for the month
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;
  
  try {
    const stats = await API.get(`/api/stats/daily?start=${start}&end=${end}`);
    const checkedDates = stats.filter(s => s.count > 0).map(s => s.date);
    
    grid.innerHTML = renderCalendarGrid(year, month, checkedDates);
  } catch (err) {
    console.error('Failed to load calendar:', err);
    grid.innerHTML = renderCalendarGrid(year, month, []);
  }
}

// Show date detail
async function showDateDetail(dateStr) {
  try {
    // Fetch check-ins and logs for the date
    const [checkins, logs] = await Promise.all([
      API.get(`/api/checkins?start=${dateStr}&end=${dateStr}`),
      API.get(`/api/logs?date=${dateStr}`)
    ]);
    
    // Format date for display
    const dateObj = new Date(dateStr);
    const dateDisplay = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
    
    let content = `<div style="padding: 8px;">`;
    
    // Check-ins section
    if (checkins && checkins.length > 0) {
      content += `<h4 style="margin: 12px 0 8px;">✅ 打卡记录</h4>`;
      checkins.forEach(c => {
        const time = new Date(c.checked_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        content += `<div style="padding: 8px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 6px;">
          <div style="font-weight: 500;">${c.name}</div>
          <div style="font-size: 12px; color: var(--text-secondary);">${time}</div>
          ${c.note ? `<div style="margin-top: 4px; font-size: 13px;">${c.note}</div>` : ''}
        </div>`;
      });
    } else {
      content += `<p style="color: var(--text-secondary); margin: 8px 0;">无打卡记录</p>`;
    }
    
    // Logs section
    if (logs && logs.length > 0) {
      content += `<h4 style="margin: 16px 0 8px;">📝 日记</h4>`;
      logs.forEach(log => {
        const time = new Date(log.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        content += `<div style="padding: 8px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 6px;">
          <div style="font-size: 12px; color: var(--text-secondary);">${time}</div>
          <div style="margin-top: 4px; white-space: pre-wrap;">${log.content}</div>
        </div>`;
      });
    }
    
    content += `</div>`;
    
    showModal(`${dateDisplay} 记录`, content);
  } catch (err) {
    console.error('Failed to load date detail:', err);
    showModal('记录', '<p style="color: red;">加载失败</p>');
  }
}

// =====================
// Statistics
// =====================

// Render stats
async function renderStats() {
  try {
    // Load heatmap
    const heatmap = await API.get('/api/heatmap?days=90');
    renderHeatmap(heatmap);
    
    // Load progress
    await loadProgress();
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// Show heatmap date detail
function showHeatmapDateDetail(dateStr) {
  console.log('Show heatmap detail for:', dateStr);
}

// =====================
// Theme & UI
// =====================

// Initialize theme
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
    AppState.theme = 'dark';
  }
  
  // Update toggle button
  updateThemeToggle();
}

// Toggle theme
function toggleTheme() {
  document.body.classList.toggle('dark');
  AppState.theme = document.body.classList.contains('dark') ? 'dark' : 'light';
  localStorage.setItem('theme', AppState.theme);
  updateThemeToggle();
}

// Update theme toggle button
function updateThemeToggle() {
  const btn = document.querySelector('.theme-toggle');
  if (btn) {
    btn.textContent = AppState.theme === 'dark' ? '☀️' : '🌙';
  }
}

// =====================
// Pull to Refresh
// =====================

function initPullToRefresh() {
  let startY = 0;
  let isPulling = false;
  
  document.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
      startY = e.touches[0].pageY;
      isPulling = true;
    }
  });
  
  document.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    
    const currentY = e.touches[0].pageY;
    const diff = currentY - startY;
    
    if (diff > 80 && window.scrollY === 0) {
      isPulling = false;
      loadHabits();
      loadStream();
      loadProgress();
    }
  });
  
  document.addEventListener('touchend', () => {
    isPulling = false;
  });
}

// =====================
// Service Worker
// =====================

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW registration failed:', err));
  }
}

// =====================
// Keyboard Shortcuts
// =====================

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + N: New habit
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      showAddHabitModal();
    }
    
    // Ctrl/Cmd + R: Refresh (prevent default, use custom)
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      loadHabits();
      loadStream();
      loadProgress();
    }
  });
}

// =====================
// Offline Indicator
// =====================

function initOfflineIndicator() {
  window.addEventListener('online', () => {
    Toast.success('已连接网络');
  });
  
  window.addEventListener('offline', () => {
    Toast.warning('网络已断开');
  });
}

// =====================
// Horizontal Scroll
// =====================

function initHorizontalScroll() {
  const containers = document.querySelectorAll('.quick-actions, .category-filter');
  
  containers.forEach(container => {
    container.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  });
}

// =====================
// Export Functions
// =====================

async function exportData(format = 'json') {
  try {
    LoadingState.show('导出中...');
    
    const habits = AppState.habits;
    const history = await API.get('/api/history?start=' + getLocalDateISO(-365) + '&end=' + getLocalDateISO());
    const checkins = history.data || history;

    let content, filename, mimeType;

    if (format === 'json') {
      content = JSON.stringify({ habits, checkins, exportedAt: new Date().toISOString() }, null, 2);
      filename = `habits-${getLocalDateISO()}.json`;
      mimeType = 'application/json';
    } else {
      // CSV format
      const headers = ['日期', '时间', '习惯', '备注'];
      const rows = checkins.map(c => [
        c.check_date || c.checked_at?.split(' ')[0],
        c.check_time || c.checked_at?.split(' ')[1]?.slice(0, 5),
        c.habit_name,
        (c.note || '').replace(/"/g, '""')
      ]);

      content = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
      filename = `habits-${getLocalDateISO()}.csv`;
      mimeType = 'text/csv';
    }
    
    downloadFile(content, filename, mimeType);
    Toast.success('导出成功');
  } catch (err) {
    console.error('Export failed:', err);
    Toast.error('导出失败: ' + err.message);
  } finally {
    LoadingState.hide();
  }
}

// =====================
// Gap Journal (Log) Functions
// =====================

// Show log input modal
function showLogModal() {
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  
  // Common emoji for quick insert
  const quickEmojis = ['💭', '✨', '💡', '🎯', '🌟', '📝', '🤔', '😊', '🙏', '❤️', '🌈', '🔥', '💪', '📚', '🎵'];
  
  modalTitle.innerHTML = '💭 记录此刻';
  modalBody.innerHTML = `
    <div class="log-modal">
      <!-- Emoji Toolbar -->
      <div class="emoji-toolbar">
        <div class="emoji-toolbar-row">
          ${quickEmojis.map(emoji => `
            <button type="button" class="emoji-btn" onclick="insertLogEmoji('${emoji}')">${emoji}</button>
          `).join('')}
        </div>
      </div>
      
      <div class="form-group" style="margin-top: 12px;">
        <label>此刻的想法 <span style="color: var(--text-light); font-weight: normal; font-size: 12px;">(Ctrl+Enter 提交)</span></label>
        <textarea id="logContent" placeholder="写下此刻的想法...&#10;可以是灵感、心情、或者任何想要记录的内容" rows="4" autofocus></textarea>
      </div>
      <div class="form-actions" style="margin-top: 12px;">
        <button class="btn btn-secondary" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="submitLog()">记录</button>
      </div>
    </div>
  `;
  
  document.getElementById('modalOverlay').classList.add('show');
  
  // Ctrl+Enter to submit
  const textarea = document.getElementById('logContent');
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitLog();
    }
  });
  textarea.focus();
}

// Insert emoji at cursor position in log content
function insertLogEmoji(emoji) {
  const textarea = document.getElementById('logContent');
  if (!textarea) return;
  
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  
  textarea.value = text.substring(0, start) + emoji + text.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
  textarea.focus();
}

// Submit log entry
async function submitLog() {
  const contentInput = document.getElementById('logContent');
  const content = contentInput ? contentInput.value.trim() : '';
  
  if (!content) {
    Toast.warning('请输入内容');
    return;
  }
  
  try {
    closeModal();
    LoadingState.show('记录中...');
    
    await API.post('/api/logs', { content });
    
    // Refresh timeline/stream
    loadStream();
    Toast.success('记录成功');
  } catch (err) {
    console.error('Failed to submit log:', err);
    Toast.error('记录失败: ' + err.message);
  } finally {
    LoadingState.hide();
  }
}

// =====================
// Record Edit Functions
// =====================

// Edit record from data attribute
function editRecordFromData(btn) {
  const recordItem = btn.closest('.record-item');
  if (!recordItem) return;
  
  const note = recordItem.dataset.note || '';
  const id = recordItem.dataset.id;
  
  // Show edit form
  const noteDiv = recordItem.querySelector('.record-note');
  if (!noteDiv) return;
  
  const originalNote = noteDiv.innerHTML;
  noteDiv.innerHTML = `
    <div class="record-edit-form">
      <input type="text" class="record-edit-input" value="${escapeHtml(note)}" />
      <button class="btn btn-xs btn-primary" onclick="saveRecordEdit(this, ${id})">保存</button>
      <button class="btn btn-xs btn-secondary" onclick="cancelRecordEdit(this)">取消</button>
    </div>
  `;
}

// Save record edit
async function saveRecordEdit(btn, recordId) {
  const input = btn.parentElement.querySelector('.record-edit-input');
  if (!input) return;
  
  const newNote = input.value.trim();
  
  try {
    await API.put(`/api/checkins/${recordId}`, { note: newNote });
    renderHistory();
    Toast.success('保存成功');
  } catch (err) {
    console.error('Failed to save record:', err);
    Toast.error('保存失败: ' + err.message);
  }
}

// Cancel record edit
function cancelRecordEdit(btn) {
  renderHistory();
}

// Delete record from data attribute
function deleteRecordFromData(btn) {
  const recordItem = btn.closest('.record-item');
  if (!recordItem) return;
  
  const id = recordItem.dataset.id;
  deleteCheckinFromStream(id);
}

// =====================
// Meal Functions
// =====================

// Open meal input
function openMealInput(mealName) {
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  
  const icons = { '早餐': '🌅', '午餐': '☀️', '晚餐': '🌙' };
  const icon = icons[mealName] || '🍽️';
  
  modalTitle.innerHTML = `${icon} ${mealName}`;
  modalBody.innerHTML = `
    <div class="form-group">
      <label>吃了什么？</label>
      <textarea id="mealNote" placeholder="记录一下..." rows="3"></textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitMeal('${mealName}')">记录</button>
    </div>
  `;
  
  document.getElementById('modalOverlay').classList.add('show');
}

// Submit meal
async function submitMeal(mealName) {
  const noteInput = document.getElementById('mealNote');
  const note = noteInput ? noteInput.value.trim() : '';
  
  // Find or create meal habit
  let habit = AppState.habits.find(h => h.name === mealName);
  
  if (!habit) {
    // Create habit
    try {
      await API.post('/api/habits', {
        name: mealName,
        category: 'life',
        allow_duplicate: false
      });
      await loadHabits();
      habit = AppState.habits.find(h => h.name === mealName);
    } catch (err) {
      console.error('Failed to create meal habit:', err);
      Toast.error('创建习惯失败');
      return;
    }
  }
  
  if (habit) {
    await quickCheckin(habit.id, note);
  }
  
  closeModal();
}