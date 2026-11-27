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

function setState(on) {
  const el = $('state');
  el.textContent = on ? 'ブロック中' : '停止中(このサイトでは何も止めません)';
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
    $('host').textContent = 'このページでは使えません';
    $('state').textContent = 'ウェブサイト(http / https)のページで使えます。';
    $('toggle').disabled = true;
    $('pick').disabled = true;
    $('reset').disabled = true;
    return;
  }
  $('host').textContent = host;

  const { disabledHosts = [] } = await chrome.storage.local.get({ disabledHosts: [] });
  const on = !disabledHosts.includes(host);
  $('toggle').checked = on;
  setState(on);

  const { counts = {} } = await chrome.storage.session.get('counts');
  $('count').textContent = String(counts[String(tab.id)] || 0);

  $('toggle').addEventListener('change', async () => {
    const checked = $('toggle').checked;
    const cur = (await chrome.storage.local.get({ disabledHosts: [] })).disabledHosts;
    const next = checked ? cur.filter((h) => h !== host) : Array.from(new Set([...cur, host]));
    await chrome.storage.local.set({ disabledHosts: next });
    setState(checked);
    // 許可ルールの反映を待ってから再読み込み
    setTimeout(() => chrome.tabs.reload(tab.id), 300);
  });

  $('pick').addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'startPicker' }, { frameId: 0 });
      window.close();
    } catch (e) {
      const m = $('pickMsg');
      m.textContent = 'このページではまだ使えません。ページを再読み込みしてから、もう一度押してください。';
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
