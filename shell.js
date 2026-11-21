// 会計アプリの入口：会計アプリ（Apps Script のWebアプリ）を全画面で表示し、
// ホーム画面への追加と通知（Web Push）の受け取りを受け持つ。会計のデータはここには来ない。
// 会計アプリの画面は app.html（boot.js）が出す。画面のファイルは端末に覚えておき（ui.js）、新しい版はあとで受け取る。
// 会計アプリとはメッセージでやり取りする（相手が自分の枠の中の画面かを必ず確かめる）。
(function () {
  'use strict';
  const C = self.KAIKEI;
  const frame = document.getElementById('app');
  const wait = document.getElementById('wait');
  const waitMsg = document.getElementById('waitMsg');
  const retry = document.getElementById('retry');
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let app = null; // 会計アプリの画面（メッセージの返し先）
  let appOrigin = '';
  let installEvt = null;
  let regP = null;

  // ---- 会計アプリを開く（通知から開いたときの ?go=画面 などはそのまま渡す） ----
  function appUrl() {
    const q = new URLSearchParams(location.search);
    const out = new URLSearchParams({ shell: '1' });
    ['go', 'pair', 'pw'].forEach((k) => { const v = q.get(k); if (v && /^[\w-]{1,40}$/.test(v)) out.set(k, v); });
    return 'app.html?' + out.toString();
  }
  // 枠の中が、端末に覚えた画面（この入口と同じ場所の app.html）か。Apps Script のページなら false
  function cachedMode() { try { return frame.contentWindow.location.origin === location.origin; } catch (e) { return false; } }
  let shown = false;
  function show() {
    if (shown) return;
    shown = true;
    frame.classList.add('ready');
    wait.classList.add('gone');
  }
  function load() {
    shown = false;
    frame.classList.remove('ready');
    wait.classList.remove('gone');
    waitMsg.hidden = true; retry.hidden = true;
    frame.src = appUrl();
    // 通知などで ?go= を付けて開いたときは、アドレスを元に戻しておく（開き直しで同じ画面に飛ばないように）
    if (location.search) history.replaceState(null, '', location.pathname);
    clearTimeout(load.t);
    load.t = setTimeout(() => {
      if (shown) return;
      // 覚えた画面が動かないときに備えて、次の「もう一度読み込む」ではサーバーから受け取り直す
      if (cachedMode()) KaikeiUI.forget();
      waitMsg.textContent = navigator.onLine === false ? '電波がありません。電波のよい所で、もう一度読み込んでください。' : '読み込みに時間がかかっています。もう少し待つか、もう一度読み込んでください。';
      waitMsg.hidden = false; retry.hidden = false;
    }, 15000);
  }
  // 覚えた画面は、アプリからのあいさつ（すぐ来る）で見せる。届かなくても少し待てば見せる
  frame.addEventListener('load', () => setTimeout(show, cachedMode() ? 3000 : 250));

  // ---- 画面の新しい版（会計アプリを直したとき）：裏で受け取り、次に開いたときから使う ----
  const upd = document.getElementById('upd');
  let lastCheck = 0, checking = false;
  async function checkUpdate() {
    if (checking || !self.KaikeiUI) return;
    checking = true;
    lastCheck = Date.now();
    try {
      const shownCached = cachedMode();
      const x = await KaikeiUI.update(await KaikeiUI.get());
      // いま覚えた画面を見ているときだけ知らせる（Apps Script のページなら、次に開いたときに自然に切り替わる）
      if (x && shownCached && upd) upd.hidden = false;
    } catch (e) { /* 電波がないなど：次に開いたときに */ }
    checking = false;
  }
  if (upd) {
    document.getElementById('updGo').addEventListener('click', () => { upd.hidden = true; load(); });
    document.getElementById('updX').addEventListener('click', () => { upd.hidden = true; });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > 3600 * 1000) checkUpdate();
  });
  retry.addEventListener('click', load);

  // ---- 通知の準備（Service Worker） ----
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    regP = navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => null);
    navigator.serviceWorker.addEventListener('message', (e) => {
      const d = e.data || {};
      if (d.k === 'kurfc-sw' && d.t === 'go') toApp('go', { name: d.name });
    });
  }
  async function getReg() {
    if (!regP) return null;
    await regP;
    return navigator.serviceWorker.ready;
  }
  async function getSub() {
    try { const reg = await getReg(); return reg ? await reg.pushManager.getSubscription() : null; } catch (e) { return null; }
  }
  const b64uBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  const sameKey = (sub, key) => {
    try {
      const a = new Uint8Array(sub.options.applicationServerKey || []);
      const b = b64uBytes(key);
      return a.length === b.length && a.every((x, i) => x === b[i]);
    } catch (e) { return true; }
  };

  async function info() {
    const sub = pushOk ? await getSub() : null;
    return {
      standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
      installable: !!installEvt,
      ios: isIOS,
      push: pushOk ? 'ok' : 'unsupported',
      permission: pushOk ? Notification.permission : 'unsupported',
      endpoint: sub ? sub.endpoint : '',
    };
  }
  const handlers = {
    hello: async () => { show(); return info(); },
    info: () => info(),
    async subscribe(d) {
      if (!pushOk) return { error: 'unsupported' };
      const key = String((d && d.key) || '');
      if (!/^[A-Za-z0-9_-]{80,100}$/.test(key)) return { error: 'key' };
      let perm = Notification.permission;
      if (perm !== 'granted') { try { perm = await Notification.requestPermission(); } catch (e) { perm = Notification.permission; } }
      if (perm !== 'granted') return { error: 'denied', permission: perm };
      const reg = await getReg();
      if (!reg) return { error: 'sw' };
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub, key)) { try { await sub.unsubscribe(); } catch (e) { /* 作り直す */ } sub = null; }
      if (!sub) {
        try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(key) }); } catch (e) { return { error: 'subscribe', name: e && e.name }; }
      }
      return { sub: sub.toJSON(), permission: 'granted' };
    },
    async unsubscribe() {
      const sub = await getSub();
      if (sub) { try { await sub.unsubscribe(); } catch (e) { /* 次に開いたときに */ } }
      return { ok: true };
    },
    async install() {
      if (!installEvt) return { outcome: 'unavailable' };
      const ev = installEvt;
      installEvt = null;
      try { ev.prompt(); const r = await ev.userChoice; return { outcome: r && r.outcome }; } catch (e) { return { outcome: 'error' }; }
    },
  };

  // ---- 会計アプリとのメッセージ ----
  function fromApp(e) {
    if (e.origin === location.origin) return !!e.source && e.source === frame.contentWindow;
    if (!C.APP_ORIGIN.test(e.origin)) return false;
    // 自分が開いた会計アプリの中のページだけ（ほかのウィンドウからのものは受け付けない）
    try { return !!e.source && e.source.top === window && e.source !== window; } catch (x) { return false; }
  }
  function toApp(t, data) {
    if (!app) {
      // まだ話していない：開き直してその画面へ
      if (t === 'go' && data && data.name) { history.replaceState(null, '', '?go=' + encodeURIComponent(data.name)); load(); }
      return;
    }
    app.postMessage({ k: 'kurfc-shell', t, data }, appOrigin);
  }
  window.addEventListener('message', async (e) => {
    const d = e.data;
    if (!d || d.k !== 'kurfc-kaikei' || !fromApp(e)) return;
    const fn = handlers[d.t];
    if (!fn) return;
    if (d.t === 'hello') { app = e.source; appOrigin = e.origin; }
    let out;
    try { out = await fn(d.data || {}); } catch (x) { out = { error: 'failed' }; }
    try { e.source.postMessage({ k: 'kurfc-shell', id: d.id, data: out }, e.origin); } catch (x) { /* 画面が閉じた */ }
  });

  // ---- ホーム画面への追加（Android の Chrome） ----
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvt = e;
    if (app) info().then((i) => toApp('info', i));
  });
  window.addEventListener('appinstalled', () => { installEvt = null; if (app) info().then((i) => toApp('info', i)); });

  load();
  setTimeout(checkUpdate, 5000);
})();
