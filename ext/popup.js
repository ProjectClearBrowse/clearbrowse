const $ = (id) => document.getElementById(id);

function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function setState(on, strong) {
  const el = $('state');
  el.textContent = on ? (strong ? 'ブロック中(強力)' : 'ブロック中(標準)') : '停止中(このサイトではブロックいたしません)';
  el.classList.toggle('off', !on);
}

(async () => {
  $('name').textContent = PAB.productName;
  document.title = PAB.productName;
  $('ver').textContent = 'バージョン ' + PAB.version;
  if (PAB.donateUrl) {
    const a = $('donate');
    a.href = PAB.donateUrl;
    a.hidden = false;
  }
  $('options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = hostOf(tab && tab.url);

  if (!host) {
    $('host').textContent = 'このページではご利用いただけません';
    $('state').textContent = 'ウェブサイト(http / https)のページでご利用いただけます。';
    $('toggle').disabled = true;
    $('pick').disabled = true;
    $('reset').disabled = true;
    return;
  }
  $('host').textContent = host;

  const { disabledHosts = [], mode = 'standard' } = await chrome.storage.local.get({ disabledHosts: [], mode: 'standard' });
  const { aggressiveHosts = [] } = await chrome.storage.session.get({ aggressiveHosts: [] });
  const adult = (self.PAB_ADNETS ? self.PAB_ADNETS.adultHosts : []).some((d) => host === d || host.endsWith('.' + d));
  const strong = mode === 'strong' || adult || aggressiveHosts.includes(host);
  const on = !disabledHosts.includes(host);
  $('toggle').checked = on;
  setState(on, strong);

  const { counts = {} } = await chrome.storage.session.get('counts');
  $('count').textContent = String(counts[String(tab.id)] || 0);
  try {
    const { areas = {} } = await chrome.storage.session.get('areas');
    const p = areas[String(tab.id)] || 0;
    $('areaPct').textContent = (p < 10 && p > 0 ? p.toFixed(1) : Math.round(p)) + '%';
  } catch (e) { /* 取得できない場合は 0% のまま */ }
  try {
    const { since = {} } = await chrome.storage.session.get('since');
    const info = await chrome.declarativeNetRequest.getMatchedRules({
      tabId: tab.id,
      minTimeStamp: since[String(tab.id)] || 0,
    });
    const n = info.rulesMatchedInfo.length;
    $('netCount').textContent = String(n);
  } catch (e) { /* 取得できない場合は 0 のまま */ }

  $('toggle').addEventListener('change', async () => {
    const checked = $('toggle').checked;
    const cur = (await chrome.storage.local.get({ disabledHosts: [] })).disabledHosts;
    const next = checked ? cur.filter((h) => h !== host) : Array.from(new Set([...cur, host]));
    await chrome.storage.local.set({ disabledHosts: next });
    setState(checked, strong);
    // 許可ルールの反映を待ってから再読み込み
    setTimeout(() => chrome.tabs.reload(tab.id), 300);
  });

  $('pick').addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'startPicker' }, { frameId: 0 });
      window.close();
    } catch (e) {
      const m = $('pickMsg');
      m.textContent = 'このページでは、まだご利用いただけません。ページを再読み込みしてから、もう一度押してください。';
      m.hidden = false;
    }
  });

  $('reset').addEventListener('click', async () => {
    const { hiddenSelectors = {} } = await chrome.storage.local.get({ hiddenSelectors: {} });
    delete hiddenSelectors[host];
    await chrome.storage.local.set({ hiddenSelectors });
    chrome.tabs.reload(tab.id);
    window.close();
  });
})();
