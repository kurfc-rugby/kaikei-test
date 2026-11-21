/* KURFC 会計の入口 — Service Worker
 *  入口のページ（index.html・app.html・*.js・アイコン）… しまっておいたものをすぐ出し、裏でネットから新しくしておく
 *  会計アプリの画面のファイル … ui.js が別の入れ物（kaikei-ui）に覚える。ここでは触らない
 *  会計アプリのサーバー（script.google.com）… 触らない（いつもネット）
 *  通知（push）… 中身は来ないので、会計アプリのサーバー（doPost の pushInbox）に取りに行って表示する
 * 版を上げるときは VERSION と、index.html・app.html の ?v= を一緒に変える。 */
const VERSION = '1.1.0';
// 同じ github.io の中のほかの入口（/kaikei-test/ など）と入れ物が混ざらないように、場所を名前に入れる
const SCOPE = new URL('./', self.location.href).pathname;
const CPREFIX = 'kaikei-shell:' + SCOPE + ':';
const CACHE = CPREFIX + VERSION;
try { importScripts('config.js?v=' + VERSION); } catch (e) { /* 読めなくても入口は動く */ }
const V = '?v=' + VERSION;
const FILES = ['./', 'app.html', 'shell.js' + V, 'ui.js' + V, 'boot.js' + V, 'config.js' + V, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/crest-240.png', 'icons/badge-96.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((k) => (k.indexOf(CPREFIX) === 0 && k !== CACHE) || (SCOPE === '/kaikei/' && /^kaikei-shell-\d/.test(k)))
    .map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf(SCOPE) !== 0 || /\/sw\.js$/.test(url.pathname)) return;
  // ページを開くとき（?go= などは外して、ページごとに1つ）
  const key = req.mode === 'navigate' ? url.origin + url.pathname : req;
  e.respondWith(caches.open(CACHE).then((c) => c.match(key).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') c.put(key, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(net.catch(() => null)); return hit; }
    return net.catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((x) => x || Response.error()));
  })));
});

// ---------- 通知 ----------
const API = () => (self.KAIKEI && self.KAIKEI.API) || '';
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let msgs = [];
    try { if (e.data) { const j = e.data.json(); if (j && j.title) msgs = [j]; } } catch (x) { /* 中身なし */ }
    if (!msgs.length && API()) {
      try {
        const sub = await self.registration.pushManager.getSubscription();
        const r = await fetch(API(), { method: 'POST', body: JSON.stringify({ op: 'pushInbox', endpoint: sub ? sub.endpoint : '' }), redirect: 'follow' });
        const j = await r.json();
        msgs = (j && j.messages) || [];
      } catch (x) { msgs = []; }
    }
    if (!msgs.length) msgs = [{ title: 'KURFC 会計', body: '新しいお知らせがあります。開いて確かめてください。', url: './', tag: 'kaikei' }];
    for (const m of msgs.slice(-3)) {
      await self.registration.showNotification(m.title, { body: m.body || '', tag: m.tag || undefined, renotify: !!m.tag, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', lang: 'ja', data: { url: m.url || './' } });
    }
  })());
});
// ブラウザが通知の宛先を作り直したとき、サーバーの登録を新しい宛先に移す
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const old = e.oldSubscription;
    let sub = e.newSubscription;
    if (!sub && old && old.options) { try { sub = await self.registration.pushManager.subscribe(old.options); } catch (x) { return; } }
    if (!sub || !old || !API()) return;
    try { await fetch(API(), { method: 'POST', body: JSON.stringify({ op: 'pushMove', old: old.endpoint, sub: sub.toJSON() }), redirect: 'follow' }); } catch (x) { /* 次に設定を開いたときに登録し直す */ }
  })());
});
// 通知を押したとき：入口が開いていれば、その中の会計アプリをその画面へ。閉じていれば開く
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope);
  const name = url.searchParams.get('go') || '';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 入口のページそのもの（中の枠の app.html ではなく）
    const c = list.find((x) => x.frameType !== 'nested' && x.url.indexOf(self.registration.scope) === 0);
    if (c) {
      try { await c.focus(); } catch (x) { /* そのまま */ }
      if (name) c.postMessage({ k: 'kurfc-sw', t: 'go', name });
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
