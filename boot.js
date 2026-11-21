// 会計アプリの画面を出すページ（app.html）。入口（index.html）の中の枠で開く。
//   端末に覚えた画面のファイルがあれば、それをすぐに出す（Googleのページを読み込むのを待たない）。
//   なければ一度だけサーバーから受け取る。受け取れなければ、これまで通り Apps Script のページを開く。
//   画面からサーバーへの呼び出し（google.script.run）は、同じWebアプリの doPost に送る（中身は同じ関数）。
(async function () {
  'use strict';
  const C = self.KAIKEI;
  const q = new URLSearchParams(location.search);
  const params = { shell: '1' };
  ['go', 'pair', 'pw'].forEach((k) => { const v = q.get(k); if (v && /^[\w-]{1,40}$/.test(v)) params[k] = v; });
  // 入口の外で直接開いたときは、入口へ
  if (window.top === window) { location.replace('./'); return; }
  // 開き直したときに、同じ画面へもう一度飛ばないように
  try { history.replaceState(null, '', location.pathname + '?shell=1'); } catch (e) { /* noop */ }
  const fallback = () => location.replace(C.APP + (C.APP.indexOf('?') >= 0 ? '&' : '?') + new URLSearchParams(params));

  let ui = await KaikeiUI.get();
  if (!ui) {
    try { ui = await KaikeiUI.fresh(20000); } catch (e) { return fallback(); }
    try { await KaikeiUI.put(ui); } catch (e) { /* 覚えられなくても、今回は出す */ }
  }
  const cfg = { api: C.API, ns: C.NS || '', params };
  const shim = '<script>(' + SHIM.toString() + ')(' + JSON.stringify(cfg).replace(/</g, '\\u003c') + ');<\/script>';
  let html = ui.html;
  const m = /<head[^>]*>/i.exec(html);
  html = m ? html.slice(0, m.index + m[0].length) + shim + html.slice(m.index + m[0].length) : shim + html;
  document.open();
  document.write(html);
  document.close();

  // ---- 画面の中で動かす google.script の代わり（この関数は文字にして画面に入れる。外の変数は使えない） ----
  function SHIM(cfg) {
    const netErr = () => new Error('NetworkError: Connection failure');
    function rpc(name, args) {
      let body;
      try { body = JSON.stringify({ rpc: name, args: args }); } catch (e) { return Promise.reject(e); }
      return fetch(cfg.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, cache: 'no-store', credentials: 'omit', redirect: 'follow' })
        .then((r) => r.text().catch(() => { throw netErr(); }).then((t) => {
          let j = null;
          try { j = JSON.parse(t); } catch (e) { /* 下で */ }
          if (!j || typeof j !== 'object' || !('ok' in j)) throw new Error('Service error: サーバーの返事を読めませんでした（HTTP ' + r.status + '）');
          if (j.ok) return j.r;
          throw new Error(String(j.e || 'error'));
        }), () => { throw netErr(); });
    }
    function runner(ok, ng, uo) {
      return new Proxy({}, {
        get(_, p) {
          if (p === 'withSuccessHandler') return (f) => runner(f, ng, uo);
          if (p === 'withFailureHandler') return (f) => runner(ok, f, uo);
          if (p === 'withUserObject') return (o) => runner(ok, ng, o);
          if (typeof p !== 'string' || p === 'then') return undefined;
          return (...args) => {
            rpc(p, args).then((r) => { if (ok) ok(r, uo); }, (e) => { if (ng) ng(e, uo); });
          };
        },
      });
    }
    const loc = () => {
      const parameters = {};
      Object.keys(cfg.params).forEach((k) => { parameters[k] = [cfg.params[k]]; });
      return { parameter: Object.assign({}, cfg.params), parameters, hash: '' };
    };
    let onChange = null;
    window.addEventListener('popstate', (e) => { if (onChange) onChange({ state: e.state, location: { parameter: {}, parameters: {}, hash: '' } }); });
    const plain = (s) => (s == null ? null : JSON.parse(JSON.stringify(s)));
    const history = {
      push: (state) => window.history.pushState(plain(state), ''),
      replace: (state) => window.history.replaceState(plain(state), ''),
      setChangeHandler: (fn) => { onChange = fn; },
    };
    const url = { getLocation: (cb) => setTimeout(() => cb(loc()), 0) };
    const host = { close() {}, setHeight() {}, setWidth() {}, origin: location.origin, editor: { focus() {} } };
    window.__KAIKEI_NS = cfg.ns;
    window.google = { script: { run: runner(null, null, undefined), history, url, host } };
  }
})();
