// Grid configuration (must match your generated images)
const P_MIN = -15;
const P_MAX = 15;
const STEP = 3;
const SIZE = 256;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function quantizeToGrid(val) {
  const raw = P_MIN + (val + 1) * (P_MAX - P_MIN) / 2; // [-1,1] -> [-15,15]
  const snapped = Math.round(raw / STEP) * STEP;
  return clamp(snapped, P_MIN, P_MAX);
}

function sanitize(val) {
  const str = Number(val).toFixed(1); // force one decimal, e.g. 0 -> 0.0
  return str.replace('-', 'm').replace('.', 'p');
}

function gridToFilename(px, py) {
  return `gaze_px${sanitize(px)}_py${sanitize(py)}_${SIZE}.webp`;
}

function updateDebug(debugEl, x, y, filename) {
  if (!debugEl) return;
  debugEl.innerHTML = `Mouse: (${Math.round(x)}, ${Math.round(y)})<br/>Image: ${filename}`;
}

function generateImageFilenames() {
  const filenames = [];
  for (let px = P_MIN; px <= P_MAX; px += STEP) {
    for (let py = P_MIN; py <= P_MAX; py += STEP) {
      filenames.push(gridToFilename(px, py));
    }
  }
  return filenames;
}

function preloadImages(basePath, filenames, onProgress, onComplete) {
  const totalImages = filenames.length;
  let loadedCount = 0;

  const imageCache = new Map();

  // Start loading all images
  filenames.forEach(filename => {
    const img = new Image();
    img.onload = () => {
      loadedCount++;
      imageCache.set(filename, img);

      // Update progress
      const progress = (loadedCount / totalImages) * 100;
      onProgress(progress, loadedCount, totalImages);

      // Check if all images are loaded
      if (loadedCount === totalImages) {
        onComplete(imageCache);
      }
    };

    img.onerror = () => {
      loadedCount++;
      const progress = (loadedCount / totalImages) * 100;
      onProgress(progress, loadedCount, totalImages);

      if (loadedCount === totalImages) {
        onComplete(imageCache);
      }
    };

    img.src = basePath + filename;
  });
}

function initializeFaceTracker(container) {
  const basePath = container.dataset.basePath || '/faces/';
  const showDebug = String(container.dataset.debug || 'false') === 'true';

  const img = document.createElement('img');
  img.className = 'face-image';
  img.alt = 'Face following gaze';
  container.appendChild(img);

  let debugEl = null;
  if (showDebug) {
    debugEl = document.createElement('div');
    debugEl.className = 'face-debug';
    container.appendChild(debugEl);
  }

  let imageCache = null;

  function setImageCache(cache) {
    imageCache = cache;
  }

  function setFromClient(clientX, clientY) {
    if (!imageCache) return; // Don't work until images are loaded

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const nx = (clientX - centerX) / (rect.width / 2);
    const ny = (centerY - clientY) / (rect.height / 2);

    const clampedX = clamp(nx, -1, 1);
    const clampedY = clamp(ny, -1, 1);

    const px = quantizeToGrid(clampedX);
    const py = quantizeToGrid(clampedY);

    const filename = gridToFilename(px, py);
    const cachedImg = imageCache.get(filename);

    if (cachedImg) {
      img.src = cachedImg.src;
    } else {
      // Fallback to direct loading if not in cache
      img.src = `${basePath}${filename}`;
    }

    updateDebug(debugEl, clientX - rect.left, clientY - rect.top, filename);
  }

  function handleMouseMove(e) {
    setFromClient(e.clientX, e.clientY);
  }

  function handleTouchMove(e) {
    if (e.touches && e.touches.length > 0) {
      const t = e.touches[0];
      setFromClient(t.clientX, t.clientY);
    }
  }

  function startTracker() {
    // Add event listeners only after loading is complete
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    // Initialize at center
    const rect = container.getBoundingClientRect();
    setFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  return { startTracker, setImageCache };
}

document.addEventListener('DOMContentLoaded', () => {
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const previewImage = document.getElementById('previewImage');
  const mainContent = document.getElementById('mainContent');
  const faceTracker = document.getElementById('face');

  const basePath = faceTracker.dataset.basePath || '/faces/';

  // Show center image as preview
  const centerFilename = gridToFilename(0, 0);
  previewImage.src = basePath + centerFilename;

  // Generate all required image filenames
  const imageFilenames = generateImageFilenames();

  // Start preloading images
  preloadImages(
    basePath,
    imageFilenames,
    (progress, loaded, total) => {
      // Update progress bar
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `Loading face images... ${loaded}/${total}`;
    },
    (imageCache) => {
      // All images loaded, activate the application
      progressText.textContent = 'Ready!';

      // Hide progress screen and show main content
      setTimeout(() => {
        progressContainer.classList.add('hidden');
        mainContent.classList.add('active');

        // Initialize face tracker with cached images
        const tracker = initializeFaceTracker(faceTracker);
        tracker.setImageCache(imageCache);
        tracker.startTracker();
      }, 300);
    }
  );
});
