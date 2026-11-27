// トップページの見本。スイッチで、広告を表示した状態と止めた状態を切り替える。
(() => {
  const stage = document.getElementById('stage');
  const toggle = document.getElementById('demoToggle');
  const count = document.getElementById('demoCount');
  const label = document.getElementById('demoLabel');
  if (!stage || !toggle) return;

  const TOTAL = stage.querySelectorAll('.ad').length;

  function apply() {
    const on = toggle.checked;
    stage.dataset.blocked = on ? 'true' : 'false';
    count.textContent = on ? String(TOTAL) : '0';
    label.textContent = on ? 'ブロック中' : 'ブロックなし';
  }
  toggle.addEventListener('change', apply);
  apply();
})();
