/**
 * Face Set Loader Module
 * Handles loading, validation, and management of face sets
 */

import { APP_CONFIG, FACE_SET_SCHEMA, REGISTRY_CONFIG } from '../config.js';

export class FaceSetLoader {
  constructor() {
    this.cache = new Map();
    this.registry = null;
    this.loadingPromises = new Map();
  }

  /**
   * Load the face set registry
   * @returns {Promise<Object>} Registry data
   */
  async loadRegistry() {
    if (this.registry) {
      return this.registry;
    }

    try {
      const response = await fetch('registry.json');
      if (!response.ok) {
        throw new Error(`Failed to load registry: ${response.status}`);
      }

      const faceSetPaths = await response.json();

      // Convert simple array to structured format for backward compatibility
      this.registry = {
        version: '2.0',
        default: faceSetPaths[0], // First element is default
        faceSets: faceSetPaths.map((path, index) => ({
          id: path,
          path: path,
          enabled: true,
          priority: index + 1,
          tags: index === 0 ? ['default'] : []
        })),
        metadata: {
          lastUpdated: new Date().toISOString().split('T')[0],
          totalFaceSets: faceSetPaths.length,
          enabledFaceSets: faceSetPaths.length,
          autoLoad: true,
          validateOnLoad: false
        }
      };

      return this.registry;
    } catch (error) {
      console.error('Failed to load face set registry:', error);
      // Fallback to basic registry structure
      this.registry = {
        version: '2.0',
        default: REGISTRY_CONFIG.fallbackPath,
        faceSets: [{
          id: REGISTRY_CONFIG.fallbackPath,
          path: REGISTRY_CONFIG.fallbackPath,
          enabled: true,
          priority: 1,
          tags: ['fallback']
        }],
        metadata: {
          lastUpdated: new Date().toISOString().split('T')[0],
          totalFaceSets: 1,
          enabledFaceSets: 1,
          autoLoad: true,
          validateOnLoad: false
        }
      };
      return this.registry;
    }
  }

  /**
   * Get list of available face sets
   * @param {Object} options - Filter options
   * @returns {Array} Array of face set metadata
   */
  async getAvailableFaceSets(options = {}) {
    const registry = await this.loadRegistry();
    let faceSets = registry.faceSets || [];

    // Filter enabled face sets
    if (options.enabledOnly !== false) {
      faceSets = faceSets.filter(set => set.enabled !== false);
    }

    // Sort by priority
    faceSets.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    // Filter by tags if specified
    if (options.tags && options.tags.length > 0) {
      faceSets = faceSets.filter(set =>
        set.tags && options.tags.some(tag => set.tags.includes(tag))
      );
    }

    return faceSets;
  }

  /**
   * Load metadata for a specific face set
   * @param {string} faceSetPath - Path to the face set
   * @returns {Promise<Object>} Face set metadata
   */
  async loadFaceSetMetadata(faceSetPath) {
    // Check cache first
    if (this.cache.has(faceSetPath) && this.cache.get(faceSetPath).metadata) {
      return this.cache.get(faceSetPath).metadata;
    }

    // Check if already loading
    if (this.loadingPromises.has(faceSetPath)) {
      return this.loadingPromises.get(faceSetPath);
    }

    // Start loading
    const loadingPromise = this._loadMetadataFromSource(faceSetPath);
    this.loadingPromises.set(faceSetPath, loadingPromise);

    try {
      const metadata = await loadingPromise;
      this.cache.set(faceSetPath, { metadata });
      return metadata;
    } finally {
      this.loadingPromises.delete(faceSetPath);
    }
  }

