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
  gcalRenderBar();
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

// ═══════════════════════════════════════════════════════════════════════
//  Conflict check: read Google events (read-only) and warn when a planned
//  class / review overlaps one. Events are cached on this device only.
// ═══════════════════════════════════════════════════════════════════════
const GOOGLE_CLIENT_ID = '298555378416-ggnorq909mu8r3sqre6j36jpc14fbebt.apps.googleusercontent.com';   // ← OAuth web client ID from Google Cloud
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const GCAL_CACHE_KEY = 'sp-gcal-cache', GCAL_TOKEN_KEY = 'sp-gcal-token';
const GCAL_AHEAD_DAYS = 120, GCAL_ALERT_DAYS = 14;
let gcalTokenClient = null, gcalBusy = false, gcalLastError = '';

const gcalRaw = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
function gcalCache() { return gcalRaw(GCAL_CACHE_KEY); }
function gcalToken() { const t = gcalRaw(GCAL_TOKEN_KEY); return t && t.exp > Date.now() + 60000 ? t.token : null; }
function gcalCheckEnabled() { return !!GOOGLE_CLIENT_ID; }

function gcalLoadGis() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client';
    s.onload = ok; s.onerror = () => fail(new Error('GIS load failed')); document.head.appendChild(s);
  });
}
// Needs a click (Google opens a small window). Afterwards events are fetched.
async function gcalConnect() {
  if (!gcalCheckEnabled()) return;
  try { await gcalLoadGis(); } catch (e) { alert('無法載入 Google 登入元件'); return; }
  if (!gcalTokenClient) gcalTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID, scope: GCAL_SCOPE,
    callback: resp => {
      if (resp.error) { gcalLastError = resp.error; gcalRenderBar(); return; }
      gcalRaw(GCAL_TOKEN_KEY, { token: resp.access_token, exp: Date.now() + (resp.expires_in || 3600) * 1000 });
      gcalRefresh(true);
    },
  });
  const hint = (typeof syncUser !== 'undefined' && syncUser && syncUser.email) || undefined;
  gcalTokenClient.requestAccessToken({ prompt: gcalCache() ? '' : 'consent', hint });
}
function gcalDisconnect() {
  const t = gcalRaw(GCAL_TOKEN_KEY);
  if (t && window.google && google.accounts && google.accounts.oauth2) try { google.accounts.oauth2.revoke(t.token, () => {}); } catch (e) {}
  gcalRaw(GCAL_TOKEN_KEY, null); gcalRaw(GCAL_CACHE_KEY, null);
  gcalRenderBar(); gcalRerenderViews();
}
// Refresh button: use the token if still valid, otherwise ask Google again (needs the click)
function gcalRefreshClick() { if (gcalToken()) gcalRefresh(true); else gcalConnect(); }

