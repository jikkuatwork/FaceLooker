/**
 * FaceLooker Configuration Module
 * Centralized configuration for the FaceLooker application
 */

// Environment detection
const isDevelopment = window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1' ||
                     window.location.protocol === 'file:';

// Debug configuration
export const DEBUG_CONFIG = {
  enabled: isDevelopment,
  logToConsole: isDevelopment,
  showDebugPanel: isDevelopment
};

// Application configuration
export const APP_CONFIG = {
  // Application metadata
  name: 'FaceLooker',
  version: '1.0.0',
  description: 'Interactive face tracking experience with multiple face sets',

  // Paths and URLs
  basePath: './',
  facesPath: './faces/',
  assetsPath: './assets/',

  // Default viewer settings
  viewer: {
    width: 360,
    height: 360,
    cornerRadius: 8,
    downloadImagesAutomatically: false,
    showDebug: false,
    enableProgress: true,
    showLabel: false,
    draggable: false,
    resizable: false
  },

  // Grid configuration for face tracking
  grid: {
    min: -15,
    max: 15,
    step: 3,
    imageSize: 256,
    totalImages: 121
  },

  // Performance settings
  performance: {
    preloadImages: true,
    cacheSize: 100, // Maximum number of images to cache
    preloadThreshold: 0.8 // Preload images when 80% of current set is loaded
  },

  // UI settings
  ui: {
    maxViewers: 10,
    minViewerSize: 100,
    maxViewerSize: 800,
    resizeStep: 10,
    snapToGrid: false,
    gridSize: 10
  },

  // Console settings
  console: {
    maxLines: 100,
    autoScroll: true,
    showTimestamps: true,
    draggable: true,
    position: { x: 20, y: 20 }
  }
};

// Theme configuration
export const THEME_CONFIG = {
  default: 'light',
  themes: {
    light: {
      name: 'Light',
      colors: {
        primary: '#6366f1',
        primaryHover: '#5558e3',
        secondary: '#64748b',
        background: '#ffffff',
        surface: '#f8fafc',
        border: '#e2e8f0',
        text: '#1e293b',
        textSecondary: '#64748b',
        accent: '#f59e0b',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444'
      },
      shadows: {
        small: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        medium: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        large: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
      }
    },
    dark: {
      name: 'Dark',
      colors: {
        primary: '#818cf8',
        primaryHover: '#6366f1',
        secondary: '#94a3b8',
        background: '#0f172a',
        surface: '#1e293b',
        border: '#334155',
        text: '#f1f5f9',
        textSecondary: '#94a3b8',
        accent: '#fbbf24',
        success: '#34d399',
        warning: '#fbbf24',
        error: '#f87171'
      },
      shadows: {
        small: '0 1px 2px 0 rgb(0 0 0 / 0.25)',
        medium: '0 4px 6px -1px rgb(0 0 0 / 0.3)',
        large: '0 10px 15px -3px rgb(0 0 0 / 0.3)'
      }
    }
  }
};

// Face set configuration schema
export const FACE_SET_SCHEMA = {
  required: ['name', 'gridSize'],
  properties: {
    name: { type: 'string', minLength: 1 },
    subtitle: { type: 'string' },
    description: { type: 'string' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    gridSize: {
      type: 'object',
      required: ['min', 'max', 'step', 'imageSize'],
      properties: {
        min: { type: 'number' },
        max: { type: 'number' },
        step: { type: 'number', minimum: 1 },
        imageSize: { type: 'number', minimum: 1 }
      }
    },
    generated: { type: 'string', format: 'date' },
    totalImages: { type: 'number', minimum: 1 }
  }
};

// Registry configuration
export const REGISTRY_CONFIG = {
  version: '1.0',
  autoLoad: true,
  validateOnLoad: true,
  fallbackPath: 'faces/01/'
};

// Export default configuration object
export const DEFAULT_CONFIG = {
  debug: DEBUG_CONFIG,
  app: APP_CONFIG,
  theme: THEME_CONFIG,
  faceSetSchema: FACE_SET_SCHEMA,
  registry: REGISTRY_CONFIG
};

// Utility function to get current theme
export function getCurrentTheme() {
  const themeName = localStorage.getItem('facelooker-theme') || THEME_CONFIG.default;
  return THEME_CONFIG.themes[themeName] || THEME_CONFIG.themes.light;
}

// Utility function to apply theme CSS variables
export function applyTheme(themeName = null) {
  const theme = themeName ?
    THEME_CONFIG.themes[themeName] :
    getCurrentTheme();

  const root = document.documentElement;

  // Apply CSS custom properties
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });

  Object.entries(theme.shadows).forEach(([key, value]) => {
    root.style.setProperty(`--shadow-${key}`, value);
  });
}

// Configuration validation
export function validateConfig(config = DEFAULT_CONFIG) {
  const errors = [];

  // Validate debug config
  if (typeof config.debug.enabled !== 'boolean') {
    errors.push('debug.enabled must be a boolean');
  }

  // Validate viewer dimensions
  if (config.app.viewer.width < 100 || config.app.viewer.width > 2000) {
    errors.push('viewer.width must be between 100 and 2000');
  }

  if (config.app.viewer.height < 100 || config.app.viewer.height > 2000) {
    errors.push('viewer.height must be between 100 and 2000');
  }

  // Validate grid configuration
  if (config.app.grid.min >= config.app.grid.max) {
    errors.push('grid.min must be less than grid.max');
  }

  if (config.app.grid.step <= 0) {
    errors.push('grid.step must be greater than 0');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Export convenience function to get configuration
export function getConfig(path = null) {
  if (!path) return DEFAULT_CONFIG;

  return path.split('.').reduce((obj, key) => {
    return obj && obj[key] !== undefined ? obj[key] : null;
  }, DEFAULT_CONFIG);
}