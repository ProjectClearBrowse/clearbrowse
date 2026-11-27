// 提供者情報。ビルド時に project.config.json の値が入ります。
// 未設定の項目は画面上で自動的に非表示になります(置き換え前でも動作します)。
const PAB = (() => {
  const raw = {
    productName: 'クリアブラウズ',
    authorName: 'ProjectClearBrowse',
    contactEmail: 'projectclearbrowse@gmail.com',
    repoUrl: 'https://github.com/ProjectClearBrowse/clearbrowse',
    donateUrl: '',
    siteUrl: 'https://projectclearbrowse.github.io/clearbrowse',
  };
  const isSet = (v) => typeof v === 'string' && v.trim() !== '' && v.indexOf('{' + '{') === -1;
  const cfg = {};
  Object.keys(raw).forEach((k) => { cfg[k] = isSet(raw[k]) ? raw[k].trim() : ''; });
  if (!cfg.productName) cfg.productName = 'クリアブラウズ';
  cfg.siteUrl = cfg.siteUrl.replace(/\/+$/, '');
  cfg.repoUrl = cfg.repoUrl.replace(/\/+$/, '');
  cfg.privacyUrl = cfg.siteUrl ? cfg.siteUrl + '/privacy.html' : '';
  cfg.supportUrl = cfg.siteUrl ? cfg.siteUrl + '/support.html' : '';
  cfg.version = chrome.runtime.getManifest().version;
  return cfg;
})();
