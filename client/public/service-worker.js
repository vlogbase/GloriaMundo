const CACHE_NAME = 'gloriamundo-cache-v2';
const RUNTIME_CACHE = 'gloriamundo-runtime-v2';
const FONT_CACHE = 'gloriamundo-fonts-v2';
const IMAGE_CACHE = 'gloriamundo-images-v2';
const STATIC_CACHE = 'gloriamundo-static-v2';

// Critical assets to cache on install for faster initial load
const PRECACHE_CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-icons/gm-logo.png',
];

// Additional assets to cache after initial load
const PRECACHE_ADDITIONAL_ASSETS = [
  '/pwa-icons/icon-512x512.png',
  '/pwa-icons/icon-192x192.png',
];

// Function to determine appropriate cache based on URL
function getCacheForRequest(url) {
  const urlObj = new URL(url);
  
  // Cache fonts separately with a longer expiration
  if (
    urlObj.hostname.includes('fonts.googleapis.com') || 
    urlObj.hostname.includes('fonts.gstatic.com')
  ) {
    return FONT_CACHE;
  }
  
  // Cache images separately
  if (/\.(jpe?g|png|gif|svg|webp|avif)$/i.test(urlObj.pathname)) {
    return IMAGE_CACHE;
  }
  
  // Cache static assets like JS, CSS
  if (/\.(js|css)$/i.test(urlObj.pathname)) {
    return STATIC_CACHE;
  }
  
  // Default runtime cache for other resources
  return RUNTIME_CACHE;
}

// Install event - precache critical assets immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching critical assets');
        return cache.addAll(PRECACHE_CRITICAL_ASSETS);
      })
      .then(() => self.skipWaiting())
      .then(() => {
        // Cache additional assets in the background after installation
        setTimeout(() => {
          caches.open(CACHE_NAME)
            .then((cache) => {
              console.log('Caching additional assets');
              return cache.addAll(PRECACHE_ADDITIONAL_ASSETS);
            });
        }, 1000);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const currentCaches = [
    CACHE_NAME, 
    RUNTIME_CACHE, 
    FONT_CACHE, 
    IMAGE_CACHE, 
    STATIC_CACHE
  ];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return cacheNames.filter((cacheName) => !currentCaches.includes(cacheName));
    }).then((cachesToDelete) => {
      return Promise.all(cachesToDelete.map((cacheToDelete) => {
        console.log('Deleting old cache:', cacheToDelete);
        return caches.delete(cacheToDelete);
      }));
    }).then(() => self.clients.claim())
  );
});

// Helper function to determine optimal caching strategy based on resource type
function shouldUseCacheFirst(url) {
  const urlObj = new URL(url);
  
  // Use cache-first for fonts and static images that rarely change
  if (
    urlObj.hostname.includes('fonts.googleapis.com') || 
    urlObj.hostname.includes('fonts.gstatic.com') ||
    urlObj.pathname.includes('/pwa-icons/')
  ) {
    return true;
  }
  
  return false;
}

// Fetch event with optimized caching strategies
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and API requests
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/api/') || 
    event.request.url.includes('chrome-extension')
  ) {
    return;
  }

  const url = new URL(event.request.url);
  
  // Choose a caching strategy based on the resource
  if (shouldUseCacheFirst(event.request.url)) {
    // Cache-first strategy for stable resources like fonts and icons
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached response immediately
            return cachedResponse;
          }
          
          // If not cached, fetch from network
          return fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                // Cache the fetched resource
                const cacheName = getCacheForRequest(event.request.url);
                const responseToCache = networkResponse.clone();
                
                caches.open(cacheName)
                  .then((cache) => {
                    cache.put(event.request, responseToCache);
                  });
              }
              
              return networkResponse;
            });
        })
    );
  } else {
    // Network-first with fallback to cache for most resources
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // If the response is valid, clone it and store it in the cache
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const cacheName = getCacheForRequest(event.request.url);
            const responseToCache = networkResponse.clone();
            
            caches.open(cacheName)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
          }
          
          return networkResponse;
        })
        .catch(() => {
          // If the network is unavailable, try to serve from cache
          return caches.match(event.request);
        })
    );
  }
});

// Handle messages from clients with proper response
self.addEventListener('message', (event) => {
  // Ensure we have a MessagePort to respond to
  const replyPort = event.ports && event.ports[0];
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    
    // Send a response if there's a port to reply to
    if (replyPort) {
      replyPort.postMessage({ success: true, message: 'Skip waiting successful' });
    }
  } else if (event.data && event.data.type) {
    console.log('Service worker received message:', event.data.type);
    
    // Always respond even to unknown messages to prevent "message port closed" errors
    if (replyPort) {
      replyPort.postMessage({ 
        success: false, 
        message: `Unknown command: ${event.data.type}` 
      });
    }
  }
});

// Periodically clean up old image cache entries to prevent excessive storage usage
// Run once per day
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'cache-cleanup') {
    event.waitUntil(cleanupOldCaches());
  }
});

// Manually trigger cache cleanup occasionally
setInterval(() => {
  cleanupOldCaches();
}, 86400000); // 24 hours

// Function to remove old entries from image and runtime caches
async function cleanupOldCaches() {
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds
  const now = Date.now();
  
  // Cleanup dynamic caches but leave static caches alone
  const cachesToClean = [RUNTIME_CACHE, IMAGE_CACHE];
  
  for (const cacheName of cachesToClean) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      
      if (response) {
        const headers = response.headers;
        const dateHeader = headers.get('date');
        
        if (dateHeader) {
          const date = new Date(dateHeader).getTime();
          
          // Remove entries older than a week
          if (now - date > ONE_WEEK) {
            await cache.delete(request);
          }
        }
      }
    }
  }
}