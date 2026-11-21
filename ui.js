// 会計アプリの画面のファイル（Apps Script の index.html）を、この端末に覚えておく。
//   会計のデータ・ログインはここには入らない（画面の部品だけ。データはいつもサーバーから受け取る）。
//   入口（shell.js）と、画面を出すページ（boot.js）の両方が使う。
self.KaikeiUI = (function () {
  'use strict';
  const C = self.KAIKEI;
  const CACHE = 'kaikei-ui';
  // 入口の場所ごとに分ける（/kaikei/ と /kaikei-test/ が混ざらないように）
  const KEY = new URL('./__ui__', location.href).href;

  async function get() {
    try {
      if (!self.caches) return null;
      const r = await (await caches.open(CACHE)).match(KEY);
      if (!r) return null;
      const html = await r.text();
      return html ? { html, v: r.headers.get('x-v') || '', h: r.headers.get('x-h') || '' } : null;
    } catch (e) { return null; }
  }
  async function put(x) {
    if (!self.caches) return;
    const c = await caches.open(CACHE);
    await c.put(KEY, new Response(x.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-v': x.v, 'x-h': x.h } }));
  }
  async function forget() { try { if (self.caches) await (await caches.open(CACHE)).delete(KEY); } catch (e) { /* noop */ } }
  // サーバーと同じ印（UTF-8 の SHA-256 の先頭12バイト）
  async function hash(s) {
    const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
    return Array.from(b.slice(0, 12), (x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function getText(q, ms) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctl && setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(C.API + (C.API.indexOf('?') >= 0 ? '&' : '?') + q, { cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } finally { if (t) clearTimeout(t); }
  }
  /** いまサーバーにある版：{ v, h } */
  async function meta(ms) {
    const j = JSON.parse(await getText('raw=meta', ms || 10000));
    if (!j || !/^[0-9a-f]{24}$/.test(j.h || '')) throw new Error('meta');
    return { v: String(j.v || ''), h: j.h };
  }
  /** 画面のファイルを受け取る（途中で切れたり別の版が混ざったりしたものは使わない） */
  async function download(m, ms) {
    const html = await getText('raw=1', ms || 30000);
    if (!/<html/i.test(html) || (await hash(html)) !== m.h) throw new Error('hash');
    return { html, v: m.v, h: m.h };
  }
  async function fresh(ms) { return download(await meta(ms), ms); }
  /** 新しい版があれば受け取って覚える。変わっていなければ null */
  async function update(cur) {
    const m = await meta(10000);
    if (cur && cur.h === m.h) return null;
    const x = await download(m, 60000);
    await put(x);
    return x;
  }
  return { get, put, forget, fresh, update, hash };
})();
