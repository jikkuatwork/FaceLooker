/**
 * FaceLookerViewer - Interactive face tracking module
 * A modern ES6 module for displaying interactive faces that follow cursor movement
 */

export class FaceLookerViewer {
  constructor(options = {}) {
    // Configuration
    this.config = {
      faces: options.faces || './faces/01/',
      width: options.width || 360,
      height: options.height || 360,
      cornerRadius: options.cornerRadius || 8,
      downloadImagesAutomatically: options.downloadImagesAutomatically || false,
      showDebug: options.showDebug || false,
      enableProgress: options.enableProgress !== false,
      showLabel: options.showLabel || false,
      draggable: options.draggable || false,
      resizable: options.resizable || false,

      // Callbacks
      onLoad: options.onLoad || (() => {}),
      onError: options.onError || (() => {}),
      onProgress: options.onProgress || (() => {}),
      onImageLoad: options.onImageLoad || (() => {}),
      onReady: options.onReady || (() => {})
    };

    // Grid configuration
    this.P_MIN = -15;
    this.P_MAX = 15;
    this.STEP = 3;
    this.SIZE = 256;

    // State
    this.imageCache = new Map();
    this.metaData = null;
    this.isActive = false;
    this.container = null;
    this.faceImage = null;
    this.debugEl = null;
    this.isDragging = false;
    this.isResizing = false;
    this.dragStart = { x: 0, y: 0 };
    this.containerStart = { x: 0, y: 0 };
    this.sizeStart = { width: 0, height: 0 };

    // Progress elements
    this.progressContainer = null;
    this.progressBar = null;
    this.progressText = null;
    this.previewImage = null;
    this.mainContent = null;

    this.init();
  }

  init() {
    this.createContainer();
    this.loadMetaData();
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
      cursor: default;
    `;

    // Add selection capability
    this.container.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('🖱️ Viewer clicked, ID:', this.id);
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
      object-fit: contain;
      transition: opacity 0.1s ease-out;
    `;

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
      background: #fafafa;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      transition: opacity 0.3s ease-out;
    `;

    // Preview image
    this.previewImage = document.createElement('img');
    this.previewImage.className = 'face-preview';
    this.previewImage.alt = 'Loading face...';
    this.previewImage.style.cssText = `
      width: ${this.config.width}px;
      height: ${this.config.height}px;
      border-radius: ${this.config.cornerRadius}px;
      margin-bottom: 32px;
      background: #f0f0f0;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      object-fit: contain;
    `;

    // Progress bar
    const progressWrapper = document.createElement('div');
    progressWrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    `;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      width: 280px;
      height: 4px;
      background: #e5e7eb;
      border-radius: 2px;
      overflow: hidden;
    `;

    this.progressBar = document.createElement('div');
    this.progressBar.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #8b5cf6);
      width: 0%;
      transition: width 0.3s ease-out;
      border-radius: 2px;
    `;

    this.progressText = document.createElement('div');
    this.progressText.style.cssText = `
      font-family: ui-sans-serif, system-ui, Arial, sans-serif;
      font-size: 14px;
      color: #6b7280;
      text-align: center;
    `;
    this.progressText.textContent = 'Loading face images...';

    progressBar.appendChild(this.progressBar);
    progressWrapper.appendChild(progressBar);
    progressWrapper.appendChild(this.progressText);

    this.progressContainer.appendChild(this.previewImage);
    this.progressContainer.appendChild(progressWrapper);
    this.container.appendChild(this.progressContainer);
  }

