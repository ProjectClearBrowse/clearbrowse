// クリアブラウズ: 拡張機能の隔離環境(ISOLATED world)で動くスクリプト。
// ・サイトごとの ON/OFF を反映
// ・MAIN world からのブロック通知を background へ中継
// ・透明オーバーレイ(クリック乗っ取り)と、画面隅に固定表示される浮遊広告の検出・削除
// ・ユーザーが「広告ピッカー」で選んだ要素の非表示
(() => {
  'use strict';

  const root = document.documentElement;

  function topHostname() {
    if (window.top === window) return location.hostname;
    const ao = location.ancestorOrigins;
    if (ao && ao.length) {
      try { return new URL(ao[ao.length - 1]).hostname; } catch (e) { /* ignore */ }
    }
    return location.hostname;
  }

  const normHost = (h) => h.replace(/^www\./, '');
  const HOST = normHost(topHostname());

  function isDisabledFor(host, list) {
    return list.some((d) => host === d || host.endsWith('.' + d));
  }

  let off = false;
  const FEATURES = { popup: true, overlay: true, floating: true, inline: true, ws: true };
  const featureOn = (k) => FEATURES[k] !== false;

  // --- 広告配信元の一覧と、「強力」にするかどうかの判定 ---
  // 標準: 一覧にある広告配信元だけを対象にする(誤検出が少ない)。
  // 強力: ページの見た目(大きさ・位置・外部リンク)からも広告を推測する。
  //       設定で強力にしたサイト、成人向けと判断したページ、ポップアップ広告の配信元を含むページで使う。
  const NETS = self.PAB_ADNETS || { strong: [], all: [], adultHosts: [] };
  const hostIn = (host, list) => list.some((d) => host === d || host.endsWith('.' + d));
  const urlHost = (u) => { try { return new URL(u, location.href).hostname; } catch (e) { return ''; } };
  const isAdHost = (u) => hostIn(urlHost(u), NETS.all);
  const AD_ATTR = /(^|[^a-z])(ads?|adv|advert|adsbygoogle|aswift|google_ads|gpt)([^a-z]|$)/i;
  let mode = 'standard';
  let detected = hostIn(HOST, NETS.adultHosts);
  const isAggressive = () => mode === 'strong' || detected;

  const report = (kind) => {
    try { chrome.runtime.sendMessage({ type: 'blocked', kind }); } catch (e) { /* ignore */ }
  };

  // エラーは端末内のログにだけ記録する(外部には送信しない)
  // 非表示にした広告の面積(画面に対する割合の目安)。最上位のページでのみ集計する
  let hiddenArea = 0;
  const addArea = (el) => {
    try {
      if (window !== window.top) return;
      const r = el.getBoundingClientRect();
      hiddenArea += Math.max(0, r.width) * Math.max(0, r.height);
      const vp = Math.max(1, window.innerWidth * window.innerHeight);
      chrome.runtime.sendMessage({ type: 'area', pct: Math.min(100, (hiddenArea / vp) * 100) }).catch(() => {});
    } catch (e) { /* 集計できない場合は何もしない */ }
  };

  const reportError = (where, e) => {
    try {
      chrome.runtime.sendMessage({
        type: 'error',
        src: where,
        message: String((e && e.message) || e),
        stack: String((e && e.stack) || ''),
      });
    } catch (x) { /* ignore */ }
  };
  const safe = (where, fn) => (...args) => {
    try { return fn(...args); } catch (e) { reportError(where, e); return undefined; }
  };

  // --- MAIN world からの通知を中継 ---
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__pab !== true || typeof d.kind !== 'string') return;
    if (d.kind === 'error') {
      try {
        chrome.runtime.sendMessage({ type: 'error', src: 'page-hook', message: d.message, stack: d.stack });
      } catch (e) { /* ignore */ }
    } else {
      report(d.kind);
    }
  });

  // --- 透明オーバーレイ判定 ---
  function isClear(color) {
    if (color === 'transparent') return true;
    return /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(\.0+)?\s*\)$/.test(color);
  }

  function isSuspectOverlay(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el === document.body || el === root) return false;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    const r = el.getBoundingClientRect();
    if (r.width < window.innerWidth * 0.8 || r.height < window.innerHeight * 0.8) return false;
    const z = parseInt(cs.zIndex, 10);
    if (!(z >= 1000)) return false;
    const see = parseFloat(cs.opacity) <= 0.05 ||
      (isClear(cs.backgroundColor) && cs.backgroundImage === 'none');
    if (!see) return false;
    if (el.textContent && el.textContent.trim()) return false;
    if (el.querySelector('video,canvas,img,svg,input,button,form,a,audio,picture,select,textarea')) return false;
    return true;
  }

  // --- 浮遊広告判定(画面の隅に固定表示される広告) ---
  function isExternal(url) {
    try { return new URL(url, location.href).origin !== location.origin; } catch (e) { return false; }
  }

  // 同じサイトの別サブドメイン(例: www.google.com と ogs.google.com)は、第三者とみなさない
  const SLD = /^(co|ne|or|ac|go|ed|ad|gr|lg)$/;
  function siteOf(host) {
    if (/^[\d.]+$/.test(host) || host.indexOf('.') < 0 || host.indexOf(':') >= 0) return null;
    const p = host.split('.');
    const n = p.length >= 3 && p[p.length - 1].length === 2 && SLD.test(p[p.length - 2]) ? 3 : 2;
    return p.slice(-n).join('.');
  }
  function isThirdParty(url) {
    try {
      const u = new URL(url, location.href);
      if (u.origin === location.origin) return false;
      const a = siteOf(u.hostname), b = siteOf(location.hostname);
      return !(a && b && a === b);
    } catch (e) { return false; }
  }

  function isFloatingAd(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el === document.body || el === root) return false;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed') return false;
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 30) return false;
    // 画面を大きく覆うもの(モーダル等)は対象外
    if (r.width > window.innerWidth * 0.9 && r.height > window.innerHeight * 0.5) return false;
    // 画面の端(下・上・左・右)に接していること
    const edge = r.bottom >= window.innerHeight - 40 || r.top <= 40 ||
      r.left <= 40 || r.right >= window.innerWidth - 40;
    if (!edge) return false;

    // 入力欄・フォーム・メニューを含む固定表示は、サイト自身のヘッダーなどとみなして対象外にする
    if (el.matches('input,textarea,select,form,nav,header,[role=search],[role=navigation]') ||
        el.querySelector('input,textarea,select,form,nav,header,[role=search],[role=navigation]')) return false;

    const frames = el.matches('iframe') ? [el] : Array.from(el.querySelectorAll('iframe'));
    const aggressive = isAggressive();
    if (frames.some((f) => f.src && !SAFE_FRAME.test(f.src) &&
        (isAdHost(f.src) || (aggressive && isThirdParty(f.src))))) return true;
    if (!aggressive) return false;

    const hasMedia = !!el.querySelector('img,video,canvas,iframe,picture') || el.matches('img,video,canvas');
    if (!hasMedia) return false;
    const links = el.matches('a[href]') ? [el] : Array.from(el.querySelectorAll('a[href]'));
    return links.some((a) => isExternal(a.href));
  }

  // --- ページ内に埋め込まれたバナー広告(標準サイズ・細長いバナー)の判定 ---
  const AD_SIZES = [
    [300, 250], [728, 90], [970, 250], [970, 90], [300, 600], [160, 600], [120, 600],
    [320, 50], [320, 100], [468, 60], [300, 100], [250, 250], [336, 280], [300, 50],
    [900, 250], [160, 300], [300, 300], [720, 90], [980, 120],
  ];
  const SAFE_FRAME = /youtube\.|youtu\.be|vimeo\.|dailymotion\.|recaptcha|hcaptcha|turnstile|challenges\.cloudflare|intercom|drift\.com|zendesk|zdassets|crisp\.chat|tawk\.to|livechat|hubspot|freshchat|freshdesk|helpscout|tidio|olark|stripe\.|paypal\.|accounts\.google|appleid|disqus|line\.me|facebook\.com\/plugins|twitter\.com|x\.com|spotify|soundcloud|google\.com\/maps|openstreetmap/i;

  function looksLikeBanner(w, h) {
    if (AD_SIZES.some(([a, b]) => Math.abs(w - a) <= 4 && Math.abs(h - b) <= 4)) return true;
    return w >= 400 && h >= 40 && h <= 130 && w / h >= 4.5; // 細長いバナー
  }

  function isInlineAd(el) {
    if (el.getAttribute('data-pab-hidden') === '1') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 30) return false;
    const aggressive = isAggressive();
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (!aggressive) {
      // 標準: 広告配信元の一覧にあるもの、または広告であることが名前から明らかなものだけを隠す
      if (el.matches('iframe')) {
        if (SAFE_FRAME.test(el.src || '')) return false;
        return isAdHost(el.src) || (AD_ATTR.test((el.id || '') + ' ' + (el.name || '')) && looksLikeBanner(r.width, r.height));
      }
      if (el.matches('a[href]')) return isAdHost(el.href) && !!el.querySelector('img,video,canvas,picture,svg');
      return false;
    }
    if (!looksLikeBanner(r.width, r.height)) return false;
    if (el.matches('iframe')) return !SAFE_FRAME.test(el.getAttribute('src') || '') && (!el.src || isThirdParty(el.src));
    if (el.matches('a[href]')) {
      if (!isExternal(el.href)) return false;
      if (!el.querySelector('img,video,canvas,picture,svg')) return false;
      return el.textContent.trim().length < 40;
    }
    // data:/blob: の画像・動画は、外部サイトへのリンク内にあるものに限る
    // (遅延読み込みのサムネイルなど、サイト自身の画像を誤って隠さないため)
    if (el.matches('img') && /^(data:image|blob:)/.test(el.getAttribute('src') || '')) {
      const a = el.closest('a[href]');
      return !!a && isExternal(a.href);
    }
    if (el.matches('video') && /^blob:/.test(el.getAttribute('src') || '')) {
      const a = el.closest('a[href]');
      return !!a && isExternal(a.href);
    }
    return false;
  }

  // 非表示にした要素の記録(種類・大きさ・理由のみ。ページのアドレスは含まない)。不具合の調査用で、端末内にだけ保存する
  const hiddenMap = new WeakMap();
  const keyOf = (el) => (el && (el.getAttribute('src') || el.getAttribute('href'))) || '';
  function note(reason, el) {
    try {
      const r = el.getBoundingClientRect();
      let h = '';
      const u = el.src || el.href;
      if (u) { const x = urlHost(u); if (x && x !== location.hostname) h = x; }
      chrome.runtime.sendMessage({
        type: 'hidelog', reason, tag: el.tagName.toLowerCase(),
        w: Math.round(r.width), h: Math.round(r.height), host: h, strong: isAggressive(),
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }
  // 一度隠した要素でも、ページが中身を差し替えた場合(一覧の使い回しなど)は、元に戻す
  function restoreStale() {
    document.querySelectorAll('[data-pab-hidden="1"]').forEach((t) => {
      const info = hiddenMap.get(t);
      if (info && t.contains(info.el) && keyOf(info.el) === info.key) return;
      t.style.removeProperty('display');
      t.removeAttribute('data-pab-hidden');
      note('restore', t);
    });
  }

  function hideInline(el) {
    let t = el;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 3; i++) {
      const p = t.parentElement;
      if (!p || p === document.body || p === root || p.children.length !== 1) break;
      const pr = p.getBoundingClientRect();
      if (pr.width > r.width + 80 || pr.height > r.height + 80) break;
      t = p;
    }
    addArea(t);
    note('inline', el);
    hiddenMap.set(t, { el, key: keyOf(el) });
    t.style.setProperty('display', 'none', 'important');
    t.setAttribute('data-pab-hidden', '1');
    report('overlay');
  }

  // TrafficJunky の「Ad」ラベル(クラス名・ID が固定)を目印に、広告の枠ごと隠す
  function effChildren(p) {
    return Array.from(p.children).filter((c) => c.tagName !== 'STYLE' && c.tagName !== 'SCRIPT');
  }

  function hideWrapper(w) {
    let t = w;
    const r = w.getBoundingClientRect();
    for (let i = 0; i < 4; i++) {
      const p = t.parentElement;
      if (!p || p === document.body || p === root || effChildren(p).length !== 1) break;
      const pr = p.getBoundingClientRect();
      if (pr.width > r.width + 80 || pr.height > r.height + 80) break;
      t = p;
    }
    addArea(t);
    note('label', w);
    hiddenMap.set(t, { el: w, key: keyOf(w) });
    t.style.setProperty('display', 'none', 'important');
    t.setAttribute('data-pab-hidden', '1');
    report('overlay');
  }

  function scanInline() {
    restoreStale();
    document.querySelectorAll('iframe, a[href], img[src^="data:image"], img[src^="blob:"], video[src^="blob:"]').forEach((el) => {
      if (isInlineAd(el)) hideInline(el);
    });
    document.querySelectorAll('[class~="t-j-inbanlabel-container"], [id^="tj-inbanlabel-container"]').forEach((label) => {
      const w = label.parentElement;
      if (!w || w === document.body || w === root) return;
      if (!w.getClientRects().length) return; // すでに非表示
      hideWrapper(w);
    });
  }

  // 要素は削除せず、非表示にする(サイト側のプログラムが、その要素を参照して動いている場合に、エラーで止まることを避けるため)
  function removeEl(el, reason) {
    note(reason || 'overlay', el);
    try {
      el.style.setProperty('display', 'none', 'important');
      el.setAttribute('data-pab-gone', '1');
    } catch (e) { return; }
    report('overlay');
  }

  function applyFlagAttrs() {
    for (const k of ['popup', 'ws', 'inline']) {
      root.setAttribute('data-pab-f-' + k, featureOn(k) ? '1' : '0');
    }
    root.setAttribute('data-pab-strong', isAggressive() ? '1' : '0');
  }

  // 成人向けページ、またはポップアップ広告の配信元を含むページを判定する(最上位のページのみ)
  let detectTries = 0;
  let marked = false;
  function markDetected() {
    if (marked) return;
    marked = true;
    detected = true;
    applyFlagAttrs();
    try {
      chrome.storage.session.get({ aggressiveHosts: [] }).then(({ aggressiveHosts }) => {
        if (!aggressiveHosts.includes(HOST)) {
          aggressiveHosts.push(HOST);
          return chrome.storage.session.set({ aggressiveHosts: aggressiveHosts.slice(-100) });
        }
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }
  function detectAggressive() {
    if (window !== window.top || detectTries >= 15) return;
    if (detected) { if (detectTries === 0) { detectTries = 99; markDetected(); } return; }
    detectTries++;
    const meta = document.querySelector('meta[name="rating" i]');
    if (meta && /adult|RTA-5042-1996-1400-1577-RTA/i.test(meta.content || '')) { markDetected(); return; }
    const els = document.querySelectorAll('script[src],iframe[src],a[href^="http"],img[src^="http"]');
    const n = Math.min(els.length, 500);
    for (let i = 0; i < n; i++) {
      const u = els[i].src || els[i].href;
      if (u && hostIn(urlHost(u), NETS.strong)) { markDetected(); return; }
    }
  }

  const scan = safe('scan', function scan() {
    if (off || !document.body) return;
    // 大きさのない枠(非表示の計測用フレームなど)の中では、見た目による判定を行わない
    if (window.innerWidth < 100 || window.innerHeight < 100) return;
    const cands = new Set();
    for (const c of Array.from(document.body.children)) {
      cands.add(c);
      for (const g of Array.from(c.children)) cands.add(g);
    }
    for (const c of Array.from(root.children)) cands.add(c);
    document.querySelectorAll('iframe,ins').forEach((f) => {
      let e = f;
      for (let i = 0; i < 6 && e && e !== document.body; i++, e = e.parentElement) cands.add(e);
    });
    for (const el of cands) {
      const ov = featureOn('overlay') && isAggressive() && isSuspectOverlay(el);
      const fl = !ov && featureOn('floating') && isFloatingAd(el);
      if (fl) addArea(el);
      if (ov || fl) removeEl(el, ov ? 'overlay' : 'floating');
    }
    if (featureOn('inline')) scanInline();
    detectAggressive();
  });

  // クリックの瞬間に透明オーバーレイがあれば、それを消してクリックを無効化
  function onPointer(ev) {
    if (off || !featureOn('overlay') || !isAggressive() || !ev.isTrusted) return;
    let el = ev.target;
    for (let i = 0; el && i < 4; i++, el = el.parentElement) {
      if (isSuspectOverlay(el)) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        removeEl(el, 'overlay-click');
        return;
      }
    }
  }
  window.addEventListener('mousedown', onPointer, true);
  window.addEventListener('click', onPointer, true);

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; scan(); });
  };
  const mo = new MutationObserver(schedule);
  mo.observe(root, { childList: true });
  const attachBody = () => { if (document.body) mo.observe(document.body, { childList: true }); };
  attachBody();
  document.addEventListener('DOMContentLoaded', () => { attachBody(); scan(); });
  setInterval(scan, 1000);

  // --- ユーザーが選んだ要素を隠す ---
  const hideStyle = document.createElement('style');
  hideStyle.setAttribute('data-pab', 'user');
  root.appendChild(hideStyle);

  function applyHidden(map) {
    if (off) { hideStyle.textContent = ''; return; }
    const list = (map && map[HOST]) || [];
    hideStyle.textContent = list.map((s) => `${s}{display:none!important}`).join('\n');
  }

  // --- 広告ピッカー(トップフレームのみ) ---
  function cssPath(el) {
    const parts = [];
    let e = el;
    while (e && e !== root) {
      if (e.id && /^[A-Za-z][\w-]*$/.test(e.id) && !/\d{4,}/.test(e.id) &&
          document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) {
        parts.unshift('#' + CSS.escape(e.id));
        break;
      }
      let idx = 1;
      let s = e;
      while ((s = s.previousElementSibling)) if (s.tagName === e.tagName) idx++;
      parts.unshift(`${e.tagName.toLowerCase()}:nth-of-type(${idx})`);
      e = e.parentElement;
    }
    return parts.join('>');
  }

  let picking = false;
  function startPicker() {
    if (picking || window.top !== window) return;
    picking = true;

    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #e11d48;background:rgba(225,29,72,.15);display:none';
    const tip = document.createElement('div');
    tip.textContent = '消したい広告をクリックしてください(Esc キーで中止)';
    tip.style.cssText = 'position:fixed;z-index:2147483647;top:8px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:6px 12px;border-radius:6px;font:13px system-ui,sans-serif;pointer-events:none';
    root.append(box, tip);

    let cur = null;
    const choose = (el) => {
      let target = el;
      for (let e = el; e && e !== document.body && e !== root; e = e.parentElement) {
        const p = getComputedStyle(e).position;
        if (p === 'fixed' || p === 'sticky') target = e;
      }
      return target;
    };

    const onMove = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!el || el === document.body || el === root) return;
      cur = choose(el);
      const r = cur.getBoundingClientRect();
      Object.assign(box.style, {
        display: 'block', left: r.left + 'px', top: r.top + 'px',
        width: r.width + 'px', height: r.height + 'px',
      });
    };

    const swallow = (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); };

    const cleanup = () => {
      picking = false;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach((t) => window.removeEventListener(t, swallow, true));
      box.remove();
      tip.remove();
    };

    const onClick = (ev) => {
      swallow(ev);
      if (!cur) { cleanup(); return; }
      const sel = cssPath(cur);
      cur.style.setProperty('display', 'none', 'important');
      chrome.storage.local.get({ hiddenSelectors: {} }, ({ hiddenSelectors }) => {
        const list = hiddenSelectors[HOST] || [];
        if (!list.includes(sel)) list.push(sel);
        hiddenSelectors[HOST] = list;
        chrome.storage.local.set({ hiddenSelectors });
      });
      cleanup();
    };

    const onKey = (ev) => { if (ev.key === 'Escape') { swallow(ev); cleanup(); } };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach((t) => window.addEventListener(t, swallow, true));
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'startPicker') startPicker();
  });

  // --- 設定の読み込みと反映 ---
  chrome.storage.local.get({ disabledHosts: [], hiddenSelectors: {}, features: {}, mode: 'standard' }, ({ disabledHosts, hiddenSelectors, features, mode: m }) => {
    Object.assign(FEATURES, features);
    mode = m === 'strong' ? 'strong' : 'standard';
    try {
      chrome.storage.session.get({ aggressiveHosts: [] }).then(({ aggressiveHosts }) => {
        if (aggressiveHosts.includes(HOST) && !detected) { detected = true; applyFlagAttrs(); scan(); }
      }).catch(() => {});
    } catch (e) { /* ignore */ }
    applyFlagAttrs();
    if (isDisabledFor(HOST, disabledHosts)) {
      off = true;
      root.setAttribute('data-pab-off', '1');
    }
    applyHidden(hiddenSelectors);
    scan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.aggressiveHosts && !detected) {
      const l = changes.aggressiveHosts.newValue || [];
      if (l.includes(HOST)) { detected = true; applyFlagAttrs(); scan(); }
      return;
    }
    if (area !== 'local') return;
    if (changes.hiddenSelectors) applyHidden(changes.hiddenSelectors.newValue);
    if (changes.features) {
      Object.assign(FEATURES, changes.features.newValue || {});
      applyFlagAttrs();
    }
    if (changes.mode) {
      mode = changes.mode.newValue === 'strong' ? 'strong' : 'standard';
      applyFlagAttrs();
      scan();
    }
  });

  // 未捕捉のエラーも記録
  window.addEventListener('error', (e) => {
    if (e && e.filename && e.filename.indexOf(chrome.runtime.id) !== -1) reportError('content', e.error || e.message);
  });
})();
