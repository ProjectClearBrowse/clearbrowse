// サービスワーカー:
// ・サイトごとの停止を declarativeNetRequest の許可ルールに反映
// ・タブごとのブロック数を保持
// ・エラーを端末内のログに記録(外部へは送信しません)
// ・初回インストール時に案内ページを開く

// コンテンツスクリプトからも、一時的な保存領域(ブラウザを閉じると消えます)を使えるようにする
try { chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }); } catch (e) { /* ignore */ }

const ALLOW_RULE_BASE = 10000;
const MAX_LOG = 50;

// --- エラーログ(端末内のみ) ---
let logQueue = Promise.resolve();
function logError(entry) {
  logQueue = logQueue.then(async () => {
    const { errorLog = [] } = await chrome.storage.local.get({ errorLog: [] });
    errorLog.push({
      t: Date.now(),
      src: String(entry.src || '').slice(0, 30),
      message: String(entry.message || '').slice(0, 300),
      stack: String(entry.stack || '').slice(0, 600),
    });
    while (errorLog.length > MAX_LOG) errorLog.shift();
    await chrome.storage.local.set({ errorLog });
  }).catch(() => {});
  return logQueue;
}

self.addEventListener('error', (e) => {
  logError({ src: 'background', message: e.message, stack: e.error && e.error.stack });
});
self.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  logError({ src: 'background', message: (r && r.message) || String(r), stack: r && r.stack });
});

// --- サイトごとの停止 ---
async function syncAllowRules() {
  const { disabledHosts = [] } = await chrome.storage.local.get({ disabledHosts: [] });
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  const addRules = disabledHosts.map((host, i) => ({
    id: ALLOW_RULE_BASE + i,
    priority: 100,
    action: { type: 'allowAllRequests' },
    condition: {
      requestDomains: [host],
      resourceTypes: ['main_frame', 'sub_frame'],
    },
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

async function setup() {
  try {
    chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
    await syncAllowRules();
  } catch (e) {
    logError({ src: 'background:setup', message: e.message, stack: e.stack });
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  setup();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#welcome') });
  }
});
chrome.runtime.onStartup.addListener(setup);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.disabledHosts) {
    syncAllowRules().catch((e) => logError({ src: 'background:sync', message: e.message, stack: e.stack }));
  }
});

// --- タブごとのカウント(ポップアップ/オーバーレイ等) ---
let countQueue = Promise.resolve();
function updateCounts(fn) {
  countQueue = countQueue.then(async () => {
    const { counts = {} } = await chrome.storage.session.get('counts');
    fn(counts);
    await chrome.storage.session.set({ counts });
  }).catch(() => {});
  return countQueue;
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;
  if (msg.type === 'blocked' && sender.tab) {
    const id = String(sender.tab.id);
    updateCounts((c) => { c[id] = (c[id] || 0) + 1; });
  } else if (msg.type === 'area' && sender.tab && sender.frameId === 0) {
    const id = String(sender.tab.id);
    chrome.storage.session.get('areas').then(({ areas = {} }) => {
      areas[id] = msg.pct;
      return chrome.storage.session.set({ areas });
    }).catch(() => {});
  } else if (msg.type === 'error') {
    logError({ src: msg.src, message: msg.message, stack: msg.stack });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.storage.session.get('since').then(({ since = {} }) => {
      since[String(tabId)] = Date.now() - 1000;
      return chrome.storage.session.set({ since });
    }).catch(() => {});
    chrome.storage.session.get('areas').then(({ areas = {} }) => {
      delete areas[String(tabId)];
      return chrome.storage.session.set({ areas });
    }).catch(() => {});
    updateCounts((c) => { delete c[String(tabId)]; });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  updateCounts((c) => { delete c[String(tabId)]; });
});
