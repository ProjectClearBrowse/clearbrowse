// ページ本体の JavaScript 環境(MAIN world)で動くスクリプト。
// ・window.open によるポップアップ/ポップアンダーを無効化
// ・画面外で作った <a target=_blank> の click() による新規タブを無効化
// ・WebSocket 経由で届く広告フレームを無視
// ページ側にエラーを漏らさないよう、すべて try/catch で囲む。
(() => {
  'use strict';

  const attr = (n) => {
    const r = document.documentElement;
    return r ? r.getAttribute(n) : null;
  };
  const isOff = () => attr('data-pab-off') === '1';
  const popupOn = () => !isOff() && attr('data-pab-f-popup') !== '0';
  const wsOn = () => !isOff() && attr('data-pab-f-ws') !== '0';

  const strong = () => attr('data-pab-strong') === '1';

  // 標準の設定では、利用者のクリック直後に開かれる、ログイン用の小さなウィンドウや、同じサイト内のウィンドウは許可する。
  // 強力な設定(成人向けサイトなど)では、すべて遮断する。
  const legitOpen = (args) => {
    try {
      const active = navigator.userActivation && navigator.userActivation.isActive;
      if (!active) return false;
      const url = args[0];
      if (url === undefined || url === null || url === '' || String(url) === 'about:blank') return true;
      if (new URL(String(url), location.href).origin === location.origin) return true;
      return typeof args[2] === 'string' && args[2].trim() !== ''; // ウィンドウの大きさ指定がある(ログイン画面など)
    } catch (e) { return false; }
  };

  const post = (kind, extra) => {
    try {
      window.postMessage(Object.assign({ __pab: true, kind }, extra || {}), '*');
    } catch (e) { /* ignore */ }
  };
  const reportErr = (e) => post('error', {
    message: String((e && e.message) || e).slice(0, 300),
    stack: String((e && e.stack) || '').slice(0, 600),
  });

  // window.open が返す「偽ウィンドウ」。null を返すと別の手段で遷移するサイトがあるため、開けたふりをする。
  const makeStub = () => {
    const noop = () => {};
    return {
      closed: true,
      focus: noop,
      blur: noop,
      close: noop,
      postMessage: noop,
      location: { href: 'about:blank', assign: noop, replace: noop },
      document: { write: noop, writeln: noop, open: noop, close: noop },
    };
  };

  try {
    const origOpen = window.open;
    Object.defineProperty(window, 'open', {
      configurable: false,
      enumerable: true,
      get() {
        return function open(...args) {
          try {
            if (!popupOn()) return origOpen.apply(window, args);
            if (!strong() && legitOpen(args)) return origOpen.apply(window, args);
            post('popup');
            return makeStub();
          } catch (e) {
            reportErr(e);
            return origOpen.apply(window, args);
          }
        };
      },
      set() { /* スクリプトによる上書きを無視 */ },
    });
  } catch (e) { reportErr(e); }

  try {
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(...args) {
      try {
        if (popupOn() && !this.isConnected) {
          const t = (this.target || '').toLowerCase();
          if (t === '_blank' || t === '_new') {
            post('popup');
            return undefined;
          }
        }
      } catch (e) { reportErr(e); }
      return origClick.apply(this, args);
    };
  } catch (e) { reportErr(e); }

  // WebSocket 経由で配信される広告フレーム(zone_id + 画像/動画データ)を無視する。
  try {
    const OrigWS = window.WebSocket;
    if (OrigWS && OrigWS.prototype) {
      const isAdMsg = (d) =>
        typeof d === 'string' && d.length > 200 && /zone_id/.test(d) &&
        /(base64|media_type|image\/(jpeg|png|gif|webp)|video\/mp4)/i.test(d);

      const wrap = (fn) => {
        if (typeof fn !== 'function') return fn;
        try {
          if (!fn.__pabWrapped) {
            Object.defineProperty(fn, '__pabWrapped', {
              value: function (ev) {
                try {
                  if (wsOn() && ev && isAdMsg(ev.data)) { post('popup'); return undefined; }
                } catch (e) { reportErr(e); }
                return fn.call(this, ev);
              },
            });
          }
          return fn.__pabWrapped;
        } catch (e) {
          return fn;
        }
      };

      const proto = OrigWS.prototype;
      const origAdd = proto.addEventListener;
      const origRemove = proto.removeEventListener;
      proto.addEventListener = function (type, fn, opts) {
        return origAdd.call(this, type, type === 'message' ? wrap(fn) : fn, opts);
      };
      proto.removeEventListener = function (type, fn, opts) {
        const f = type === 'message' && fn && fn.__pabWrapped ? fn.__pabWrapped : fn;
        return origRemove.call(this, type, f, opts);
      };
      const desc = Object.getOwnPropertyDescriptor(proto, 'onmessage');
      if (desc && desc.set) {
        Object.defineProperty(proto, 'onmessage', {
          configurable: true,
          enumerable: desc.enumerable,
          get: desc.get,
          set(fn) { desc.set.call(this, wrap(fn)); },
        });
      }
    }
  } catch (e) { reportErr(e); }
})();
