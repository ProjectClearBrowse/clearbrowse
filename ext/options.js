const $ = (id) => document.getElementById(id);

const FEATURE_DEFS = [
  { key: 'popup', title: 'ポップアップ・新規タブの自動表示を止める', desc: 'クリックしていないのに開く別ウィンドウや別タブを防ぎます。ログイン用の小窓が開かないときは、このサイトだけ止めてください。' },
  { key: 'overlay', title: '透明なクリック乗っ取りを防ぐ', desc: '画面全体を覆う透明な板で、クリックを広告に奪うしくみを取り除きます。' },
  { key: 'floating', title: '画面の隅に固定された広告を消す', desc: '画面の端に張り付いて動かない、外部サイトの広告を取り除きます。' },
  { key: 'inline', title: 'ページ内のバナー広告を消す', desc: '標準的な広告サイズのバナー枠を隠します。広告ではない表示が消えるときは、この項目を切ってください。' },
  { key: 'ws', title: 'WebSocket で届く広告を止める', desc: '通常の通信を避けて配信される広告データを無視します。' },
];

let features = {};

function fmtTime(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- ブロックする内容 ----------
function renderFeatures() {
  const box = $('features');
  box.textContent = '';
  FEATURE_DEFS.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.className = 'switch';
    const text = document.createElement('span');
    const b = document.createElement('b');
    b.textContent = f.title;
    const small = document.createElement('small');
    small.textContent = f.desc;
    text.append(b, small);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = features[f.key] !== false;
    input.addEventListener('change', async () => {
      features[f.key] = input.checked;
      await chrome.storage.local.set({ features });
    });
    const track = document.createElement('span');
    track.className = 'track';
    track.setAttribute('aria-hidden', 'true');
    label.append(text, input, track);
    row.append(label);
    box.append(row);
  });
}

// ---------- サイト一覧 ----------
function renderList(ul, items, emptyText, onRemove, removeText) {
  ul.textContent = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = emptyText;
    ul.append(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = item.label;
    const btn = document.createElement('button');
    btn.textContent = removeText;
    btn.addEventListener('click', () => onRemove(item));
    li.append(span, btn);
    ul.append(li);
  });
}

async function renderSites() {
  const { disabledHosts = [], hiddenSelectors = {} } =
    await chrome.storage.local.get({ disabledHosts: [], hiddenSelectors: {} });

  renderList(
    $('disabledList'),
    disabledHosts.map((h) => ({ label: h, host: h })),
    'ブロックを止めているサイトはありません。',
    async (it) => {
      const cur = (await chrome.storage.local.get({ disabledHosts: [] })).disabledHosts;
      await chrome.storage.local.set({ disabledHosts: cur.filter((h) => h !== it.host) });
      renderSites();
    },
    'ブロックを再開'
  );

  const hosts = Object.keys(hiddenSelectors).filter((h) => (hiddenSelectors[h] || []).length);
  renderList(
    $('hiddenList'),
    hosts.map((h) => ({ label: `${h}(${hiddenSelectors[h].length}件)`, host: h })),
    '手動で消した広告はありません。',
    async (it) => {
      const cur = (await chrome.storage.local.get({ hiddenSelectors: {} })).hiddenSelectors;
      delete cur[it.host];
      await chrome.storage.local.set({ hiddenSelectors: cur });
      renderSites();
    },
    '元に戻す'
  );
}

// ---------- 不具合報告 ----------
async function buildReport() {
  const site = $('rSite').value.trim();
  const text = $('rText').value.trim();
  const lines = [`【${PAB.productName} 不具合報告】`, ''];
  lines.push(`症状: ${text || '(未入力)'}`);
  if (site) lines.push(`発生したサイト: ${site}`);
  if ($('rDiag').checked) {
    const { errorLog = [], features: f = {} } = await chrome.storage.local.get({ errorLog: [], features: {} });
    lines.push('', '--- 診断情報 ---');
    lines.push(`バージョン: ${PAB.version}`);
    lines.push(`ブラウザ: ${navigator.userAgent}`);
    const off = FEATURE_DEFS.filter((d) => f[d.key] === false).map((d) => d.key);
    lines.push(`停止している機能: ${off.length ? off.join(', ') : 'なし'}`);
    lines.push(`エラー記録: ${errorLog.length}件`);
    errorLog.slice(-10).forEach((e) => {
      const firstStack = (e.stack || '').split('\n').slice(0, 2).join(' | ');
      lines.push(`[${fmtTime(e.t)}] ${e.src}: ${e.message}${firstStack ? ' (' + firstStack + ')' : ''}`);
    });
  }
  return lines.join('\n');
}

async function refreshPreview() {
  $('preview').textContent = await buildReport();
}

function status(msg) {
  const el = $('status');
  el.textContent = msg;
  clearTimeout(status.t);
  status.t = setTimeout(() => { el.textContent = ''; }, 4000);
}

async function copyReport() {
  const text = await buildReport();
  try {
    await navigator.clipboard.writeText(text);
    status('報告文をコピーしました。メールや報告フォームに貼り付けてください。');
  } catch (e) {
    $('preview').closest('details').open = true;
    status('コピーできませんでした。下のプレビューから手動でコピーしてください。');
  }
}

function setupReport() {
  ['rSite', 'rText', 'rDiag'].forEach((id) => $(id).addEventListener('input', refreshPreview));
  $('rDiag').addEventListener('change', refreshPreview);
  $('rCopy').addEventListener('click', copyReport);

  if (PAB.repoUrl) {
    $('rIssue').hidden = false;
    $('rIssue').addEventListener('click', async () => {
      const body = (await buildReport()).slice(0, 6000);
      const url = `${PAB.repoUrl}/issues/new?title=${encodeURIComponent('不具合: ' + ($('rSite').value.trim() || 'サイト名未記入'))}&body=${encodeURIComponent(body)}`;
      window.open(url, '_blank', 'noopener');
    });
  }
  if (PAB.contactEmail) {
    $('rMail').hidden = false;
    $('rMail').addEventListener('click', async () => {
      const body = (await buildReport()).slice(0, 1800);
      const url = `mailto:${PAB.contactEmail}?subject=${encodeURIComponent(PAB.productName + ' 不具合報告')}&body=${encodeURIComponent(body)}`;
      window.open(url, '_blank', 'noopener');
    });
  }
  $('rClear').addEventListener('click', async () => {
    await chrome.storage.local.set({ errorLog: [] });
    status('エラーログを消しました。');
    refreshPreview();
  });
}

// ---------- 初期化 ----------
(async () => {
  document.title = PAB.productName + ' 設定';
  $('name').textContent = PAB.productName;
  $('ver').textContent = 'バージョン ' + PAB.version;
  if (location.hash === '#welcome') $('welcome').hidden = false;

  const stored = await chrome.storage.local.get({ features: {} });
  features = stored.features || {};
  renderFeatures();
  await renderSites();
  setupReport();
  refreshPreview();

  if (PAB.donateUrl) {
    $('donateSec').hidden = false;
    $('donate').href = PAB.donateUrl;
  }

  // 提供者情報とリンク(未設定の項目は表示しない)
  if (PAB.authorName) $('provider').textContent = `提供: ${PAB.authorName}`;
  const links = $('links');
  const add = (label, url) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    if (links.childNodes.length) links.append(' / ');
    links.append(a);
  };
  add('公式サイト', PAB.siteUrl);
  add('プライバシーポリシー', PAB.privacyUrl);
  add('サポート', PAB.supportUrl);
  add('ソースコード', PAB.repoUrl);
})();
