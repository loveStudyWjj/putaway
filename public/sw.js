// 离线缓存：HTML 页面网络优先（保证更新即时生效），
// 带 hash 的静态资源 cache-first + 后台刷新，其它请求网络优先、缓存兜底
const CACHE = 'wugui-v2';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
const put = (req, res) => {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  const url = new URL(e.request.url);
  const isHashedAsset = /assets\/.+\.(js|css|png|woff2?)$/.test(url.pathname);
  if (isHashedAsset) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const net = fetch(e.request).then((res) => put(e.request, res)).catch(() => null);
        return hit || net;
      })
    );
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => put(e.request, res))
      .catch(() => caches.match(e.request))
  );
});
