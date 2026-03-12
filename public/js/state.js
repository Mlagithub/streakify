// state.js - Reactive State System

/**
 * Create a reactive state object that notifies listeners on changes
 * @param {Object} initialState - Initial state values
 * @returns {Object} - Reactive state with subscribe/unsubscribe methods
 */
function createReactiveState(initialState) {
  const listeners = new Map();
  let batchUpdates = false;
  const pendingNotifications = new Set();

  const notify = (key, newValue, oldValue) => {
    if (batchUpdates) {
      pendingNotifications.add(key);
      return;
    }
    const keyListeners = listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(callback => {
        try {
          callback(newValue, oldValue, key);
        } catch (e) {
          console.error(`Error in state listener for "${key}":`, e);
        }
      });
    }
    // Also notify wildcard listeners
    const wildcardListeners = listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(callback => {
        try {
          callback(newValue, oldValue, key);
        } catch (e) {
          console.error('Error in wildcard state listener:', e);
        }
      });
    }
  };

  const handler = {
    set(target, key, value) {
      const oldValue = target[key];
      target[key] = value;

      // Only notify if value actually changed
      if (oldValue !== value) {
        notify(key, value, oldValue);
      }
      return true;
    },

    get(target, key) {
      // Return subscribe method for reactive updates
      if (key === 'subscribe') {
        return (prop, callback) => {
          if (!listeners.has(prop)) {
            listeners.set(prop, new Set());
          }
          listeners.get(prop).add(callback);

          // Return unsubscribe function
          return () => {
            listeners.get(prop)?.delete(callback);
          };
        };
      }

      if (key === 'unsubscribe') {
        return (prop, callback) => {
          listeners.get(prop)?.delete(callback);
        };
      }

      if (key === 'batch') {
        return (fn) => {
          batchUpdates = true;
          try {
            fn();
          } finally {
            batchUpdates = false;
            // Notify all pending
            pendingNotifications.forEach(k => {
              const keyListeners = listeners.get(k);
              if (keyListeners) {
                keyListeners.forEach(cb => cb(target[k], undefined, k));
              }
            });
            pendingNotifications.clear();
          }
        };
      }

      return target[key];
    }
  };

  return new Proxy(initialState, handler);
}

// =====================
// Application State
// =====================
const AppState = createReactiveState({
  habits: [],
  currentMonth: new Date(),
  selectedCategory: '',
  theme: 'light',
  isLoading: false,
  selectedTags: [],
  selectedIdentity: '',
  selectedReminderPeriod: '',
  selectedRepeatMode: 'new_record',
  tiptapEditor: null,  // TipTap editor instance
  modalEditor: null    // Temporary TipTap editor for modal dialogs
});