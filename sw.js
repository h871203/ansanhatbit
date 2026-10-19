// 앱 화면은 오프라인에서도 열리도록 저장하고, 교회 데이터(data/*.json)는 항상 새로 받아 옵니다.
var CACHE = 'hatbit-v8';
var SHELL = [
    './', 'index.html', 'css/app.css', 'js/bible.js', 'js/app.js', 'manifest.webmanifest',
    'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
    'data/church.json', 'data/sermons.json', 'data/qt.json', 'data/prayers.json', 'data/news.json',
    'data/audio-kjv.json'
];

self.addEventListener('install', function (e) {
    e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
    var url = new URL(e.request.url);
    if (e.request.method !== 'GET' || url.origin !== location.origin) return;

    // 네트워크 우선, 실패하면 저장본
    e.respondWith(fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
    }).catch(function () {
        return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
            return hit || caches.match('index.html');
        });
    }));
});

self.addEventListener('notificationclick', function (e) {
    e.notification.close();
    var target = (e.notification.data && e.notification.data.url) || './#prayer';
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i++) {
            if ('focus' in list[i]) { list[i].navigate(target); return list[i].focus(); }
        }
        return self.clients.openWindow(target);
    }));
});

// 나중에 서버 푸시(Web Push)를 붙일 때 사용
self.addEventListener('push', function (e) {
    var d = {};
    try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
    e.waitUntil(self.registration.showNotification(d.title || '🙏 기도 시간입니다', {
        body: d.body || '지금은 교회를 위해 기도하는 시간입니다.',
        icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'prayer',
        data: { url: d.url || './?pray=1#prayer' }
    }));
});
