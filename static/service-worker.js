const CACHE_NAME = 'schedule-planner-v6';
const STATIC_ASSETS = [
    '/',
    '/static/css/base.css',
    '/static/css/layout.css',
    '/static/css/schedule.css',
    '/static/css/timer.css',
    '/static/css/stats.css',
    '/static/css/components.css',
    '/static/css/user.css',
    '/static/js/app.js',
    '/static/js/auth.js',
    '/static/js/user.js',
    '/static/js/constants.js',
    '/static/js/helpers.js',
    '/static/js/planner.js',
    '/static/js/timer.js',
    '/static/js/stats.js',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    if (url.pathname.startsWith('/api/')) return;

    if (url.pathname.startsWith('/static/')) {
        event.respondWith(
            caches.match(request).then(cached => cached || fetch(request).then(resp => {
                if (resp.ok) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(request, clone));
                }
                return resp;
            }))
        );
        return;
    }

    event.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});
