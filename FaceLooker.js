/**
 * FaceLooker - Interactive face tracking module
 * A modern ES6 module for displaying interactive faces that follow cursor movement
 */

import { APP_CONFIG, DEBUG_CONFIG } from './config.js';
import { faceSetLoader } from './data/FaceSetLoader.js';
import { imageCache } from './data/ImageCache.js';
import { eventBus, EVENT_NAMES } from './events/EventBus.js';
import { animationDriver } from './animation/AnimationDriver.js';

// Debug logging function
function debugLog(...args) {
  if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.logToConsole) {
    console.log(...args);
  }
}

export class FaceLooker {
  constructor(options = {}) {
    // Configuration - merge with defaults
    this.config = {
      ...APP_CONFIG.viewer,
      faces: options.faces || './faces/02/', // Default fallback, will be updated in async init
      ...options,

      
      // Callbacks
      onLoad: options.onLoad || (() => {}),
      onError: options.onError || (() => {}),
      onProgress: options.onProgress || (() => {}),
      onImageLoad: options.onImageLoad || (() => {}),
      onReady: options.onReady || (() => {})
    };

    // Grid configuration from config
    this.gridConfig = APP_CONFIG.grid;
    this.P_MIN = this.gridConfig.min;
    this.P_MAX = this.gridConfig.max;
    this.STEP = this.gridConfig.step;
    this.SIZE = this.gridConfig.imageSize;

    // State
    this.metaData = null;
    this.isActive = false;
    this.container = null;
    this.faceImage = null;
    this.id = this.generateId();

    // Event listeners for cleanup
    this.eventListeners = new Set();
    this.debugEl = null;
    this.isDragging = false;
    this.isResizing = false;
    this.dragStart = { x: 0, y: 0 };
    this.containerStart = { x: 0, y: 0 };
    this.sizeStart = { width: 0, height: 0 };
    this.baseZIndex = 1;

    // Progress elements
    this.progressContainer = null;
    this.progressBar = null;
    this.progressText = null;
    this.previewImage = null;
    this.mainContent = null;

    this.init();
  }

  // Generate unique ID for this viewer
  generateId() {
    return `viewer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async init() {
    try {
      // Emit viewer creation event
      eventBus.emit(EVENT_NAMES.VIEWER_CREATED, {
        id: this.id,
        config: this.config
      }, { source: 'FaceLooker' });

      // Update face set path to default if needed
      if (this.config.faces === './faces/02/') {
        this.config.faces = await faceSetLoader.getDefaultFaceSet();
      }

      this.createContainer();
      this.initializeAnimationDriver();
      await this.loadMetaData();

      // Emit viewer ready event
      eventBus.emit(EVENT_NAMES.APP_READY, {
        viewerId: this.id,
        faceSet: this.config.faces
      }, { source: 'FaceLooker' });

    } catch (error) {
      debugLog('Error during initialization:', error);
      this.config.onError(error);

      // Emit error event
      eventBus.emit(EVENT_NAMES.APP_ERROR, {
        viewerId: this.id,
        error: error.message
      }, { source: 'FaceLooker' });
    }
  }

  createContainer() {
    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'face-looker-viewer';
    this.container.style.cssText = `
      position: relative;
      width: ${this.config.width}px;
      height: ${this.config.height}px;
      background: #f0f0f0;
      border-radius: ${this.config.cornerRadius}px;
      overflow: hidden;
      cursor: ${this.config.draggable ? 'move' : 'default'};
      z-index: ${this.baseZIndex};
    `;

    // Add selection capability
    this.container.addEventListener('click', (e) => {
      e.stopPropagation();
      debugLog('🖱️ Viewer clicked, ID:', this.id);
      this.select();
    });

    // Add drag and resize handlers
    if (this.config.draggable) {
      this.addDragHandlers();
    }
    if (this.config.resizable) {
      this.addResizeHandlers();
    }

    // Create progress screen if enabled
    if (this.config.enableProgress) {
      this.createProgressScreen();
    }

    // Create main content
    this.createMainContent();

    // Create face image
    this.faceImage = document.createElement('img');
    this.faceImage.className = 'face-image';
    this.faceImage.alt = 'Face following gaze';
    this.faceImage.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: opacity 0.2s ease-out;
    `;

    // Set initial image to center gaze position for smooth transition
    this.faceImage.src = `${this.config.faces}gaze_px0p0_py0p0_${APP_CONFIG.grid.imageSize}.webp`;

    this.imageContainer.appendChild(this.faceImage);

    // Create debug element if enabled
    if (this.config.showDebug) {
      this.createDebugElement();
    }
  }