  /**
   * Load metadata from the actual source
   * @param {string} faceSetPath - Path to the face set
   * @returns {Promise<Object>} Face set metadata
   */
  async _loadMetadataFromSource(faceSetPath) {
    const metaUrl = `${faceSetPath}meta.json`;

    try {
      const response = await fetch(metaUrl);
      if (!response.ok) {
        throw new Error(`Failed to load metadata: ${response.status}`);
      }

      const metadata = await response.json();

      // Validate metadata structure
      if (REGISTRY_CONFIG.validateOnLoad) {
        this.validateFaceSetMetadata(metadata);
      }

      // Add computed properties
      metadata.path = faceSetPath;
      metadata.totalImages = metadata.totalImages || this.calculateTotalImages(metadata.gridSize);
      metadata.loadedAt = new Date().toISOString();

      return metadata;
    } catch (error) {
      console.error(`Failed to load metadata for ${faceSetPath}:`, error);

      // Return fallback metadata
      return {
        name: 'Unknown Face Set',
        subtitle: 'Error loading metadata',
        description: 'Face set could not be loaded properly',
        version: '1.0.0',
        gridSize: APP_CONFIG.grid,
        generated: '2024-01-01',
        totalImages: APP_CONFIG.grid.totalImages,
        path: faceSetPath,
        loadedAt: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Calculate total images from grid configuration
   * @param {Object} gridSize - Grid configuration
   * @returns {number} Total number of images
   */
  calculateTotalImages(gridSize) {
    if (!gridSize) return APP_CONFIG.grid.totalImages;

    const { min, max, step } = gridSize;
    const range = max - min;
    const steps = Math.floor(range / step) + 1;
    return steps * steps;
  }

  /**
   * Get face image URL based on gaze coordinates
   * @param {string} faceSetPath - Path to the face set
   * @param {number} x - Horizontal gaze position (-15 to +15)
   * @param {number} y - Vertical gaze position (-15 to +15)
   * @param {number} size - Image size
   * @returns {string} Image URL
   */
  getImageUrl(faceSetPath, x, y, size = APP_CONFIG.grid.imageSize) {
    // Format coordinates to match file naming convention (e.g., 0p0, 3p0, m12p0)
    const formatCoord = (val) => {
      const str = Number(val).toFixed(1);
      return str.replace('-', 'm').replace('.', 'p');
    };

    return `${faceSetPath}gaze_px${formatCoord(x)}_py${formatCoord(y)}_${size}.webp`;
  }

  /**
   * Preload face images for a face set
   * @param {string} faceSetPath - Path to the face set
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Array>} Array of loaded images
   */
  async preloadFaceImages(faceSetPath, progressCallback = null) {
    const metadata = await this.loadFaceSetMetadata(faceSetPath);
    const images = [];
    let loadedCount = 0;
    const totalCount = metadata.totalImages;

    const { min, max, step, imageSize } = metadata.gridSize || APP_CONFIG.grid;
    const range = max - min;
    const steps = Math.floor(range / step) + 1;

    // Create array of all image URLs
    const imageUrls = [];
    for (let y = 0; y < steps; y++) {
      for (let x = 0; x < steps; x++) {
        const url = `${faceSetPath}gaze_px${x}_py${y}_${imageSize}.webp`;
        imageUrls.push(url);
      }
    }

    // Load images in parallel with progress tracking
    const loadPromises = imageUrls.map(url => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          loadedCount++;
          if (progressCallback) {
            progressCallback(loadedCount, totalCount, url);
          }
          resolve(img);
        };
        img.onerror = () => {
          loadedCount++;
          if (progressCallback) {
            progressCallback(loadedCount, totalCount, url);
          }
          resolve(null); // Don't reject, continue with other images
        };
        img.src = url;
      });
    });

    const loadedImages = await Promise.all(loadPromises);

    // Cache loaded images
    this.cache.set(faceSetPath, {
      ...this.cache.get(faceSetPath),
      images: loadedImages.filter(img => img !== null)
    });

    return loadedImages.filter(img => img !== null);
  }

  /**
   * Get cached images for a face set
   * @param {string} faceSetPath - Path to the face set
   * @returns {Array|null} Cached images or null
   */
  getCachedImages(faceSetPath) {
    const cached = this.cache.get(faceSetPath);
    return cached ? cached.images : null;
  }

  /**
   * Clear cache for a specific face set or all caches
   * @param {string} faceSetPath - Path to clear (optional)
   */
  clearCache(faceSetPath = null) {
    if (faceSetPath) {
      this.cache.delete(faceSetPath);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Validate registry structure
   * @param {Object} registry - Registry data
   */
  validateRegistry(registry) {
    if (!registry.version || !Array.isArray(registry.faceSets)) {
      throw new Error('Invalid registry structure');
    }

    for (const faceSet of registry.faceSets) {
      if (!faceSet.id || !faceSet.path) {
        throw new Error(`Invalid face set entry: missing id or path`);
      }
    }
  }

  /**
   * Validate face set metadata
   * @param {Object} metadata - Metadata to validate
   */
  validateFaceSetMetadata(metadata) {
    const required = FACE_SET_SCHEMA.required;

    for (const field of required) {
      if (!metadata[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate grid size
    if (metadata.gridSize) {
      const { min, max, step, imageSize } = metadata.gridSize;
      if (min >= max || step <= 0 || imageSize <= 0) {
        throw new Error('Invalid grid configuration');
      }
    }
  }

  /**
   * Get default face set path
   * @returns {Promise<string>} Default face set path
   */
  async getDefaultFaceSet() {
    const registry = await this.loadRegistry();
    return registry.default || REGISTRY_CONFIG.fallbackPath;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    let totalImages = 0;
    let totalSize = 0;

    for (const [path, data] of this.cache.entries()) {
      if (data.images) {
        totalImages += data.images.length;
        // Rough estimate of memory usage
        totalSize += data.images.length * APP_CONFIG.grid.imageSize * APP_CONFIG.grid.imageSize * 4;
      }
    }

    return {
      faceSets: this.cache.size,
      totalImages,
      estimatedMemoryBytes: totalSize,
      estimatedMemoryMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
    };
  }
}

// Export singleton instance
export const faceSetLoader = new FaceSetLoader();