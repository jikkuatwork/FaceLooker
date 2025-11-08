/**
 * Animation Driver Module
 * Provides autonomous movement patterns for face tracking
 */

import { APP_CONFIG, DEBUG_CONFIG } from '../config.js';
import { eventBus, EVENT_NAMES } from '../events/EventBus.js';

export class AnimationDriver {
  constructor(options = {}) {
    this.options = {
      speed: options.speed || 1.0,
      pattern: options.pattern || 'circular', // circular, figure8, random, sine
      boundary: options.boundary || 'window', // window, canvas, custom
      bounds: options.bounds || null, // custom boundaries {x, y, width, height}
      enabled: options.enabled !== false,
      visualType: options.visualType || 'dot', // 'dot' or 'bee'
      ...options
    };

    this.isActive = false;
    this.element = null;
    this.animationId = null;
    this.position = { x: 0, y: 0 };
    this.time = 0;
    this.bounds = this.calculateBounds();

    // Movement pattern parameters
    this.centerX = this.bounds.x + this.bounds.width / 2;
    this.centerY = this.bounds.y + this.bounds.height / 2;
    this.radius = Math.min(this.bounds.width, this.bounds.height) * 0.3;

    // Trail effect
    this.trail = [];
    this.maxTrailLength = 5;
  }

  /**
   * Calculate movement boundaries
   * @returns {Object} Boundary object {x, y, width, height}
   */
  calculateBounds() {
    if (this.options.bounds) {
      return this.options.bounds;
    }

    switch (this.options.boundary) {
      case 'canvas':
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
        // Fall through to window if canvas not found

      case 'window':
      default:
        return {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight
        };
    }
  }

  /**
   * Create the animation element (dot or bee)
   */
  async createElement() {
    if (this.element) return;

    if (this.options.visualType === 'bee') {
      await this.createBeeElement();
    } else {
      this.createDotElement();
    }
  }

  /**
   * Create the red dot element
   */
  createDotElement() {
    this.element = document.createElement('div');
    this.element.className = 'animation-driver-dot';
    this.element.style.cssText = `
      position: fixed;
      width: 16px;
      height: 16px;
      background: radial-gradient(circle, #ff4444, #cc0000);
      border-radius: 50%;
      border: 2px solid #ffffff;
      box-shadow: 0 2px 8px rgba(255, 68, 68, 0.5), 0 0 20px rgba(255, 68, 68, 0.3);
      z-index: 10000;
      pointer-events: auto;
      cursor: pointer;
      transition: transform 0.1s ease-out;
      transform: translate(-50%, -50%);
    `;

    this.addCommonInteractions('dot');
    document.body.appendChild(this.element);
  }

  /**
   * Create the bee element
   */
  async createBeeElement() {
    this.element = document.createElement('div');
    this.element.className = 'animation-driver-bee';

    // Try to load SVG bee first, fall back to CSS bee
    try {
      const svgResponse = await fetch('./assets/bee.svg');
      if (svgResponse.ok) {
        const svgText = await svgResponse.text();
        this.element.innerHTML = svgText;
        this.element.style.cssText = `
          position: fixed;
          width: 32px;
          height: 32px;
          z-index: 10000;
          pointer-events: auto;
          cursor: pointer;
          transition: transform 0.1s ease-out;
          transform: translate(-50%, -50%);
        `;
        this.addCommonInteractions('bee');
        document.body.appendChild(this.element);
        return;
      }
    } catch (error) {
      console.log('Could not load bee.svg, using CSS bee');
    }

    // Fall back to CSS bee
    this.element.innerHTML = `
      <div class="bee-body">
        <div class="bee-stripe stripe-1"></div>
        <div class="bee-stripe stripe-2"></div>
        <div class="bee-stripe stripe-3"></div>
        <div class="bee-wing wing-left">
          <div class="wing-animation"></div>
        </div>
        <div class="bee-wing wing-right">
          <div class="wing-animation"></div>
        </div>
        <div class="bee-face">
          <div class="bee-eye eye-left"></div>
          <div class="bee-eye eye-right"></div>
          <div class="bee-smile"></div>
        </div>
      </div>
    `;

    this.element.style.cssText = `
      position: fixed;
      width: 32px;
      height: 32px;
      z-index: 10000;
      pointer-events: auto;
      cursor: pointer;
      transition: transform 0.1s ease-out;
      transform: translate(-50%, -50%);
    `;

    this.addBeeStyles();
    this.addCommonInteractions('bee');
    document.body.appendChild(this.element);
  }