  createProgressScreen() {
    this.progressContainer = document.createElement('div');
    this.progressContainer.className = 'face-looker-progress';
    this.progressContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #f0f0f0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      transition: opacity 0.2s ease-out;
    `;

    // Preview image - styled exactly like the final face image
    this.previewImage = document.createElement('img');
    this.previewImage.className = 'face-preview';
    this.previewImage.alt = 'Loading face...';
    this.previewImage.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: opacity 0.2s ease-out;
    `;

    // Set initial preview to center gaze image if available
    this.previewImage.src = `${this.config.faces}gaze_px0p0_py0p0_${APP_CONFIG.grid.imageSize}.webp`;
    this.previewImage.onerror = () => {
      // Fallback to background color if center image not available
      this.previewImage.style.display = 'none';
    };

    // Create image container for preview image (same as main content)
    const previewImageContainer = document.createElement('div');
    previewImageContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: ${this.config.cornerRadius}px;
      overflow: hidden;
    `;
    previewImageContainer.appendChild(this.previewImage);

    // Add the preview image container to progress container (shows behind progress)
    this.progressContainer.appendChild(previewImageContainer);

    
    // Circular progress bar - positioned in center
    const progressIndicator = document.createElement('div');
    progressIndicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 60px;
      height: 60px;
      z-index: 10;
    `;

    // SVG circular progress bar
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '60');
    svg.setAttribute('height', '60');
    svg.style.cssText = `
      transform: rotate(-90deg); /* Start from top */
    `;

    // Background circle
    const backgroundCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    backgroundCircle.setAttribute('cx', '30');
    backgroundCircle.setAttribute('cy', '30');
    backgroundCircle.setAttribute('r', '25');
    backgroundCircle.setAttribute('fill', 'none');
    backgroundCircle.setAttribute('stroke', 'rgba(99, 102, 241, 0.2)');
    backgroundCircle.setAttribute('stroke-width', '4');

    // Progress circle
    const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressCircle.setAttribute('cx', '30');
    progressCircle.setAttribute('cy', '30');
    progressCircle.setAttribute('r', '25');
    progressCircle.setAttribute('fill', 'none');
    progressCircle.setAttribute('stroke', '#6366f1');
    progressCircle.setAttribute('stroke-width', '4');
    progressCircle.setAttribute('stroke-linecap', 'round');
    progressCircle.style.cssText = `
      transition: stroke-dashoffset 0.3s ease;
      stroke-dasharray: ${2 * Math.PI * 25};
      stroke-dashoffset: ${2 * Math.PI * 25}; /* Start at 0% */
    `;

    svg.appendChild(backgroundCircle);
    svg.appendChild(progressCircle);
    progressIndicator.appendChild(svg);

    // Store reference for progress updates
    this.progressIndicator = progressIndicator;
    this.progressCircle = progressCircle;
    this.circumference = 2 * Math.PI * 25; // Store for progress calculations

