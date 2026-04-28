/**
 * Fitness Field Notes - Service Worker
 *
 * Primary purpose: keep the PWA "engaged" on iOS so Safari's Intelligent
 * Tracking Prevention does not evict IndexedDB after 7 days of inactivity
 * (which silently signs users out of Firebase Auth).
 *
 * This is intentionally minimal — no offline caching of app shell or API
 * responses. Auth pages, Firebase SDK CDN, and API calls all pass straight
 * through to the network.
 */

const SW_VERSION = 'ffn-sw-v1';

self.addEventListener('install', (event) => {
    // Activate immediately on first install / version bump
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Take control of all open clients without requiring a reload
    event.waitUntil(self.clients.claim());
});

// Network-first passthrough. Having a fetch handler is what makes the page
// "controlled" by the service worker, which is the signal iOS uses to count
// the PWA as actively engaged.
self.addEventListener('fetch', (event) => {
    // Only handle GET requests; let everything else fall through to the network
    if (event.request.method !== 'GET') return;

    // Don't intercept Firebase Auth, Firestore, or our own API — these need
    // direct network access for token refresh and real-time data
    const url = new URL(event.request.url);
    const isAuthOrApi =
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('gstatic.com') ||
        url.pathname.startsWith('/api/');
    if (isAuthOrApi) return;

    event.respondWith(fetch(event.request).catch(() => Response.error()));
});