async function gcalRefresh(showAlert) {
  const token = gcalToken(); if (!token || gcalBusy) return;
  gcalBusy = true; gcalLastError = ''; gcalRenderBar();
  const from = addDays(new Date(), -1), to = addDays(new Date(), GCAL_AHEAD_DAYS);
  from.setHours(0, 0, 0, 0);
  const ids = gcalCfg().ids.length ? gcalCfg().ids : ['primary'];
  const events = [];
  try {
    for (const id of ids) {
      let pageToken = '';
      do {
        const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '2500',
          fields: 'nextPageToken,items(summary,start,end,status,transparency)' });
        if (pageToken) q.set('pageToken', pageToken);
        const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${q}`, { headers: { Authorization: 'Bearer ' + token } });
        if (r.status === 401) { gcalRaw(GCAL_TOKEN_KEY, null); throw new Error('授權已過期，請重新連結'); }
        if (!r.ok) throw new Error(r.status === 404 ? `找不到日曆「${id}」` : `Google 回應錯誤 ${r.status}`);
        const j = await r.json();
        (j.items || []).forEach(ev => {
          if (ev.status === 'cancelled' || ev.transparency === 'transparent') return;
          if (!ev.start || !ev.start.dateTime || !ev.end || !ev.end.dateTime) return;   // all-day events are not checked
          gcalSplitByDay(new Date(ev.start.dateTime), new Date(ev.end.dateTime)).forEach(s => events.push({ ...s, title: ev.summary || '（無標題）' }));
        });
        pageToken = j.nextPageToken || '';
      } while (pageToken);
    }
    gcalRaw(GCAL_CACHE_KEY, { at: Date.now(), from: fmtDate(from), to: fmtDate(to), events });
  } catch (e) { gcalLastError = e.message || String(e); console.error(e); }
  gcalBusy = false;
  gcalRenderBar(); gcalRerenderViews();
  if (showAlert) gcalShowAlert(true);
}
// A timed event split into per-day pieces with HH:MM start/end
function gcalSplitByDay(a, b) {
  const out = [], hm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  let day = new Date(a); day.setHours(0, 0, 0, 0);
  while (day < b) {
    const next = addDays(day, 1);
    const s = a > day ? a : day, e = b < next ? b : next;
    if (e > s) out.push({ ds: fmtDate(day), start: hm(s), end: e.getTime() === next.getTime() ? '24:00' : hm(e) });
    day = next;
  }
  return out;
}
function gcalEventsOn(ds) { const c = gcalCache(); return c ? c.events.filter(e => e.ds === ds) : []; }
// Planned study items on a day that overlap a Google event
function gcalConflictsOn(ds) {
  const g = gcalEventsOn(ds); if (!g.length) return [];
  const out = [];
  allEventsOn(ds).forEach(({ ev }) => {
    if (ev.type !== 'class' && ev.type !== 'review') return;
    const t = eventTime(ds, ev); if (!t) return;
    g.forEach(x => { if (t.start < x.end && x.start < t.end) out.push({ ds, ours: { name: ev.course + (ev.label && ev.label !== '—' ? ' ' + ev.label : ''), start: t.start, end: t.end }, theirs: x }); });
  });
  return out;
}
const gcalConflictKey = c => `${c.ds}|${c.ours.name}|${c.theirs.title}|${c.theirs.start}`;

// Pop-up: upcoming conflicts (once per browser session unless asked)
function gcalShowAlert(force) {
  if (!gcalCache()) return;
  if (!force) { try { if (sessionStorage.getItem('sp-gcal-alerted')) return; } catch (e) {} }
  const dismissed = storage('gcal-dismissed') || [];
  const list = [];
  for (let i = 0; i < GCAL_ALERT_DAYS; i++) gcalConflictsOn(fmtDate(addDays(new Date(), i))).forEach(c => { if (!dismissed.includes(gcalConflictKey(c))) list.push(c); });
  try { sessionStorage.setItem('sp-gcal-alerted', '1'); } catch (e) {}
  const m = document.getElementById('conflictModal');
  if (!list.length) { if (force && m) m.classList.remove('open'); return; }
  const age = Math.round((Date.now() - gcalCache().at) / 3600000);
  document.getElementById('conflictList').innerHTML = list.map(c => {
    const d = parseDate(c.ds);
    return `<div class="cf-row">
      <div class="cf-date">${c.ds.slice(5)}（${WEEKDAYS_CN[d.getDay()]}）</div>
      <div class="cf-body">
        <div><span class="cf-tag cf-ours">課表</span>${c.ours.start}–${c.ours.end}　${String(c.ours.name).replace(/</g, '&lt;')}</div>
        <div><span class="cf-tag cf-g">Google</span>${c.theirs.start}–${c.theirs.end}　${String(c.theirs.title).replace(/</g, '&lt;')}</div>
      </div>
      <div class="cf-acts">
        <button class="cancel-btn" onclick="document.getElementById('conflictModal').classList.remove('open');switchView('daily');gotoDaily('${c.ds}')">前往</button>
        <button class="cancel-btn" onclick="gcalDismiss('${encodeURIComponent(gcalConflictKey(c))}')">略過</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('conflictMeta').textContent = `未來 ${GCAL_ALERT_DAYS} 天有 ${list.length} 個衝突・Google 行程更新於${age < 1 ? '剛剛' : ` ${age} 小時前`}`;
  m.classList.add('open');
}
function gcalDismiss(encKey) {
  const k = decodeURIComponent(encKey), d = storage('gcal-dismissed') || [];
  if (!d.includes(k)) d.push(k);
  storage('gcal-dismissed', d.slice(-300));
  gcalShowAlert(true); gcalRerenderViews();
}

// Month calendar: mark conflicting days
function gcalMarkCell(td, ds) {
  const cs = gcalConflictsOn(ds); if (!cs.length) return;
  td.classList.add('gcal-conflict');
  const b = document.createElement('div'); b.className = 'cf-badge';
  b.textContent = `⚠ 與 Google 衝突`;
  b.title = cs.map(c => `${c.ours.start} ${c.ours.name}  ↔  ${c.theirs.start} ${c.theirs.title}`).join('\n');
  td.insertBefore(b, td.children[1] || null);
}
// Daily page: banner for the day shown
function gcalRenderDailyBanner(ds) {
  const el = document.getElementById('dailyConflicts'); if (!el) return;
  const cs = gcalConflictsOn(ds), g = gcalEventsOn(ds);
  if (!cs.length && !g.length) { el.innerHTML = ''; return; }
  el.innerHTML = (cs.length ? `<div class="cf-banner">⚠ 這天有 ${cs.length} 個時段和 Google 行程衝突：${cs.map(c => `<b>${c.ours.start}–${c.ours.end} ${String(c.ours.name).replace(/</g, '&lt;')}</b> ↔ ${c.theirs.start}–${c.theirs.end} ${String(c.theirs.title).replace(/</g, '&lt;')}`).join('；')}</div>` : '')
    + (g.length ? `<div class="cf-gday">Google 行程：${g.map(x => `${x.start}–${x.end} ${String(x.title).replace(/</g, '&lt;')}`).join('・')}</div>` : '');
}
function gcalRerenderViews() {
  try {
    const v = document.querySelector('.view.active'); if (!v) return;
    if (v.id === 'view-calendar') renderCalendar();
    if (v.id === 'view-daily') gcalRenderDailyBanner(dailyDate);
  } catch (e) { console.error(e); }
}
// Status bar on the Google 行事曆 page
function gcalRenderBar() {
  const el = document.getElementById('gcalCheckBar'); if (!el) return;
  if (!gcalCheckEnabled()) { el.innerHTML = ''; return; }
  const c = gcalCache();
  if (!c) { el.innerHTML = `<span>衝突檢查：連結後會比對課表和 Google 行程，有撞到會提醒你。</span><button class="small-btn" style="padding:4px 12px" onclick="gcalConnect()">連結 Google 日曆</button>`; return; }
  const age = Math.round((Date.now() - c.at) / 60000);
  const ago = age < 1 ? '剛剛' : age < 60 ? `${age} 分鐘前` : `${Math.round(age / 60)} 小時前`;
  el.innerHTML = `<span>${gcalBusy ? '更新 Google 行程中…' : `衝突檢查：已連結・行程更新於${ago}（比對未來 ${GCAL_AHEAD_DAYS} 天）`}</span>
    ${gcalLastError ? `<span class="ps-warn">${gcalLastError}</span>` : ''}
    <button class="cancel-btn" onclick="gcalRefreshClick()">重新整理</button>
    <button class="cancel-btn" onclick="gcalShowAlert(true)">查看衝突</button>
    <button class="cancel-btn" onclick="gcalDisconnect()">中斷連結</button>`;
}
// On page load: show conflicts from the last fetch; refresh quietly if the token is still valid
function gcalStartup() {
  if (!gcalCheckEnabled()) return;
  if (gcalToken()) gcalRefresh(false).then(() => gcalShowAlert(false));
  else gcalShowAlert(false);
}
