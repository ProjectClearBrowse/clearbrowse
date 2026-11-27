const $ = (id) => document.getElementById(id);

const FEATURE_DEFS = [
  { key: 'popup', title: 'ポップアップ・新規タブの自動表示をブロックする', desc: 'クリックしていないのに開く、別ウィンドウや別タブを防ぎます。ログイン用の小さなウィンドウが開かない場合は、そのサイトのみブロックを停止してください。' },
  { key: 'overlay', title: '透明な板によるクリックの乗っ取りをブロックする', desc: '画面全体を覆う透明な板を取り除き、クリックが広告に奪われないようにします。強力なページで動作します。' },
  { key: 'floating', title: '画面の隅などに固定された広告を非表示にする', desc: '画面の端に固定されている広告を非表示にします。標準では、広告配信元のものだけが対象です。' },
  { key: 'inline', title: 'ページ内のバナー広告を非表示にする', desc: 'ページ内のバナー広告を非表示にします。標準では、広告配信元のものだけが対象で、強力では、標準的な広告サイズのバナーも対象です。広告ではない表示が消えてしまう場合は、この項目をオフにしてください。' },
  { key: 'ws', title: 'WebSocket で配信される広告をブロックする', desc: '通常の通信とは別の方法で配信される広告データを、表示しないようにします。' },
];

const LIST_DEFS = [
  { key: 'easylist', def: true, title: '広告', desc: '世界中のサイトの、広告を配信する会社や広告の部品への通信をブロックします(EasyList に基づきます)。' },
  { key: 'easyprivacy', def: true, title: 'トラッカー', desc: '閲覧を追跡する仕組み(アクセス解析など)への通信をブロックします(EasyPrivacy に基づきます)。まれに、一部の機能が動かなくなるサイトがございます。' },
  { key: 'annoyance', def: false, title: '迷惑な表示', desc: 'SNS のボタン、Cookie の同意バナー、ニュースレターへの誘導などをブロックします(Fanboy’s Annoyance List に基づきます)。SNS でログインするボタンなどが動かなくなる場合がございます。' },
];
let lists = {};

function renderLists() {
  const box = $('lists');
  box.textContent = '';
  LIST_DEFS.forEach((f) => {
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
    input.checked = f.key in lists ? lists[f.key] : f.def;
    input.addEventListener('change', async () => {
      lists[f.key] = input.checked;
      await chrome.storage.local.set({ lists });
    });
    const track = document.createElement('span');
    track.className = 'track';
    track.setAttribute('aria-hidden', 'true');
    label.append(text, input, track);
    row.append(label);
    box.append(row);
  });
}

let features = {};
let mode = 'standard';

const MODE_DEFS = [
  { key: 'standard', title: '標準(おすすめ)', desc: '広告会社への通信をブロックし、広告であることが明らかなものだけを非表示にします。ページの表示が崩れにくい設定です。' },
  { key: 'strong', title: '強力', desc: '大きさ・位置・外部へのリンクなど、ページの見た目からも広告を判断して非表示にします。しつこい広告が残るサイト向けです。広告ではない表示が、消えてしまう場合もございます。' },
];

function renderModes() {
  const box = $('modes');
  box.textContent = '';
  MODE_DEFS.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;gap:12px;align-items:flex-start;cursor:pointer';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'mode';
    input.checked = mode === m.key;
    input.style.cssText = 'margin-top:4px;flex:none';
    input.addEventListener('change', async () => {
      mode = m.key;
      await chrome.storage.local.set({ mode });
    });
    const text = document.createElement('span');
    const b = document.createElement('b');
    b.textContent = m.title;
    const small = document.createElement('small');
    small.style.display = 'block';
    small.textContent = m.desc;
    text.append(b, small);
    label.append(input, text);
    row.append(label);
    box.append(row);
  });
}

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
    'ブロックを停止しているサイトはございません。',
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
    '手動で非表示にした広告はございません。',
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
    const { mode: md = 'standard' } = await chrome.storage.local.get({ mode: 'standard' });
    lines.push(`ブロックの強さ: ${md}`);
    const { hideLog = [] } = await chrome.storage.session.get({ hideLog: [] });
    lines.push(`非表示にした要素の記録(直近${Math.min(hideLog.length, 15)}件・ブラウザを閉じると消えます):`);
    hideLog.slice(-15).forEach((h) => {
      lines.push(`[${fmtTime(h.t)}] ${h.reason} <${h.tag}> ${h.w}x${h.h}${h.host ? ' ' + h.host : ''}${h.strong ? ' (強力)' : ''}`);
    });
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
    status('報告文をコピーいたしました。メールや報告ページに貼り付けて、お送りください。');
  } catch (e) {
    $('preview').closest('details').open = true;
    status('コピーできませんでした。お手数ですが、下のプレビューから手動でコピーしてください。');
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
    status('エラーログを削除いたしました。');
    refreshPreview();
  });
}

// ---------- 初期化 ----------
(async () => {
  document.title = PAB.productName + ' 設定';
  $('name').textContent = PAB.productName;
  $('ver').textContent = 'バージョン ' + PAB.version;
  if (location.hash === '#welcome') $('welcome').hidden = false;

  const stored = await chrome.storage.local.get({ features: {}, mode: 'standard', lists: {} });
  lists = stored.lists || {};
  features = stored.features || {};
  mode = stored.mode === 'strong' ? 'strong' : 'standard';
  renderModes();
  renderLists();
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
