/**
 * Event Bus Module
 * Provides centralized event-driven communication between components
 */

import { DEBUG_CONFIG } from '../config.js';

export class EventBus {
  constructor() {
    this.events = new Map();
    this.onceEvents = new Map();
    this.history = [];
    this.maxHistorySize = 100;
    this.middleware = [];
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Event handler function
   * @param {Object} options - Subscription options
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback, options = {}) {
    if (typeof callback !== 'function') {
      throw new Error('Event callback must be a function');
    }

    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }

    const subscription = {
      callback,
      context: options.context || null,
      priority: options.priority || 0,
      once: false,
      id: this.generateSubscriptionId()
    };

    const listeners = this.events.get(eventName);
    listeners.push(subscription);

    // Sort by priority (higher priority first)
    listeners.sort((a, b) => b.priority - a.priority);

    // Return unsubscribe function
    return () => this.off(eventName, subscription.id);
  }

  /**
   * Subscribe to an event only once
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Event handler function
   * @param {Object} options - Subscription options
   * @returns {Function} Unsubscribe function
   */
  once(eventName, callback, options = {}) {
    if (typeof callback !== 'function') {
      throw new Error('Event callback must be a function');
    }

    if (!this.onceEvents.has(eventName)) {
      this.onceEvents.set(eventName, []);
    }

    const subscription = {
      callback,
      context: options.context || null,
      priority: options.priority || 0,
      once: true,
      id: this.generateSubscriptionId()
    };

    const listeners = this.onceEvents.get(eventName);
    listeners.push(subscription);

    // Sort by priority
    listeners.sort((a, b) => b.priority - a.priority);

    // Return unsubscribe function
    return () => this.offOnce(eventName, subscription.id);
  }

  /**
   * Emit an event
   * @param {string} eventName - Name of the event
   * @param {*} data - Event data
   * @param {Object} options - Emit options
   */
  emit(eventName, data = null, options = {}) {
    const event = {
      name: eventName,
      data,
      timestamp: Date.now(),
      source: options.source || 'unknown',
      preventDefault: false,
      stopPropagation: false
    };

    // Add to history
    this.addToHistory(event);

    // Apply middleware
    for (const middleware of this.middleware) {
      try {
        middleware(event);
        if (event.stopPropagation) {
          break;
        }
      } catch (error) {
        console.error('Event middleware error:', error);
      }
    }

    if (!event.stopPropagation) {
      // Emit to regular listeners
      this.emitToListeners(this.events.get(eventName), event);

      // Emit to once listeners
      this.emitToListeners(this.onceEvents.get(eventName), event);

      // Clear once listeners after execution
      this.onceEvents.delete(eventName);
    }

    // Debug logging
    if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.logToConsole) {
      console.debug(`Event emitted: ${eventName}`, { data, source: event.source });
    }
  }

  /**
   * Emit event to specific listeners
   * @param {Array} listeners - Array of listeners
   * @param {Object} event - Event object
   */
  emitToListeners(listeners, event) {
    if (!listeners) return;

    for (const subscription of listeners) {
      try {
        const context = subscription.context || null;
        subscription.callback.call(context, event.data, event);

        if (event.stopPropagation) {
          break;
        }
      } catch (error) {
        console.error(`Error in event listener for ${event.name}:`, error);
      }
    }
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventName - Name of the event
   * @param {string} subscriptionId - Subscription ID
   */
  off(eventName, subscriptionId) {
    const listeners = this.events.get(eventName);
    if (listeners) {
      const index = listeners.findIndex(sub => sub.id === subscriptionId);
      if (index > -1) {
        listeners.splice(index, 1);
      }

      if (listeners.length === 0) {
        this.events.delete(eventName);
      }
    }
  }

  /**
   * Unsubscribe from a once event
   * @param {string} eventName - Name of the event
   * @param {string} subscriptionId - Subscription ID
   */
  offOnce(eventName, subscriptionId) {
    const listeners = this.onceEvents.get(eventName);
    if (listeners) {
      const index = listeners.findIndex(sub => sub.id === subscriptionId);
      if (index > -1) {
        listeners.splice(index, 1);
      }

      if (listeners.length === 0) {
        this.onceEvents.delete(eventName);
      }
    }
  }

  /**
   * Remove all listeners for an event or all events
   * @param {string} eventName - Name of the event (optional)
   */
  removeAllListeners(eventName = null) {
    if (eventName) {
      this.events.delete(eventName);
      this.onceEvents.delete(eventName);
    } else {
      this.events.clear();
      this.onceEvents.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   * @param {string} eventName - Name of the event
   * @returns {number} Number of listeners
   */
  listenerCount(eventName) {
    const regular = (this.events.get(eventName) || []).length;
    const once = (this.onceEvents.get(eventName) || []).length;
    return regular + once;
  }

  /**
   * Get all event names
   * @returns {Array<string>} Array of event names
   */
  eventNames() {
    const names = new Set();
    for (const eventName of this.events.keys()) {
      names.add(eventName);
    }
    for (const eventName of this.onceEvents.keys()) {
      names.add(eventName);
    }
    return Array.from(names);
  }

  /**
   * Add middleware for event processing
   * @param {Function} middleware - Middleware function
   * @returns {Function} Remove middleware function
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Event middleware must be a function');
    }

    this.middleware.push(middleware);

    return () => {
      const index = this.middleware.indexOf(middleware);
      if (index > -1) {
        this.middleware.splice(index, 1);
      }
    };
  }

  /**
   * Add event to history
   * @param {Object} event - Event object
   */
  addToHistory(event) {
    this.history.push({
      ...event,
      timestamp: Date.now()
    });

    // Trim history if it exceeds max size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Get event history
   * @param {string} eventName - Filter by event name (optional)
   * @param {number} limit - Limit number of results (optional)
   * @returns {Array} Event history
   */
  getHistory(eventName = null, limit = null) {
    let history = this.history;

    if (eventName) {
      history = history.filter(event => event.name === eventName);
    }

    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Generate unique subscription ID
   * @returns {string} Unique ID
   */
  generateSubscriptionId() {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get statistics about the event bus
   * @returns {Object} Statistics
   */
  getStats() {
    let totalListeners = 0;
    for (const listeners of this.events.values()) {
      totalListeners += listeners.length;
    }
    for (const listeners of this.onceEvents.values()) {
      totalListeners += listeners.length;
    }

    return {
      totalEvents: this.events.size + this.onceEvents.size,
      totalListeners,
      historySize: this.history.length,
      middlewareCount: this.middleware.length
    };
  }

  /**
   * Wait for an event to occur
   * @param {string} eventName - Name of the event
   * @param {number} timeout - Timeout in milliseconds (optional)
   * @returns {Promise} Promise that resolves with event data
   */
  waitFor(eventName, timeout = null) {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.once(eventName, (data) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(data);
      });

      let timeoutId = null;
      if (timeout) {
        timeoutId = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for event: ${eventName}`));
        }, timeout);
      }
    });
  }

  /**
   * Create a namespaced event bus
   * @param {string} namespace - Namespace prefix
   * @returns {Object} Namespaced event bus interface
   */
  namespace(namespace) {
    return {
      on: (eventName, callback, options) =>
        this.on(`${namespace}:${eventName}`, callback, options),
      once: (eventName, callback, options) =>
        this.once(`${namespace}:${eventName}`, callback, options),
      emit: (eventName, data, options) =>
        this.emit(`${namespace}:${eventName}`, data, options),
      off: (eventName, subscriptionId) =>
        this.off(`${namespace}:${eventName}`, subscriptionId),
      waitFor: (eventName, timeout) =>
        this.waitFor(`${namespace}:${eventName}`, timeout),
      listenerCount: (eventName) =>
        this.listenerCount(`${namespace}:${eventName}`),
      removeAllListeners: (eventName) =>
        eventName ? this.removeAllListeners(`${namespace}:${eventName}`) : null
    };
  }
}

// Event name constants for better type safety and maintainability
export const EVENT_NAMES = {
  // Face viewer events
  VIEWER_CREATED: 'viewer:created',
  VIEWER_DESTROYED: 'viewer:destroyed',
  VIEWER_SELECTED: 'viewer:selected',
  VIEWER_DESELECTED: 'viewer:deselected',
  VIEWER_MOVED: 'viewer:moved',
  VIEWER_RESIZED: 'viewer:resized',
  VIEWER_FACE_CHANGED: 'viewer:face-changed',
  VIEWER_GAZE_CHANGED: 'viewer:gaze-changed',

  // Face set events
  FACE_SET_LOADED: 'face-set:loaded',
  FACE_SET_LOAD_FAILED: 'face-set:load-failed',
  FACE_SET_CHANGED: 'face-set:changed',
  FACE_SET_REGISTRY_LOADED: 'face-set-registry:loaded',

  // Image loading events
  IMAGE_LOAD_START: 'image:load-start',
  IMAGE_LOAD_PROGRESS: 'image:load-progress',
  IMAGE_LOAD_COMPLETE: 'image:load-complete',
  IMAGE_LOAD_ERROR: 'image:load-error',
  IMAGE_CACHE_CLEARED: 'image:cache-cleared',

  // UI events
  THEME_CHANGED: 'ui:theme-changed',
  SIDEBAR_TOGGLED: 'ui:sidebar-toggled',
  CONSOLE_TOGGLED: 'ui:console-toggled',
  DEBUG_MODE_CHANGED: 'ui:debug-mode-changed',

  // Application events
  APP_READY: 'app:ready',
  APP_ERROR: 'app:error',
  APP_CONFIG_CHANGED: 'app:config-changed',

  // Interaction events
  CURSOR_MOVED: 'interaction:cursor-moved',
  TOUCH_STARTED: 'interaction:touch-started',
  TOUCH_MOVED: 'interaction:touch-moved',
  TOUCH_ENDED: 'interaction:touch-ended'
};

// Export singleton instance
export const eventBus = new EventBus();