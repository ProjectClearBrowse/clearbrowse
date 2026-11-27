// 「コピー」ボタン。chrome:// のアドレスは、ウェブページのリンクからは開けないため、コピーして貼り付けてもらう。
(() => {
  document.querySelectorAll('button[data-copy]').forEach((btn) => {
    const target = document.getElementById(btn.dataset.copy);
    if (!target) return;
    const original = btn.textContent;
    btn.addEventListener('click', async () => {
      const text = target.textContent.trim();
      let done = false;
      try {
        await navigator.clipboard.writeText(text);
        done = true;
      } catch (e) {
        // 古い環境用: 文字を選択状態にして、コピーを試す
        const r = document.createRange();
        r.selectNodeContents(target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        try { done = document.execCommand('copy'); } catch (x) { done = false; }
      }
      btn.textContent = done ? 'コピーしました' : '選択しました。Ctrl + C でコピー';
      setTimeout(() => { btn.textContent = original; }, 2500);
    });
  });
})();
