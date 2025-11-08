/**
 * Image Cache Module
 * Provides intelligent caching for face images with memory management
 */

import { APP_CONFIG } from '../config.js';

export class ImageCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || APP_CONFIG.performance.cacheSize;
    this.cache = new Map();
    this.loadingPromises = new Map();
    this.accessOrder = []; // LRU tracking
    this.totalLoadedBytes = 0;
    this.maxMemoryBytes = options.maxMemoryBytes || 50 * 1024 * 1024; // 50MB default
  }

  /**
   * Get an image from cache or load it
   * @param {string} url - Image URL
   * @param {Function} loadCallback - Optional custom loading function
   * @returns {Promise<HTMLImageElement>} Image element
   */
  async get(url, loadCallback = null) {
    // Check cache first
    if (this.cache.has(url)) {
      this.updateAccessOrder(url);
      return this.cache.get(url);
    }

    // Check if already loading
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url);
    }

    // Load the image
    const loadingPromise = this.loadImage(url, loadCallback);
    this.loadingPromises.set(url, loadingPromise);

    try {
      const image = await loadingPromise;
      this.set(url, image);
      return image;
    } finally {
      this.loadingPromises.delete(url);
    }
  }

  /**
   * Load an image
   * @param {string} url - Image URL
   * @param {Function} customLoader - Custom loading function
   * @returns {Promise<HTMLImageElement>} Loaded image
   */
  loadImage(url, customLoader = null) {
    return new Promise((resolve, reject) => {
      if (customLoader) {
        customLoader(url)
          .then(resolve)
          .catch(reject);
        return;
      }

      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  /**
   * Store an image in cache
   * @param {string} url - Image URL
   * @param {HTMLImageElement} image - Image element
   */
  set(url, image) {
    // Check if already exists
    if (this.cache.has(url)) {
      this.updateAccessOrder(url);
      return;
    }

    // Estimate image size
    const estimatedSize = image.width * image.height * 4; // RGBA
    this.totalLoadedBytes += estimatedSize;

    // Evict if necessary
    while (this.shouldEvict()) {
      this.evictLeastRecentlyUsed();
    }

    // Add to cache
    this.cache.set(url, image);
    this.accessOrder.push(url);
  }

  /**
   * Check if cache should evict items
   * @returns {boolean} Whether eviction is needed
   */
  shouldEvict() {
    return this.cache.size >= this.maxSize ||
           this.totalLoadedBytes >= this.maxMemoryBytes;
  }

  /**
   * Evict least recently used items
   */
  evictLeastRecentlyUsed() {
    if (this.accessOrder.length === 0) return;

    const oldestUrl = this.accessOrder.shift();
    const removedImage = this.cache.get(oldestUrl);

    if (removedImage) {
      // Update memory estimate
      const estimatedSize = removedImage.width * removedImage.height * 4;
      this.totalLoadedBytes -= estimatedSize;
      this.cache.delete(oldestUrl);
    }
  }

  /**
   * Update access order for LRU
   * @param {string} url - Image URL
   */
  updateAccessOrder(url) {
    const index = this.accessOrder.indexOf(url);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(url);
  }

  /**
   * Preload multiple images
   * @param {Array<string>} urls - Array of image URLs
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Array>} Array of loaded images
   */
  async preloadBatch(urls, progressCallback = null) {
    const results = [];
    let loadedCount = 0;

    // Load images in batches to manage memory
    const batchSize = 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchPromises = batch.map(async (url) => {
        try {
          const image = await this.get(url);
          loadedCount++;
          if (progressCallback) {
            progressCallback(loadedCount, urls.length, url);
          }
          return { url, image, success: true };
        } catch (error) {
          loadedCount++;
          if (progressCallback) {
            progressCallback(loadedCount, urls.length, url);
          }
          return { url, error, success: false };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to prevent overwhelming the browser
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    return results;
  }

  /**
   * Check if an image is cached
   * @param {string} url - Image URL
   * @returns {boolean} Whether image is cached
   */
  has(url) {
    return this.cache.has(url);
  }

  /**
   * Remove an image from cache
   * @param {string} url - Image URL
   */
  remove(url) {
    const removedImage = this.cache.get(url);
    if (removedImage) {
      const estimatedSize = removedImage.width * removedImage.height * 4;
      this.totalLoadedBytes -= estimatedSize;
    }

    this.cache.delete(url);
    const index = this.accessOrder.indexOf(url);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Clear the entire cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
    this.totalLoadedBytes = 0;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryBytes: this.totalLoadedBytes,
      memoryMB: Math.round(this.totalLoadedBytes / (1024 * 1024) * 100) / 100,
      maxMemoryMB: Math.round(this.maxMemoryBytes / (1024 * 1024) * 100) / 100,
      utilization: Math.round((this.cache.size / this.maxSize) * 100),
      memoryUtilization: Math.round((this.totalLoadedBytes / this.maxMemoryBytes) * 100),
      loading: this.loadingPromises.size
    };
  }

  /**
   * Get URLs of cached images
   * @returns {Array<string>} Array of cached URLs
   */
  getCachedUrls() {
    return Array.from(this.cache.keys());
  }

  /**
   * Set maximum cache size
   * @param {number} maxSize - New maximum size
   */
  setMaxSize(maxSize) {
    this.maxSize = maxSize;
    while (this.shouldEvict()) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Set maximum memory usage
   * @param {number} maxMemoryBytes - New memory limit in bytes
   */
  setMaxMemory(maxMemoryBytes) {
    this.maxMemoryBytes = maxMemoryBytes;
    while (this.shouldEvict()) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Optimize cache by removing least accessed images
   * @param {number} targetSize - Target cache size
   */
  optimize(targetSize = Math.floor(this.maxSize * 0.8)) {
    while (this.cache.size > targetSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Warm cache with commonly used images
   * @param {string} faceSetPath - Face set path
   * @param {Array<Array<number>>} coordinates - Array of [x, y] coordinates
   * @param {Function} progressCallback - Progress callback
   */
  async warmCache(faceSetPath, coordinates, progressCallback = null) {
    const urls = coordinates.map(([x, y]) => {
      const gridX = Math.round((x - APP_CONFIG.grid.min) / APP_CONFIG.grid.step);
      const gridY = Math.round((y - APP_CONFIG.grid.min) / APP_CONFIG.grid.step);
      return `${faceSetPath}gaze_px${gridX}_py${gridY}_${APP_CONFIG.grid.imageSize}.webp`;
    });

    return this.preloadBatch(urls, progressCallback);
  }
}

// Export singleton instance
export const imageCache = new ImageCache();