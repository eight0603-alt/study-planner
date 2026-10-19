'use strict';
// ═══════════════════════════════════════════════════════════════════════
//  Google 行事曆 page: embeds the person's own Google Calendar(s).
//  Settings (calendar IDs, view) are saved per project like everything else.
// ═══════════════════════════════════════════════════════════════════════
const GCAL_MODES = [['MONTH', '月'], ['WEEK', '週'], ['AGENDA', '列表']];

function gcalCfg() {
  const c = storage('gcal-cfg') || {};
  if (!Array.isArray(c.ids)) c.ids = [];
  if (!c.mode) c.mode = 'MONTH';
  return c;
}
function gcalSave(c) { storage('gcal-cfg', c); }
function gcalUrl(c) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei';
  const p = new URLSearchParams({ ctz: tz, wkst: '2', mode: c.mode, showTitle: '0', showPrint: '0', showTabs: '1', showCalendars: '1', hl: 'zh_TW' });
  c.ids.forEach(id => p.append('src', id));
  return 'https://calendar.google.com/calendar/embed?' + p.toString();
}
function renderGcal() {
  const c = gcalCfg();
  // Suggest the signed-in Google account as the first calendar
  const suggested = (typeof syncUser !== 'undefined' && syncUser && syncUser.email) || '';
  const root = document.getElementById('gcalBody');
  const esc2 = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  document.getElementById('gcalModes').innerHTML = GCAL_MODES.map(([m, l]) =>
    `<button class="gcal-mode${c.mode === m ? ' on' : ''}" onclick="gcalSetMode('${m}')">${l}</button>`).join('');
  const idsHtml = c.ids.map((id, i) => `<span class="gcal-chip">${esc2(id)}<button title="移除" onclick="gcalRemove(${i})">✕</button></span>`).join('');
  document.getElementById('gcalIds').innerHTML = `
    ${idsHtml}
    <input id="gcalNewId" class="todo-input field-input gcal-input" type="text" placeholder="輸入日曆 ID（通常是你的 Gmail）" value="${c.ids.length ? '' : esc2(suggested)}"
      onkeydown="if(event.key==='Enter')gcalAdd()">
    <button class="cancel-btn" onclick="gcalAdd()">＋ 加入</button>`;
  if (!c.ids.length) {
    root.dataset.src = '';
    root.innerHTML = `<div class="gcal-empty">
      <p>輸入你的 Google 日曆 ID 就能在這裡看到 Google 行事曆。</p>
      <p class="ps-hint">個人主要日曆的 ID 就是你的 Gmail 地址。其他日曆的 ID：Google 日曆 → 該日曆的「設定和共用」→「整合日曆」→「日曆 ID」。</p>
    </div>`;
    return;
  }
  const url = gcalUrl(c);
  if (root.dataset.src !== url) {
    root.dataset.src = url;
    root.innerHTML = `<iframe class="gcal-frame" src="${url}" frameborder="0" scrolling="no"></iframe>
      <p class="ps-hint gcal-note">看不到行程？要在這個瀏覽器先登入同一個 Google 帳號。Safari 可能會擋住嵌入的私人日曆，可以改用 Chrome，或按右上角「在 Google 開啟」。</p>`;
  }
}
function gcalAdd() {
  const el = document.getElementById('gcalNewId');
  const id = (el && el.value || '').trim();
  if (!id) return;
  const c = gcalCfg();
  if (!c.ids.includes(id)) c.ids.push(id);
  gcalSave(c); renderGcal();
}
function gcalRemove(i) { const c = gcalCfg(); c.ids.splice(i, 1); gcalSave(c); renderGcal(); }
function gcalSetMode(m) { const c = gcalCfg(); c.mode = m; gcalSave(c); renderGcal(); }