  /**
   * Add bee CSS styles
   */
  addBeeStyles() {
    if (document.getElementById('bee-styles')) return;

    const beeStyles = document.createElement('style');
    beeStyles.id = 'bee-styles';
    beeStyles.textContent = `
      .bee-body {
        position: relative;
        width: 32px;
        height: 28px;
        background: linear-gradient(135deg, #FFD700, #FFA500);
        border-radius: 50% 50% 40% 40%;
        box-shadow: 0 3px 10px rgba(255, 215, 0, 0.4), 0 0 20px rgba(255, 215, 0, 0.2);
        overflow: hidden;
      }

      .bee-stripe {
        position: absolute;
        width: 100%;
        height: 3px;
        background: #2C2C2C;
        left: 0;
      }

      .stripe-1 { top: 8px; }
      .stripe-2 { top: 14px; }
      .stripe-3 { top: 20px; }

      .bee-wing {
        position: absolute;
        top: -2px;
        width: 12px;
        height: 16px;
        background: rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.9);
      }

      .wing-left {
        left: -6px;
        transform-origin: right center;
      }

      .wing-right {
        right: -6px;
        transform-origin: left center;
      }

      .wing-animation {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.6));
        border-radius: 50%;
        animation: flutter 0.15s infinite alternate;
      }

      @keyframes flutter {
        0% { transform: scaleX(1) translateY(0); }
        100% { transform: scaleX(0.7) translateY(-2px); }
      }

      .bee-face {
        position: absolute;
        bottom: 4px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 6px;
        align-items: center;
      }

      .bee-eye {
        width: 3px;
        height: 3px;
        background: #2C2C2C;
        border-radius: 50%;
        position: relative;
      }

      .bee-eye::after {
        content: '';
        position: absolute;
        width: 1px;
        height: 1px;
        background: white;
        border-radius: 50%;
        top: 0;
        left: 0;
      }

      .bee-smile {
        width: 8px;
        height: 2px;
        background: #2C2C2C;
        border-radius: 0 0 50% 50%;
      }

      .animation-driver-bee:hover .bee-body {
        transform: scale(1.1);
        box-shadow: 0 4px 15px rgba(255, 215, 0, 0.6), 0 0 30px rgba(255, 215, 0, 0.4);
      }

      .animation-driver-bee.paused .wing-animation {
        animation-play-state: paused;
      }

      .animation-driver-bee.paused .bee-body {
        opacity: 0.6;
      }
    `;
    document.head.appendChild(beeStyles);
  }