    this.progressContainer.appendChild(previewImageContainer);
    this.progressContainer.appendChild(progressIndicator);
    this.container.appendChild(this.progressContainer);
  }

  createMainContent() {
    this.mainContent = document.createElement('div');
    this.mainContent.className = 'face-looker-main';
    this.mainContent.style.cssText = `
      opacity: 0;
      transition: opacity 0.2s ease-out;
      width: 100%;
      height: 100%;
    `;

    // Meta data display
    this.metaContainer = document.createElement('div');
    this.metaContainer.className = 'face-meta';
    this.metaContainer.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: ui-sans-serif, system-ui, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    this.imageContainer = document.createElement('div');
    this.imageContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: ${this.config.cornerRadius}px;
      overflow: hidden;
    `;

    this.mainContent.appendChild(this.imageContainer);
    this.mainContent.appendChild(this.metaContainer);
    this.container.appendChild(this.mainContent);
  }

  createDebugElement() {
    this.debugEl = document.createElement('div');
    this.debugEl.className = 'face-debug';
    this.debugEl.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.4;
      pointer-events: none;
      display: ${this.config.showDebug ? 'block' : 'none'};
    `;
    this.mainContent.appendChild(this.debugEl);
  }

  async loadMetaData() {
    try {
      // Use the new face set loader
      this.metaData = await faceSetLoader.loadFaceSetMetadata(this.config.faces);
      this.updateMetaDisplay();

      // Emit face set loaded event
      eventBus.emit(EVENT_NAMES.FACE_SET_LOADED, {
        viewerId: this.id,
        faceSet: this.config.faces,
        metadata: this.metaData
      }, { source: 'FaceLooker' });

    } catch (error) {
      debugLog('Error loading face set metadata:', error);

      // Emit face set load failed event
      eventBus.emit(EVENT_NAMES.FACE_SET_LOAD_FAILED, {
        viewerId: this.id,
        faceSet: this.config.faces,
        error: error.message
      }, { source: 'FaceLooker' });
    }

    this.startImageLoading();
  }

  updateMetaDisplay() {
    if (this.metaData && this.metaContainer) {
      let metaHtml = '';
      if (this.metaData.name) {
        metaHtml += `<div style="font-weight: bold; text-align: left; margin-bottom: 2px;">${this.metaData.name}</div>`;
      }
      if (this.metaData.subtitle) {
        metaHtml += `<div style="font-size: 11px; opacity: 0.8; text-align: left;">${this.metaData.subtitle}</div>`;
      }
      this.metaContainer.innerHTML = metaHtml;
      this.metaContainer.style.opacity = this.config.showLabel ? '1' : '0';
      this.metaContainer.style.pointerEvents = this.config.showLabel ? 'auto' : 'none';
    }
  }

  setLabelVisibility(visible) {
    this.config.showLabel = visible;
    this.updateMetaDisplay();
  }

  generateImageFilenames() {
    const filenames = [];
    for (let px = this.P_MIN; px <= this.P_MAX; px += this.STEP) {
      for (let py = this.P_MIN; py <= this.P_MAX; py += this.STEP) {
        filenames.push(this.gridToFilename(px, py));
      }
    }
    return filenames;
  }

  getImageUrl(x, y, size = this.SIZE) {
    return faceSetLoader.getImageUrl(this.config.faces, x, y, size);
  }

  gridToFilename(px, py) {
    const sanitize = (val) => {
      const str = Number(val).toFixed(1);
      return str.replace('-', 'm').replace('.', 'p');
    };
    return `gaze_px${sanitize(px)}_py${sanitize(py)}_${this.SIZE}.webp`;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  quantizeToGrid(val) {
    const raw = this.P_MIN + (val + 1) * (this.P_MAX - this.P_MIN) / 2;
    const snapped = Math.round(raw / this.STEP) * this.STEP;
    return this.clamp(snapped, this.P_MIN, this.P_MAX);
  }

  async startImageLoading() {
    const imageFilenames = this.generateImageFilenames();

    // Set center image as preview
    const centerFilename = this.gridToFilename(0, 0);
    if (this.previewImage) {
      this.previewImage.src = `${this.config.faces}${centerFilename}`;
    }

    // Load all images
    await this.preloadImages(imageFilenames);
  }

  async preloadImages(filenames) {
    const totalImages = filenames.length;
    let loadedCount = 0;

    // Convert filenames to full URLs
    const imageUrls = filenames.map(filename => `${this.config.faces}${filename}`);

    // Use the new image cache module for batch preloading
    const results = await imageCache.preloadBatch(imageUrls, (loaded, total, url) => {
      loadedCount = loaded;
      const progress = (loaded / total) * 100;

      // Update circular progress bar - fill based on progress
      if (this.progressCircle && this.circumference) {
        const offset = this.circumference - (progress / 100) * this.circumference;
        this.progressCircle.style.strokeDashoffset = offset;
      }

      // Call progress callback
      this.config.onProgress(progress, loaded, total, url);

      // Call individual image load callback
      const filename = url.split('/').pop();
      this.config.onImageLoad(filename, loaded, total);
    });

    // Resolve when all are complete
    // After preloading is done, activate the viewer
    this.config.onLoad(imageCache.getStats(), this.metaData);
    this.activate();
    return results;
  }

  activate() {
    this.isActive = true;

    // Hide progress and show main content with smooth transition immediately
    if (this.progressContainer) {
      this.progressContainer.style.opacity = '0';
      this.progressContainer.style.pointerEvents = 'none';
    }
    if (this.mainContent) {
      this.mainContent.style.opacity = '1';
    }

    // Start tracking
    this.startTracking();

    // Trigger ready callback
    this.config.onReady();
  }

  startTracking() {
    const handleMouseMove = (e) => {
      if (!this.isActive) return;
      this.updateFromClient(e.clientX, e.clientY);
    };

    const handleTouchMove = (e) => {
      if (!this.isActive) return;
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        this.updateFromClient(t.clientX, t.clientY);
      }
    };

    // Add global event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    // Store event handlers for cleanup
    this.eventHandlers = { handleMouseMove, handleTouchMove };

    // Initialize at center
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    this.updateFromClient(centerX, centerY);
  }

  async updateFromClient(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const nx = (clientX - centerX) / (rect.width / 2);
    const ny = (centerY - clientY) / (rect.height / 2);

    const clampedX = this.clamp(nx, -1, 1);
    const clampedY = this.clamp(ny, -1, 1);

    const px = this.quantizeToGrid(clampedX);
    const py = this.quantizeToGrid(clampedY);

    const imageUrl = this.getImageUrl(px, py);

    try {
      // Use the new image cache
      const image = await imageCache.get(imageUrl);
      if (this.faceImage) {
        this.faceImage.src = image.src;
      }

      // Emit gaze changed event
      eventBus.emit(EVENT_NAMES.VIEWER_GAZE_CHANGED, {
        viewerId: this.id,
        x: px,
        y: py,
        imageUrl
      }, { source: 'FaceLooker' });

    } catch (error) {
      debugLog('Error loading face image:', error);
    }

    // Update debug info
    if (this.debugEl) {
      this.debugEl.innerHTML = `Mouse: (${Math.round(clientX - rect.left)}, ${Math.round(clientY - rect.top)})<br/>Gaze: (${px.toFixed(1)}, ${py.toFixed(1)})<br/>Image: ${imageUrl.split('/').pop()}`;
    }
  }

  /**
   * Initialize animation driver subscription
   */
  initializeAnimationDriver() {
    // Subscribe to global animation driver events (if it's running)
    this.cursorMoveSubscription = eventBus.on(EVENT_NAMES.CURSOR_MOVED, (data, event) => {
      // Only respond to animation driver events when not using mouse directly
      if (event.source === 'AnimationDriver') {
        this.updateFromClient(data.x, data.y);
      }
    });

    debugLog('🔴 Animation driver subscription initialized for viewer:', this.id);
  }

  /**
   * Get canvas boundaries for animation driver
   * @returns {Object} Canvas bounds {x, y, width, height}
   */
  getCanvasBounds() {
    const canvas = document.getElementById('canvas');
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      };
    }

    // Fallback to window bounds
    return {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  addDragHandlers() {
    let offsetX = 0;
    let offsetY = 0;

    this.dragMouseDown = (e) => {
      // Don't drag if clicking on interactive elements
      if (e.target.closest('.resize-handle') || e.target.closest('button') || e.target.closest('input')) {
        return;
      }

      e.preventDefault();
      this.isDragging = true;

      const rect = this.container.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      document.addEventListener('mousemove', this.dragMouseMove);
      document.addEventListener('mouseup', this.dragMouseUp);

      this.container.style.zIndex = '9999';
      this.container.style.cursor = 'grabbing';
    };

    this.dragMouseMove = (e) => {
      if (!this.isDragging) return;

      // Find the canvas element (parent of position: relative container)
      const canvas = this.container.closest('.canvas-area');
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const viewerRect = this.container.getBoundingClientRect();

      let x = e.clientX - offsetX;
      let y = e.clientY - offsetY;

      // Constrain to canvas bounds
      const minX = canvasRect.left;
      const minY = canvasRect.top;
      const maxX = canvasRect.right - viewerRect.width;
      const maxY = canvasRect.bottom - viewerRect.height;

      x = Math.max(minX, Math.min(x, maxX));
      y = Math.max(minY, Math.min(y, maxY));

      // Convert to position relative to canvas
      const relativeX = x - canvasRect.left;
      const relativeY = y - canvasRect.top;

      this.container.style.position = 'absolute';
      this.container.style.left = `${relativeX}px`;
      this.container.style.top = `${relativeY}px`;
    };

    this.dragMouseUp = () => {
      this.isDragging = false;
      this.container.style.zIndex = '';
      this.container.style.cursor = this.config.draggable ? 'move' : 'default';
      document.removeEventListener('mousemove', this.dragMouseMove);
      document.removeEventListener('mouseup', this.dragMouseUp);
    };

    this.dragMouseEnter = () => {
      if (this.config.draggable && !this.isDragging) {
        this.container.style.cursor = 'move';
      }
    };

    // Add event listeners to the entire container
    this.container.addEventListener('mousedown', this.dragMouseDown);
    this.container.addEventListener('mouseenter', this.dragMouseEnter);

    this.isDraggingEnabled = true;
  }

  addResizeHandlers() {
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.style.cssText = `
      position: absolute;
      bottom: 0;
      right: 0;
      width: 20px;
      height: 20px;
      background: rgba(0, 0, 0, 0.5);
      cursor: nwse-resize;
      z-index: 1000;
      border-radius: 4px 0 ${this.config.cornerRadius}px 0;
      display: none; // Hidden by default, shown only when selected
    `;

    // Add resize icon
    resizeHandle.innerHTML = `
      <svg width="12" height="12" style="position: absolute; bottom: 2px; right: 2px;" viewBox="0 0 12 12">
        <path d="M0,12 L12,0 M6,12 L12,6 M0,6 L6,0" stroke="white" stroke-width="1.5" fill="none"/>
      </svg>
    `;

    this.container.appendChild(resizeHandle);

    let startWidth = 0;
    let startHeight = 0;
    let startX = 0;
    let startY = 0;

    this.resizeMouseDown = (e) => {
      e.preventDefault();
      this.isResizing = true;

      startWidth = this.container.offsetWidth;
      startHeight = this.container.offsetHeight;
      startX = e.clientX;
      startY = e.clientY;

      document.addEventListener('mousemove', this.resizeMouseMove);
      document.addEventListener('mouseup', this.resizeMouseUp);

      this.container.style.zIndex = '9999';
    };

    this.resizeMouseMove = (e) => {
      if (!this.isResizing) return;

      // Calculate the delta (use the larger of x or y delta to maintain 1:1 ratio)
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const delta = Math.max(deltaX, deltaY);

      const newSize = Math.max(120, startWidth + delta);

      this.container.style.width = `${newSize}px`;
      this.container.style.height = `${newSize}px`;

      // Update config
      this.config.width = newSize;
      this.config.height = newSize;
    };

    this.resizeMouseUp = () => {
      this.isResizing = false;
      this.container.style.zIndex = '';
      document.removeEventListener('mousemove', this.resizeMouseMove);
      document.removeEventListener('mouseup', this.resizeMouseUp);
    };

    resizeHandle.addEventListener('mousedown', this.resizeMouseDown);
    this.resizeHandle = resizeHandle; // Store reference
  }

  // Public API methods
  getElement() {
    return this.container;
  }

  destroy() {
    // Emit viewer destruction event
    eventBus.emit(EVENT_NAMES.VIEWER_DESTROYED, {
      id: this.id
    }, { source: 'FaceLooker' });

    // Remove event listeners
    if (this.eventHandlers) {
      window.removeEventListener('mousemove', this.eventHandlers.handleMouseMove);
      window.removeEventListener('touchmove', this.eventHandlers.handleTouchMove);
    }

    // Clean up animation driver subscription
    if (this.cursorMoveSubscription) {
      this.cursorMoveSubscription();
      this.cursorMoveSubscription = null;
    }

    // Clean up all stored event listeners
    for (const cleanupFn of this.eventListeners) {
      cleanupFn();
    }
    this.eventListeners.clear();

    // Remove container from DOM
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    // Clear references
    this.container = null;
    this.faceImage = null;
    this.debugEl = null;
    this.metaData = null;
    this.isActive = false;
  }

  select() {
    debugLog('🎯 select() called for viewer:', this.id);

    // Remove selection from all other viewers and reset their z-index
    document.querySelectorAll('.face-looker-viewer').forEach(el => {
      el.classList.remove('selected');
      el.style.outline = '';
      el.style.boxShadow = '';
      el.style.transform = '';
      // Hide resize handle on other viewers
      const otherResizeHandle = el.querySelector('.resize-handle');
      if (otherResizeHandle) {
        otherResizeHandle.style.display = 'none';
      }
      // Reset z-index to base level
      el.style.zIndex = '1';
    });

    // Bring this viewer to front with highest z-index
    const highestZIndex = this.getHighestZIndex() + 1;
    this.container.style.zIndex = highestZIndex;

    // Select this viewer
    this.container.classList.add('selected');
    this.container.style.outline = '2px solid #6366f1';
    this.container.style.outlineOffset = '2px';
    this.container.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.1)';
    this.container.style.transform = 'translateY(-2px)';

    // Show resize handle when selected
    if (this.resizeHandle) {
      this.resizeHandle.style.display = 'block';
    }

    debugLog(`✅ Viewer #${this.id} selected and brought to front with z-index: ${highestZIndex}`);

    // Trigger selection callback
    if (this.config.onSelect && typeof this.config.onSelect === 'function') {
      debugLog('📞 Calling onSelect callback...');
      try {
        this.config.onSelect(this);
        debugLog('✅ onSelect callback executed successfully');
      } catch (error) {
        console.error('❌ Error in onSelect callback:', error);
      }
    } else {
      debugLog('❌ onSelect callback not available or not a function');
    }

    // Global selection event
    const event = new CustomEvent('viewerSelected', {
      detail: { viewer: this, id: this.id }
    });
    debugLog('📡 Dispatching global event:', event.detail);
    window.dispatchEvent(event);
  }

  deselect() {
    this.container.classList.remove('selected');
    this.container.style.outline = '';
    this.container.style.boxShadow = '';
    this.container.style.transform = '';
    // Hide resize handle when deselected
    if (this.resizeHandle) {
      this.resizeHandle.style.display = 'none';
    }
  }

  getHighestZIndex() {
    const viewers = document.querySelectorAll('.face-looker-viewer');
    let highestZIndex = 1;

    viewers.forEach(viewer => {
      const zIndex = parseInt(window.getComputedStyle(viewer).zIndex) || 1;
      if (zIndex > highestZIndex) {
        highestZIndex = zIndex;
      }
    });

    return highestZIndex;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    // Update container styles if dimensions changed
    if (newConfig.width || newConfig.height || newConfig.cornerRadius) {
      this.container.style.width = `${this.config.width}px`;
      this.container.style.height = `${this.config.height}px`;
      this.container.style.borderRadius = `${this.config.cornerRadius}px`;
    }

    // Update visibility features
    if ('showDebug' in newConfig) {
      if (this.debugEl) {
        this.debugEl.style.display = newConfig.showDebug ? 'block' : 'none';
      }
    }

    if ('showLabel' in newConfig) {
      this.setLabelVisibility(newConfig.showLabel);
    }

    // Handle drag and resize handlers
    if ('draggable' in newConfig) {
      if (newConfig.draggable && !this.isDraggingEnabled) {
        this.addDragHandlers();
        this.isDraggingEnabled = true;
        this.container.style.cursor = 'move';
      } else if (!newConfig.draggable) {
        // Remove drag listeners
        this.container.removeEventListener('mousedown', this.dragMouseDown);
        this.container.removeEventListener('mouseenter', this.dragMouseEnter);
        this.isDraggingEnabled = false;
        this.container.style.cursor = 'default';
      }
    }

    if ('resizable' in newConfig) {
      if (newConfig.resizable && !this.container.querySelector('.resize-handle')) {
        this.addResizeHandlers();
      } else if (!newConfig.resizable) {
        const resizeHandle = this.container.querySelector('.resize-handle');
        if (resizeHandle) resizeHandle.remove();
      }
    }
  }
}