  createMainContent() {
    this.mainContent = document.createElement('div');
    this.mainContent.className = 'face-looker-main';
    this.mainContent.style.cssText = `
      opacity: 0;
      transition: opacity 0.3s ease-in;
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
      width: 100%;
      height: 100%;
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
      const metaUrl = `${this.config.faces}meta.json`;
      const response = await fetch(metaUrl);

      if (response.ok) {
        this.metaData = await response.json();
        this.updateMetaDisplay();
      }
    } catch (error) {
      console.log('No meta.json found or error loading metadata:', error);
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

    return new Promise((resolve) => {
      filenames.forEach(async (filename) => {
        try {
          if (this.config.downloadImagesAutomatically) {
            // Download and cache as blob
            const response = await fetch(`${this.config.faces}${filename}`);
            if (response.ok) {
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              const img = new Image();
              img.src = url;
              this.imageCache.set(filename, { img, url, blob });
            }
          } else {
            // Just preload as regular image
            const img = new Image();
            img.src = `${this.config.faces}${filename}`;
            await new Promise((resolveImg, rejectImg) => {
              img.onload = resolveImg;
              img.onerror = rejectImg;
            });
            this.imageCache.set(filename, { img, url: img.src });
          }

          this.config.onImageLoad(filename, loadedCount + 1, totalImages);
        } catch (error) {
          console.warn(`Failed to load image: ${filename}`, error);
        }

        loadedCount++;
        const progress = (loadedCount / totalImages) * 100;

        // Update progress UI
        if (this.progressBar) {
          this.progressBar.style.width = `${progress}%`;
        }
        if (this.progressText) {
          this.progressText.textContent = `Loading face images... ${loadedCount}/${totalImages}`;
        }

        // Trigger progress callback
        this.config.onProgress(progress, loadedCount, totalImages);

        // Check if all images are loaded
        if (loadedCount === totalImages) {
          this.config.onLoad(this.imageCache, this.metaData);
          this.activate();
          resolve();
        }
      });
    });
  }

  activate() {
    this.isActive = true;

    // Show ready state
    if (this.progressText) {
      this.progressText.textContent = 'Ready!';
    }

    // Hide progress and show main content with smooth transition
    setTimeout(() => {
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
    }, 300);
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

  updateFromClient(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const nx = (clientX - centerX) / (rect.width / 2);
    const ny = (centerY - clientY) / (rect.height / 2);

    const clampedX = this.clamp(nx, -1, 1);
    const clampedY = this.clamp(ny, -1, 1);

    const px = this.quantizeToGrid(clampedX);
    const py = this.quantizeToGrid(clampedY);

    const filename = this.gridToFilename(px, py);
    const cachedImage = this.imageCache.get(filename);

    if (cachedImage && this.faceImage) {
      this.faceImage.src = cachedImage.url;
    }

    // Update debug info
    if (this.debugEl) {
      this.debugEl.innerHTML = `Mouse: (${Math.round(clientX - rect.left)}, ${Math.round(clientY - rect.top)})<br/>Image: ${filename}`;
    }
  }

  addDragHandlers() {
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.style.cssText = `
      position: absolute;
      top: 8px;
      left: 8px;
      width: 20px;
      height: 20px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 4px;
      cursor: move;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Update container cursor on drag handle hover
    dragHandle.addEventListener('mouseenter', () => {
      this.container.style.cursor = 'move';
    });

    dragHandle.addEventListener('mouseleave', () => {
      this.container.style.cursor = 'default';
    });

    // Add drag icon dots
    dragHandle.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
        <div style="width: 3px; height: 3px; background: white; border-radius: 50%;"></div>
        <div style="width: 3px; height: 3px; background: white; border-radius: 50%;"></div>
        <div style="width: 3px; height: 3px; background: white; border-radius: 50%;"></div>
        <div style="width: 3px; height: 3px; background: white; border-radius: 50%;"></div>
      </div>
    `;

    this.container.appendChild(dragHandle);

    let offsetX = 0;
    let offsetY = 0;

    const handleMouseDown = (e) => {
      e.preventDefault();
      this.isDragging = true;

      const rect = this.container.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      this.container.style.zIndex = '9999';
    };

    const handleMouseMove = (e) => {
      if (!this.isDragging) return;

      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;

      this.container.style.position = 'fixed';
      this.container.style.left = `${x}px`;
      this.container.style.top = `${y}px`;
    };

    const handleMouseUp = () => {
      this.isDragging = false;
      this.container.style.zIndex = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    dragHandle.addEventListener('mousedown', handleMouseDown);
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

    const handleMouseDown = (e) => {
      e.preventDefault();
      this.isResizing = true;

      startWidth = this.container.offsetWidth;
      startHeight = this.container.offsetHeight;
      startX = e.clientX;
      startY = e.clientY;

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      this.container.style.zIndex = '9999';
    };

    const handleMouseMove = (e) => {
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

    const handleMouseUp = () => {
      this.isResizing = false;
      this.container.style.zIndex = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    resizeHandle.addEventListener('mousedown', handleMouseDown);
  }

  // Public API methods
  getElement() {
    return this.container;
  }

  destroy() {
    // Remove event listeners
    if (this.eventHandlers) {
      window.removeEventListener('mousemove', this.eventHandlers.handleMouseMove);
      window.removeEventListener('touchmove', this.eventHandlers.handleTouchMove);
    }

    // Clean up blob URLs if using download mode
    if (this.config.downloadImagesAutomatically) {
      this.imageCache.forEach(({ url }) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    }

    // Remove container from DOM
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  select() {
    console.log('🎯 select() called for viewer:', this.id);
    console.log('🔧 Config object:', this.config);
    console.log('📞 onSelect exists:', !!this.config.onSelect);
    console.log('📞 onSelect type:', typeof this.config.onSelect);

    // Remove selection from all other viewers
    document.querySelectorAll('.face-looker-viewer').forEach(el => {
      el.classList.remove('selected');
      el.style.outline = '';
    });

    // Select this viewer
    this.container.classList.add('selected');
    this.container.style.outline = '2px solid #6366f1';
    this.container.style.outlineOffset = '2px';

    console.log('✅ Viewer selected, triggering callbacks...');

    // Trigger selection callback
    if (this.config.onSelect && typeof this.config.onSelect === 'function') {
      console.log('📞 Calling onSelect callback...');
      try {
        this.config.onSelect(this);
        console.log('✅ onSelect callback executed successfully');
      } catch (error) {
        console.error('❌ Error in onSelect callback:', error);
      }
    } else {
      console.log('❌ onSelect callback not available or not a function');
    }

    // Global selection event
    const event = new CustomEvent('viewerSelected', {
      detail: { viewer: this, id: this.id }
    });
    console.log('📡 Dispatching global event:', event.detail);
    window.dispatchEvent(event);
  }

  deselect() {
    this.container.classList.remove('selected');
    this.container.style.outline = '';
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
      if (newConfig.draggable && !this.container.querySelector('.drag-handle')) {
        this.addDragHandlers();
      } else if (!newConfig.draggable) {
        const dragHandle = this.container.querySelector('.drag-handle');
        if (dragHandle) dragHandle.remove();
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