  /**
   * Add common interactions for both dot and bee
   */
  addCommonInteractions(type) {
    const hoverScale = type === 'bee' ? 'scale(1.1)' : 'scale(1.2)';

    // Add hover effect
    this.element.addEventListener('mouseenter', () => {
      this.element.style.transform = `translate(-50%, -50%) ${hoverScale}`;
    });

    this.element.addEventListener('mouseleave', () => {
      this.element.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    // Click to pause/resume
    this.element.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isActive) {
        this.pause();
      } else {
        this.start();
      }
    });
  }

  /**
   * Remove the red dot element
   */
  removeElement() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
      this.element = null;
    }
    this.clearTrail();
  }

  /**
   * Create trail effect
   */
  createTrail() {
    const trailDot = document.createElement('div');

    const trailColor = this.options.visualType === 'bee'
      ? 'rgba(255, 215, 0, 0.4)'  // Gold trail for bee
      : 'rgba(255, 68, 68, 0.3)'; // Red trail for dot

    const trailSize = this.options.visualType === 'bee' ? '12px' : '8px';

    trailDot.style.cssText = `
      position: fixed;
      width: ${trailSize};
      height: ${trailSize};
      background: ${trailColor};
      border-radius: 50%;
      z-index: 9999;
      pointer-events: none;
      transform: translate(-50%, -50%);
    `;
    trailDot.style.left = `${this.position.x}px`;
    trailDot.style.top = `${this.position.y}px`;

    document.body.appendChild(trailDot);
    this.trail.push(trailDot);

    // Fade out and remove old trail dots
    if (this.trail.length > this.maxTrailLength) {
      const oldTrail = this.trail.shift();
      oldTrail.style.opacity = '0';
      oldTrail.style.transition = 'opacity 0.5s ease-out';
      setTimeout(() => {
        if (oldTrail.parentNode) {
          oldTrail.parentNode.removeChild(oldTrail);
        }
      }, 500);
    }
  }

  /**
   * Clear all trail dots
   */
  clearTrail() {
    this.trail.forEach(dot => {
      if (dot.parentNode) {
        dot.parentNode.removeChild(dot);
      }
    });
    this.trail = [];
  }

  /**
   * Calculate position based on movement pattern
   * @param {number} time - Current animation time
   * @returns {Object} Position {x, y}
   */
  calculatePosition(time) {
    const speed = this.options.speed;
    let x, y;

    switch (this.options.pattern) {
      case 'circular':
        x = this.centerX + Math.cos(time * speed * 0.001) * this.radius;
        y = this.centerY + Math.sin(time * speed * 0.001) * this.radius;
        break;

      case 'figure8':
        x = this.centerX + Math.sin(time * speed * 0.001) * this.radius;
        y = this.centerY + Math.sin(time * speed * 0.002) * this.radius * 0.6;
        break;

      case 'sine':
        x = this.bounds.x + (time * speed * 0.05) % this.bounds.width;
        y = this.centerY + Math.sin(x * 0.01) * this.radius * 0.5;
        break;

      case 'random':
        if (Math.random() < 0.02) { // Change direction occasionally
          this.targetX = this.bounds.x + Math.random() * this.bounds.width;
          this.targetY = this.bounds.y + Math.random() * this.bounds.height;
        }

        if (!this.targetX) {
          this.targetX = this.centerX;
          this.targetY = this.centerY;
        }

        // Smooth interpolation to target
        x = this.position.x + (this.targetX - this.position.x) * 0.05;
        y = this.position.y + (this.targetY - this.position.y) * 0.05;
        break;

      default:
        x = this.centerX;
        y = this.centerY;
    }

    // Keep within bounds
    x = Math.max(this.bounds.x, Math.min(this.bounds.x + this.bounds.width, x));
    y = Math.max(this.bounds.y, Math.min(this.bounds.y + this.bounds.height, y));

    return { x, y };
  }

  /**
   * Update the dot position
   */
  updatePosition() {
    this.position = this.calculatePosition(this.time);

    if (this.element) {
      this.element.style.left = `${this.position.x}px`;
      this.element.style.top = `${this.position.y}px`;
    }

    // Create trail effect
    if (this.time % 100 < 16) { // Every ~100ms
      this.createTrail();
    }

    // Emit position event for face tracking
    eventBus.emit(EVENT_NAMES.CURSOR_MOVED, {
      x: this.position.x,
      y: this.position.y,
      source: 'animation-driver'
    }, { source: 'AnimationDriver' });
  }

  /**
   * Animation loop
   */
  animate() {
    if (!this.isActive) return;

    this.time += 16; // ~60fps
    this.updatePosition();

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  /**
   * Start the animation
   */
  async start() {
    if (this.isActive) return;

    if (!this.element) {
      await this.createElement();
    }

    this.isActive = true;
    this.time = 0;

    // Set initial position
    this.position = {
      x: this.centerX,
      y: this.centerY
    };
    this.updatePosition();

    this.animate();

    // Emit start event
    eventBus.emit('animation-driver:started', {
      pattern: this.options.pattern,
      speed: this.options.speed
    }, { source: 'AnimationDriver' });

    if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.logToConsole) {
      console.log('🔴 Animation driver started:', this.options.pattern);
    }
  }

  /**
   * Pause the animation
   */
  pause() {
    this.isActive = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Visual indicator for paused state
    if (this.element) {
      if (this.options.visualType === 'bee') {
        this.element.classList.add('paused');
      } else {
        this.element.style.opacity = '0.5';
        this.element.style.animation = 'pulse 2s infinite';
      }
    }

    // Emit pause event
    eventBus.emit('animation-driver:paused', {}, { source: 'AnimationDriver' });

    if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.logToConsole) {
      console.log('⏸️ Animation driver paused');
    }
  }

  /**
   * Resume the animation
   */
  resume() {
    if (!this.isActive) {
      this.isActive = true;

      if (this.element) {
        if (this.options.visualType === 'bee') {
          this.element.classList.remove('paused');
        } else {
          this.element.style.opacity = '1';
          this.element.style.animation = '';
        }
      }

      this.animate();

      // Emit resume event
      eventBus.emit('animation-driver:resumed', {}, { source: 'AnimationDriver' });

      if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.logToConsole) {
        console.log('▶️ Animation driver resumed');
      }
    }
  }

  /**
   * Stop and cleanup the animation
   */
  stop() {
    this.isActive = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.removeElement();
    this.clearTrail();

    // Emit stop event
    eventBus.emit('animation-driver:stopped', {}, { source: 'AnimationDriver' });

    if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.logToConsole) {
      console.log('🛑 Animation driver stopped');
    }
  }

  /**
   * Update configuration
   * @param {Object} newOptions - New configuration options
   */
  updateOptions(newOptions) {
    const oldVisualType = this.options.visualType;
    const wasActive = this.isActive;

    this.options = { ...this.options, ...newOptions };

    // Handle visual type change
    if (newOptions.visualType && newOptions.visualType !== oldVisualType) {
      if (this.element) {
        // Remove old element
        this.removeElement();
        // Create new element with new visual type (async)
        this.createElement();
      }
    }

    // Recalculate bounds if needed
    if (newOptions.boundary || newOptions.bounds) {
      this.bounds = this.calculateBounds();
      this.centerX = this.bounds.x + this.bounds.width / 2;
      this.centerY = this.bounds.y + this.bounds.height / 2;
      this.radius = Math.min(this.bounds.width, this.bounds.height) * 0.3;
    }

    // Emit configuration change event
    eventBus.emit('animation-driver:config-changed', this.options, { source: 'AnimationDriver' });
  }

  /**
   * Switch visual type (dot/bee)
   * @param {string} visualType - 'dot' or 'bee'
   */
  switchVisualType(visualType) {
    if (visualType !== this.options.visualType) {
      this.updateOptions({ visualType });

      if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.logToConsole) {
        console.log(`🔄 Switched to ${visualType} animation`);
      }
    }
  }

  /**
   * Get current position
   * @returns {Object} Current position {x, y}
   */
  getPosition() {
    return { ...this.position };
  }

  /**
   * Get current configuration
   * @returns {Object} Current options
   */
  getOptions() {
    return { ...this.options };
  }

  /**
   * Check if animation is active
   * @returns {boolean} Animation state
   */
  isRunning() {
    return this.isActive;
  }
}

// Add pulse animation for paused state
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 0.8; }
  }
`;
document.head.appendChild(style);

// Export singleton instance
export const animationDriver = new AnimationDriver();