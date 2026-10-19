// FaceLooker Service Worker
// Caches static assets for offline functionality

// Debug configuration - set to false for production
const DEBUG_MODE = false;

// Debug logging function
function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

const CACHE_NAME = 'facelooker-v2';
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/FaceLooker.js'
];

// Dynamic cache for face images
const FACE_CACHE_NAME = 'facelooker-faces-v1';

// Install service worker
self.addEventListener('install', (event) => {
  debugLog('FaceLooker Service Worker installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        debugLog('Caching static assets...');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        debugLog('FaceLooker Service Worker installed');
        self.skipWaiting();
      })
  );
});

// Activate service worker
self.addEventListener('activate', (event) => {
  debugLog('FaceLooker Service Worker activating...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            debugLog('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
      .then(() => {
        debugLog('FaceLooker Service Worker activated');
      })
  );
});

// Fetch event - handle network requests
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url, self.location.origin);

  // Handle different request types
  if (request.method === 'GET') {
    // Try to serve from cache first
    event.respondWith(
      caches.match(request)
        .then((response) => {
          // Return cached response if found
          if (response) {
            debugLog('Serving from cache:', url.pathname);
            return response;
          }

          // For face images, try network then cache
          if (url.pathname.startsWith('/faces/') && url.pathname.includes('.webp')) {
            return fetchAndCacheFaceImage(request);
          }

          // For other requests, try network then cache
          return fetchAndCache(request);
        })
        .catch((error) => {
          console.error('Fetch failed:', error);
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        })
    );
  }
});

// Fetch and cache face images with proper error handling
function fetchAndCacheFaceImage(request) {
  return fetch(request.clone())
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Clone the response before using it for caching
      const responseToCache = response.clone();

      // Cache the face image
      caches.open(FACE_CACHE_NAME)
        .then((cache) => cache.put(request, responseToCache))
        .catch((error) => {
          console.warn('Failed to cache face image:', error);
        });

      return response;
    })
    .catch((error) => {
      console.error('Failed to fetch face image:', error);
      return new Response('Image loading failed', {
        status: 500,
        statusText: 'Internal Server Error'
      });
    });
}

// Fetch and cache regular requests
function fetchAndCache(request) {
  return fetch(request.clone())
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Cache successful responses
      if (response.type === 'basic' || response.type === 'cors') {
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(request, response.clone()))
          .catch((error) => {
            console.warn('Failed to cache asset:', error);
          });
      }

      return response;
    })
    .catch((error) => {
      console.error('Fetch failed:', error);
      throw error;
    });
}

// Handle message events from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});