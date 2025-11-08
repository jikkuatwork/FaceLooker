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
    this.previousPosition = { x: 0, y: 0 };
    this.rotation = 0;
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

    try {
      const svgResponse = await fetch('./assets/bee.svg');
      if (svgResponse.ok) {
        const svgText = await svgResponse.text();
        this.element.innerHTML = svgText;

        // Add bee-specific styling and animations
        this.element.style.cssText = `
          position: fixed;
          width: 16px;
          height: 16px;
          z-index: 10000;
          pointer-events: auto;
          cursor: pointer;
          transition: transform 0.05s ease-out;
          transform: translate(-50%, -50%);
        `;

        // Add wing animation and directional rotation
        this.addBeeAnimations();
        this.addCommonInteractions('bee');
        document.body.appendChild(this.element);
        return;
      }
    } catch (error) {
      console.error('Could not load bee.svg:', error);
      throw new Error('Bee SVG not found in assets folder');
    }
  }

  /**
   * Add animations to the SVG bee
   */
  addBeeAnimations() {
    // Add CSS for wing animation
    const beeAnimationStyles = document.createElement('style');
    beeAnimationStyles.id = 'bee-animation-styles';
    beeAnimationStyles.textContent = `
      @keyframes wing-beat {
        0% { transform: scaleX(1) translateY(0) rotateX(0deg); }
        50% { transform: scaleX(0.5) translateY(-1px) rotateX(30deg); }
        100% { transform: scaleX(1) translateY(0) rotateX(0deg); }
      }

      .animation-driver-bee #wings {
        animation: wing-beat 0.1s infinite alternate ease-in-out;
        transform-origin: center;
      }

      .animation-driver-bee.paused #wings {
        animation-play-state: paused;
        opacity: 0.7;
      }

      .animation-driver-bee:hover #wings {
        animation-duration: 0.08s;
      }

      .animation-driver-bee svg {
        width: 100%;
        height: 100%;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
      }

      .animation-driver-bee:hover svg {
        filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
      }

      .animation-driver-bee.paused svg {
        opacity: 0.6;
      }
    `;

    // Only add styles once
    if (!document.getElementById('bee-animation-styles')) {
      document.head.appendChild(beeAnimationStyles);
    }
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

    const trailSize = this.options.visualType === 'bee' ? '6px' : '8px';

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
   * Update the animation position
   */
  updatePosition() {
    // Store previous position for rotation calculation
    this.previousPosition = { ...this.position };
    this.position = this.calculatePosition(this.time);

    // Calculate rotation for bee
    if (this.options.visualType === 'bee') {
      this.calculateRotation();
    }

    if (this.element) {
      this.element.style.left = `${this.position.x}px`;
      this.element.style.top = `${this.position.y}px`;

      // Apply rotation for bee
      if (this.options.visualType === 'bee') {
        const svg = this.element.querySelector('svg');
        if (svg) {
          svg.style.transform = `translate(-50%, -50%) rotate(${this.rotation}deg)`;
        }
      }
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
   * Calculate rotation angle based on movement direction
   */
  calculateRotation() {
    const dx = this.position.x - this.previousPosition.x;
    const dy = this.position.y - this.previousPosition.y;

    // Only rotate if there's meaningful movement
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      // Calculate angle in degrees (atan2 returns radians)
      let angle = Math.atan2(dy, dx) * (180 / Math.PI);

      // Adjust angle to point in the direction of movement
      // Add 90 degrees to make the bee face forward
      // Subtract 45 degrees to account for the SVG's clockwise rotation
      // Fine-tune the adjustment for precise alignment
      this.rotation = angle + 90 - 42;

      // Even more responsive rotation for snappy movement
      if (this.previousRotation !== undefined) {
        // Normalize angles to handle wrap-around
        let angleDiff = this.rotation - this.previousRotation;
        while (angleDiff > 180) angleDiff -= 360;
        while (angleDiff < -180) angleDiff += 360;

        // Much faster rotation (90% responsiveness) for very snappy movement
        this.rotation = this.previousRotation + angleDiff * 0.9;
      }

      this.previousRotation = this.rotation;

      if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.logToConsole) {
        // Debug rotation occasionally (not every frame to avoid spam)
        if (this.time % 500 < 16) {
          console.log(`🐝 Bee rotation: ${this.rotation.toFixed(1)}°, {
            dx: dx.toFixed(2),
            dy: dy.toFixed(2),
            angle: angle.toFixed(1),
            movement: Math.sqrt(dx * dx + dy * dy).toFixed(2)
          }`);
        }
      }
    }
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
    this.previousPosition = { ...this.position };
    this.rotation = 0;
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