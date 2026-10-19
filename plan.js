'use strict';
// ═══════════════════════════════════════════════════════════════════════
//  Study plan: everything the schedule is built from lives in one config
//  (localStorage "plan-config"). Classes, reviews, fixed events and exam /
//  registration markers are generated from it. Weekdays: 0 = Mon … 6 = Sun.
// ═══════════════════════════════════════════════════════════════════════

let SCHEDULE_DATA = { schedule: {}, courses: [] };
let PLAN = null;          // active config
let PLAN_INFO = {};       // per-course results of the last build

const WD_LABELS = ['一','二','三','四','五','六','日'];
const COLOR_POOL = ['#C9B84A','#9E94D4','#D4896A','#5DB8A8','#7BA7D4','#D47070','#C47A9A','#8A9E6E','#5A8EC4','#82B874','#E3A857','#6FB3D2'];
const MARKER_COLORS = { reg: '#E3A857', exam: '#F85149' };

// The CPA plan this app was first built for — offered as a one-click template.
const TEMPLATE_CPA = {
  exam: { name: '會計師', start: '2027/08/20', end: '2027/08/22', regStart: '', regEnd: '' },
  study: { start: '2026/11/03', end: '2027/08/19' },
  slots: [2, 2, 2, 2, 2, 3, 3],
  keepReview: true,
  hoursPerSession: 2.5,
  courses: [
    { name: '中等會計學',     color: '#C9B84A', total: 70, per: 2, mode: 'weekly', days: [0, 4], start: '', end: '', review: true,  reviewEnd: '' },
    { name: '高等會計學',     color: '#9E94D4', total: 40, per: 1, mode: 'weekly', days: [2, 4], start: '', end: '', review: true,  reviewEnd: '' },
    { name: '成本管理會計學', color: '#D4896A', total: 40, per: 1, mode: 'weekly', days: [1, 4], start: '', end: '', review: true,  reviewEnd: '' },
    { name: '審計學',         color: '#5DB8A8', total: 40, per: 1, mode: 'weekly', days: [3, 4], start: '', end: '', review: true,  reviewEnd: '' },
    { name: '稅法',           color: '#7BA7D4', total: 30, per: 1, mode: 'weekly', days: [5],    start: '', end: '', review: false, reviewEnd: '' },
    { name: '國文',           color: '#D47070', total: 10, per: 1, mode: 'weekly', days: [5],    start: '', end: '', review: false, reviewEnd: '' },
    { name: '證券交易法',     color: '#C47A9A', total: 10, per: 1, mode: 'weekly', days: [6],    start: '', end: '', review: true,  reviewEnd: '' },
    { name: '商業會計法',     color: '#8A9E6E', total: 10, per: 1, mode: 'weekly', days: [6],    start: '', end: '', review: true,  reviewEnd: '' },
    { name: '稅法(二)',       color: '#5A8EC4', total: 25, per: 1, mode: 'weekly', days: [6],    start: '2027/01/17', end: '', review: false, reviewEnd: '' },
    { name: '公司法',         color: '#82B874', total: 10, per: 1, mode: 'weekly', days: [6],    start: '2027/01/17', end: '', review: true,  reviewEnd: '' },
  ],
  appts: [
    { name: '瑜伽', color: '#5EAA6E', weekday: 5, every: 1, first: '2026/11/07', time: '9:30-11:30' },
    { name: '美甲', color: '#C4678A', weekday: 5, every: 4, first: '2026/11/07', time: '13:00-15:00' },
  ],
};

function blankPlan() {
  return {
    exam: { name: '', start: '', end: '', regStart: '', regEnd: '' },
    study: { start: todayStr(), end: '' },
    slots: [2, 2, 2, 2, 2, 3, 3],
    keepReview: true,
    hoursPerSession: 2.5,
    courses: [],
    appts: [],
  };
}
const clone = o => JSON.parse(JSON.stringify(o));
const wdOf = ds => (parseDate(ds).getDay() + 6) % 7;
const dayAfter = (ds, n) => fmtDate(addDays(parseDate(ds), n));
const isDs = s => /^\d{4}\/\d{2}\/\d{2}$/.test(s || '');

// Normalise anything loaded or typed into a well-formed config
function normalizePlan(p) {
  const b = blankPlan();
  p = Object.assign(b, p || {});
  p.exam = Object.assign(blankPlan().exam, p.exam || {});
  p.study = Object.assign({ start: '', end: '' }, p.study || {});
  p.slots = Array.from({ length: 7 }, (_, i) => Math.max(0, Math.min(8, parseInt((p.slots || [])[i], 10) || 0)));
  p.hoursPerSession = parseFloat(p.hoursPerSession) > 0 ? parseFloat(p.hoursPerSession) : 2.5;
  p.courses = (p.courses || []).map((c, i) => ({
    name: String(c.name || '').trim() || `科目${i + 1}`,
    color: c.color || COLOR_POOL[i % COLOR_POOL.length],
    total: Math.max(1, parseInt(c.total, 10) || 1),
    per: Math.max(1, parseInt(c.per, 10) || 1),
    mode: c.mode === 'even' ? 'even' : 'weekly',
    days: (c.days || []).map(Number).filter(d => d >= 0 && d <= 6).sort(),
    start: isDs(c.start) ? c.start : '',
    end: isDs(c.end) ? c.end : '',
    review: c.review !== false,
    reviewEnd: isDs(c.reviewEnd) ? c.reviewEnd : '',
  }));
  p.appts = (p.appts || []).map((a, i) => ({
    name: String(a.name || '').trim() || `行程${i + 1}`,
    color: a.color || '#D29922',
    weekday: Math.max(0, Math.min(6, parseInt(a.weekday, 10) || 0)),
    every: Math.max(1, parseInt(a.every, 10) || 1),
    first: isDs(a.first) ? a.first : '',
    time: String(a.time || '').trim(),
  }));
  return p;
}
function studyEnd(p) {
  if (isDs(p.study.end)) return p.study.end;
  if (isDs(p.exam.start)) return dayAfter(p.exam.start, -1);
  return '';
}
function apptLabel(a) { return a.time ? `${a.name}（${a.time}）` : a.name; }
function apptColor(name) {
  if (!PLAN) return '#D29922';
  const a = PLAN.appts.find(x => apptLabel(x) === name || x.name === name);
  if (a) return a.color;
  if (/報名/.test(name)) return MARKER_COLORS.reg;
  if (/考試/.test(name)) return MARKER_COLORS.exam;
  return '#D29922';
}
function examDateObj() { return PLAN && isDs(PLAN.exam.start) ? parseDate(PLAN.exam.start) : null; }

// ── Build the whole schedule from a config ───────────────────────────────
// frozen: { ds: [events] } days that must stay exactly as they were
function buildSchedule(p, frozen) {
  frozen = frozen || {};
  const out = {}, info = {};
  const start = p.study.start, end = studyEnd(p);
  const courses = p.courses;
  courses.forEach(c => info[c.name] = { first: null, last: null, scheduled: 0, missing: 0, reviews: 0 });
  if (!isDs(start) || !isDs(end) || start > end) {
    courses.forEach(c => info[c.name].missing = c.total);
    return { schedule: addFixedEvents(p, out, frozen), info };
  }
  const days = [];
  for (let ds = start; ds <= end; ds = dayAfter(ds, 1)) days.push(ds);

  // Sessions already taken on frozen days
  const done = {}; courses.forEach(c => done[c.name] = 0);
  Object.values(frozen).forEach(list => list.forEach(e => {
    if (e.type !== 'class' || !(e.course in done)) return;
    const m = /第(\d+)(?:-(\d+))?堂/.exec(e.label || '');
    if (m) done[e.course] = Math.max(done[e.course], +(m[2] || m[1]));
  }));

  const classSlots = ds => { const s = p.slots[wdOf(ds)] || 0; return s === 0 ? 0 : (p.keepReview && s > 1 ? s - 1 : s); };
  const classesOn = {};               // ds -> [course names] in order
  const used = {};                    // ds -> class slots used
  const sessionRange = {};            // `${ds}|${course}` -> [a,b]
  const take = (ds, c) => {
    const a = done[c.name] + 1, b = Math.min(done[c.name] + c.per, c.total);
    done[c.name] = b;
    (classesOn[ds] = classesOn[ds] || []).push(c.name);
    used[ds] = (used[ds] || 0) + 1;
    sessionRange[`${ds}|${c.name}`] = [a, b];
    const inf = info[c.name];
    if (!inf.first || ds < inf.first) inf.first = ds;
    if (!inf.last || ds > inf.last) inf.last = ds;
  };
  // Frozen days keep their classes
  days.forEach(ds => {
    if (!frozen[ds]) return;
    frozen[ds].filter(e => e.type === 'class').forEach(e => {
      (classesOn[ds] = classesOn[ds] || []).push(e.course);
      used[ds] = (used[ds] || 0) + 1;
      const inf = info[e.course];
      if (inf) { if (!inf.first || ds < inf.first) inf.first = ds; if (!inf.last || ds > inf.last) inf.last = ds; }
    });
  });
  const inRange = (c, ds) => (!c.start || ds >= c.start) && (!c.end || ds <= c.end);

  // 1) Weekly courses: each day, courses that meet that weekday; if too many, take turns
  const lastContest = {};
  days.forEach(ds => {
    if (frozen[ds]) return;
    const free = classSlots(ds) - (used[ds] || 0);
    if (free <= 0) return;
    const wd = wdOf(ds);
    let el = courses.filter(c => c.mode === 'weekly' && c.days.includes(wd) && inRange(c, ds) && done[c.name] < c.total);
    if (el.length > free) {
      const order = c => courses.indexOf(c);
      el = el.slice().sort((a, b) => {
        const la = lastContest[a.name] || '', lb = lastContest[b.name] || '';
        return la === lb ? order(a) - order(b) : (la < lb ? -1 : 1);
      }).slice(0, free).sort((a, b) => order(a) - order(b));
      el.forEach(c => lastContest[c.name] = ds);
    }
    el.forEach(c => take(ds, c));
  });

  // 2) Even courses: spread the remaining meetings evenly over their allowed days
  courses.filter(c => c.mode === 'even').forEach(c => {
    const left = Math.ceil((c.total - done[c.name]) / c.per);
    if (left <= 0) return;
    const allowed = c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6];
    const cand = days.filter(ds => !frozen[ds] && inRange(c, ds) && allowed.includes(wdOf(ds)) && classSlots(ds) - (used[ds] || 0) > 0);
    const picks = [];
    if (cand.length <= left) picks.push(...cand);
    else for (let i = 0; i < left; i++) picks.push(cand[left === 1 ? 0 : Math.round(i * (cand.length - 1) / (left - 1))]);
    picks.forEach(ds => take(ds, c));
  });
  courses.forEach(c => { info[c.name].missing = c.total - done[c.name]; info[c.name].scheduled = done[c.name]; });

  // 3) Reviews: first the courses taught the day before, then take turns
  const reviewOn = (c, ds) => c.review && (!c.reviewEnd || ds <= c.reviewEnd);
  const byName = {}; courses.forEach(c => byName[c.name] = c);
  const firstClass = {}; days.forEach(ds => (classesOn[ds] || []).forEach(n => { if (!(n in firstClass)) firstClass[n] = ds; }));
  const cnt = {}, lr = {}; courses.forEach(c => cnt[c.name] = 0);
  const gap = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const reviewsOn = {};
  days.forEach(ds => {
    let picks = [];
    if (frozen[ds]) picks = frozen[ds].filter(e => e.type === 'review').map(e => e.course);
    else {
      const slots = Math.max(0, (p.slots[wdOf(ds)] || 0) - (classesOn[ds] || []).length);
      if (!slots) return;
      const ok = n => byName[n] && reviewOn(byName[n], ds);
      const prev = (classesOn[dayAfter(ds, -1)] || []).filter(ok);
      prev.sort((a, b) => { const A = lr[a] || start, B = lr[b] || start; return A < B ? -1 : A > B ? 1 : cnt[a] - cnt[b]; });
      prev.slice(0, slots).forEach(n => picks.push(n));
      while (picks.length < slots) {
        const el = courses.map(c => c.name).filter(n => ok(n) && firstClass[n] && firstClass[n] < ds && !picks.includes(n) && !(classesOn[ds] || []).includes(n));
        if (!el.length) break;
        const key = n => [(!(n in lr) || gap(lr[n], ds) >= 5) ? 0 : 1, cnt[n], firstClass[n]];
        el.sort((a, b) => { const A = key(a), B = key(b); for (let k = 0; k < 3; k++) { if (A[k] < B[k]) return -1; if (A[k] > B[k]) return 1; } return 0; });
        picks.push(el[0]);
      }
    }
    if (!picks.length) return;
    reviewsOn[ds] = picks.map(n => { cnt[n] = (cnt[n] || 0) + 1; lr[n] = ds; if (info[n]) info[n].reviews++; return { course: n, label: `第${cnt[n]}次複習`, progress: '—', type: 'review', note: '' }; });
  });

  // Assemble: classes, reviews, (fixed events added below)
  days.forEach(ds => {
    if (frozen[ds]) { if (frozen[ds].length) out[ds] = clone(frozen[ds]); return; }
    const list = [];
    (classesOn[ds] || []).forEach(n => {
      const c = byName[n], [a, b] = sessionRange[`${ds}|${n}`];
      list.push({ course: n, label: a === b ? `第${a}堂` : `第${a}-${b}堂`, progress: `${b}/${c.total}`, type: 'class', note: b === c.total ? '最後一堂' : '' });
    });
    (reviewsOn[ds] || []).forEach(r => list.push(r));
    if (list.length) out[ds] = list;
  });
  return { schedule: addFixedEvents(p, out, frozen), info };
}

// Fixed weekly events + registration / exam markers (not on frozen days)
function addFixedEvents(p, out, frozen) {
  const add = (ds, ev) => { if (frozen[ds]) return; (out[ds] = out[ds] || []).push(ev); };
  const horizon = studyEnd(p) || [p.exam.end, p.exam.start].filter(isDs).sort().pop() || '';
  p.appts.forEach(a => {
    if (!isDs(a.first) || !horizon) return;
    let ds = a.first;
    while (wdOf(ds) !== a.weekday) ds = dayAfter(ds, 1);
    for (; ds <= horizon; ds = dayAfter(ds, 7 * a.every)) add(ds, { course: apptLabel(a), label: '—', progress: '—', type: 'appt', note: '' });
  });
  const ex = p.exam;
  if (isDs(ex.regStart)) add(ex.regStart, { course: `📝 ${ex.name || ''}報名開始`, label: '—', progress: '—', type: 'appt', note: '' });
  if (isDs(ex.regEnd)) add(ex.regEnd, { course: `📝 ${ex.name || ''}報名截止`, label: '—', progress: '—', type: 'appt', note: '' });
  if (isDs(ex.start)) {
    const last = isDs(ex.end) && ex.end >= ex.start ? ex.end : ex.start;
    for (let ds = ex.start, i = 1; ds <= last; ds = dayAfter(ds, 1), i++)
      add(ds, { course: `🎯 ${ex.name || ''}考試${last > ex.start ? ' Day ' + i : ''}`, label: '—', progress: '—', type: 'appt', note: '' });
  }
  return out;
}

function applyPlan(p) {
  PLAN = normalizePlan(p);
  const built = buildSchedule(PLAN, storage('plan-frozen') || {});
  PLAN_INFO = built.info;
  SCHEDULE_DATA = { schedule: built.schedule, courses: PLAN.courses.map(c => ({ name: c.name, total: c.total, color: c.color, sessions_done: 0 })) };
}

// First load: existing users keep the CPA plan; new users start blank
function initPlan() {
  let cfg = storage('plan-config');
  if (!cfg) {
    const legacy = Object.keys(localStorage).some(k => /^(bullets-|completed-|hidden-|moved-|custom-|tevents-|dnotes-|habit-|review-settings|sync-cal-daily-v1)/.test(k));
    if (legacy) {
      cfg = clone(TEMPLATE_CPA);
      const rv = storage('review-settings');         // carry over the short-lived review dialog settings
      if (rv) cfg.courses.forEach(c => { if (rv[c.name]) { c.review = !!rv[c.name].on; c.reviewEnd = rv[c.name].end && rv[c.name].end !== '2027/08/19' ? rv[c.name].end : ''; } });
      storage('plan-config', cfg);
    }
  }
  applyPlan(cfg || blankPlan());
  return !!cfg;
}

// ── Changing the plan without losing marks ────────────────────────────────
function eventIdentity(ev) { return ev.type === 'review' ? `review|${ev.course}` : `${ev.type}|${ev.course}|${ev.label}`; }
function remapDayState(ds, oldArr, newArr) {
  const usedIdx = new Set(), map = {};
  oldArr.forEach((ev, i) => {
    const j = newArr.findIndex((e, k) => !usedIdx.has(k) && eventIdentity(e) === eventIdentity(ev));
    if (j >= 0) { usedIdx.add(j); map[i] = j; }
  });
  const hidden = storage(`hidden-${ds}`);
  if (hidden) storage(`hidden-${ds}`, hidden.filter(i => i in map).map(i => map[i]));
  const doneList = storage(`completed-${ds}`);
  if (doneList) storage(`completed-${ds}`, doneList.map(k => {
    const m = /^builtin-(\d+)$/.exec(k); if (!m) return k;
    return (+m[1] in map) ? `builtin-${map[+m[1]]}` : null;
  }).filter(Boolean));
  if (storage(`order-${ds}`)) storage(`order-${ds}`, null);
}
// Days already opened on the daily page: unstarted items follow the new plan, ticked ones stay
function syncDayBullets(ds, newArr) {
  if (!storage(`bullets-seeded-${ds}`)) return;
  let bullets = getBullets(ds);
  const has = (b, e) => bulletMatchesEvent(b, e);
  bullets = bullets.filter(b => !(b.ref && b.status === 'todo' && !newArr.some(e => has(b, e))));
  newArr.forEach(e => {
    if (!bullets.some(b => has(b, e)))
      bullets.push({ text: eventBulletText(ds, e), status: 'todo', ref: { course: e.course, type: e.type, label: e.label } });
  });
  saveBullets(ds, bullets);
}
function savePlan(newCfg) {
  const today = todayStr();
  const oldSched = SCHEDULE_DATA.schedule;
  const hadPlan = !!storage('plan-config');
  const frozen = storage('plan-frozen') || {};
  if (hadPlan && PLAN && isDs(PLAN.study.start)) {
    for (let ds = PLAN.study.start; ds < today && ds <= (studyEnd(PLAN) || today); ds = dayAfter(ds, 1))
      if (!(ds in frozen)) frozen[ds] = clone(oldSched[ds] || []);
    Object.keys(oldSched).forEach(ds => { if (ds < today && !(ds in frozen)) frozen[ds] = clone(oldSched[ds]); });
  }
  storage('plan-frozen', frozen);
  storage('plan-config', normalizePlan(newCfg));
  applyPlan(newCfg);
  const newSched = SCHEDULE_DATA.schedule;
  new Set([...Object.keys(oldSched), ...Object.keys(newSched)]).forEach(ds => {
    const a = oldSched[ds] || [], b = newSched[ds] || [];
    const sig = l => l.map(e => eventIdentity(e) + '#' + e.label).join('§');
    if (sig(a) === sig(b)) return;
    remapDayState(ds, a, b);
    if (ds >= today) syncDayBullets(ds, b);
  });
}

// ═══════════════════════ Settings screen ═══════════════════════════════
let planDraft = null;
let planJustSaved = false;
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const iso = ds => (ds || '').replace(/\//g, '-');
const fromIsoDate = v => (v || '').replace(/-/g, '/');

function openPlanSettings(section) {
  planDraft = clone(PLAN);
  switchView('settings');
  if (section) setTimeout(() => { const el = document.getElementById(`plan-sec-${section}`); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: 'smooth' }); }, 50);
  else window.scrollTo(0, 0);
}
function renderSettings() {
  if (!planDraft) planDraft = clone(PLAN);
  const p = planDraft, root = document.getElementById('planSettings');
  const dateIn = (path, val, extra = '') => `<input class="todo-input field-input ps-date" type="date" value="${iso(val)}" data-path="${path}" onchange="planSet(this)" ${extra}>`;
  root.innerHTML = `
  <div class="ps-card" id="plan-sec-exam">
    <h2 class="panel-title">考試與讀書期間</h2>
    <div class="ps-grid">
      <label class="field-label">考試名稱</label>
      <input class="todo-input field-input" type="text" placeholder="例：會計師、高考三級" value="${esc(p.exam.name)}" data-path="exam.name" oninput="planSet(this)">
      <label class="field-label">考試日期</label>
      <div class="ps-range">${dateIn('exam.start', p.exam.start)}<span>～</span>${dateIn('exam.end', p.exam.end)}</div>
      <label class="field-label">報名期間</label>
      <div class="ps-range">${dateIn('exam.regStart', p.exam.regStart)}<span>～</span>${dateIn('exam.regEnd', p.exam.regEnd)}</div>
      <label class="field-label">讀書期間</label>
      <div class="ps-range">${dateIn('study.start', p.study.start)}<span>～</span>${dateIn('study.end', p.study.end)}</div>
      <label class="field-label">每堂時數</label>
      <div class="ps-range"><input class="todo-input field-input ps-num" type="number" min="0.5" step="0.5" value="${p.hoursPerSession}" data-path="hoursPerSession" oninput="planSet(this)"><span class="ps-hint">小時（用來計算儀表板的學習時數）</span></div>
    </div>
    <p class="ps-hint">讀書期間的結束日留空時，會自動排到考試前一天。</p>
  </div>

  <div class="ps-card" id="plan-sec-slots">
    <h2 class="panel-title">每天可讀書的時段數</h2>
    <div class="ps-slots">${WD_LABELS.map((w, i) => `<label><span>${w}</span><input class="todo-input field-input ps-num" type="number" min="0" max="8" value="${p.slots[i]}" data-path="slots.${i}" oninput="planSet(this)"></label>`).join('')}</div>
    <label class="ps-check"><input type="checkbox" ${p.keepReview ? 'checked' : ''} data-path="keepReview" onchange="planSet(this)"> 有上課的日子至少保留 1 個時段複習</label>
    <p class="ps-hint">每個時段排一堂課或一次複習。上完課剩下的時段會自動排複習。</p>
  </div>

  <div class="ps-card" id="plan-sec-courses">
    <h2 class="panel-title">科目 <span class="ps-hint" style="margin-left:8px">上方科目優先排課</span></h2>
    <div id="psCourses">${p.courses.map((c, i) => courseCard(c, i)).join('') || '<p class="empty-state">還沒有科目，按下方「＋ 新增科目」開始</p>'}</div>
    <button class="cancel-btn" onclick="planAddCourse()">＋ 新增科目</button>
  </div>

  <div class="ps-card" id="plan-sec-appts">
    <h2 class="panel-title">固定行程</h2>
    <p class="ps-hint" style="margin-top:-6px">定期的個人行程（運動、看診⋯），只標在行事曆上，不佔讀書時段。</p>
    <div id="psAppts">${p.appts.map((a, i) => apptRow(a, i)).join('') || '<p class="empty-state">沒有固定行程</p>'}</div>
    <button class="cancel-btn" onclick="planAddAppt()">＋ 新增固定行程</button>
  </div>

  <div class="ps-actions">
    <span id="psSummary" class="ps-hint"></span>
    <button class="cancel-btn" onclick="planUseTemplate()">套用會計師範本</button>
    <button class="cancel-btn" onclick="planDraft=clone(PLAN);renderSettings()">放棄修改</button>
    <button class="small-btn" style="padding:6px 18px" onclick="planSave()">儲存並重新排課</button>
  </div>`;
  updatePlanPreview();
}
function courseCard(c, i) {
  const p = `courses.${i}`;
  const dayChips = WD_LABELS.map((w, d) => `<button type="button" class="ps-day${c.days.includes(d) ? ' on' : ''}" onclick="planToggleDay(${i},${d})">${w}</button>`).join('');
  return `<div class="ps-course" style="border-left-color:${c.color}">
    <div class="ps-row">
      <input type="color" class="ps-color" value="${c.color}" data-path="${p}.color" onchange="planSet(this);this.closest('.ps-course').style.borderLeftColor=this.value">
      <input class="todo-input field-input ps-name" type="text" value="${esc(c.name)}" placeholder="科目名稱" data-path="${p}.name" oninput="planSet(this)">
      <span class="ps-lbl">總堂數</span><input class="todo-input field-input ps-num" type="number" min="1" value="${c.total}" data-path="${p}.total" oninput="planSet(this)">
      <span class="ps-lbl">每次</span><input class="todo-input field-input ps-num" type="number" min="1" value="${c.per}" data-path="${p}.per" oninput="planSet(this)"><span class="ps-lbl">堂</span>
      <span class="ps-tools">
        <button class="ev-action-btn" title="往上" onclick="planMoveCourse(${i},-1)">↑</button>
        <button class="ev-action-btn" title="往下" onclick="planMoveCourse(${i},1)">↓</button>
        <button class="ev-action-btn ev-del-btn" title="刪除" onclick="planDelCourse(${i})">✕</button>
      </span>
    </div>
    <div class="ps-row">
      <select class="ev-type-select" data-path="${p}.mode" onchange="planSet(this);renderSettings()">
        <option value="weekly" ${c.mode === 'weekly' ? 'selected' : ''}>每週固定上課日</option>
        <option value="even" ${c.mode === 'even' ? 'selected' : ''}>期間內平均分配</option>
      </select>
      <span class="ps-days">${dayChips}</span>
      <span class="ps-hint">${c.mode === 'weekly' ? '選上課的星期' : '可上課的星期（不選＝每天）'}</span>
    </div>
    <div class="ps-row">
      <span class="ps-lbl">${c.mode === 'even' ? '分配期間' : '開始／結束'}</span>
      <input class="todo-input field-input ps-date" type="date" value="${iso(c.start)}" data-path="${p}.start" onchange="planSet(this)">
      <span>～</span>
      <input class="todo-input field-input ps-date" type="date" value="${iso(c.end)}" data-path="${p}.end" onchange="planSet(this)">
      <label class="ps-check"><input type="checkbox" ${c.review ? 'checked' : ''} data-path="${p}.review" onchange="planSet(this)"> 排複習</label>
      <span class="ps-lbl">複習到</span>
      <input class="todo-input field-input ps-date" type="date" value="${iso(c.reviewEnd)}" data-path="${p}.reviewEnd" onchange="planSet(this)">
    </div>
    <div class="ps-result" id="psRes${i}"></div>
  </div>`;
}
function apptRow(a, i) {
  const p = `appts.${i}`;
  return `<div class="ps-row ps-appt">
    <input type="color" class="ps-color" value="${a.color}" data-path="${p}.color" onchange="planSet(this)">
    <input class="todo-input field-input ps-name" type="text" value="${esc(a.name)}" placeholder="名稱" data-path="${p}.name" oninput="planSet(this)">
    <span class="ps-lbl">每</span><input class="todo-input field-input ps-num" type="number" min="1" value="${a.every}" data-path="${p}.every" oninput="planSet(this)"><span class="ps-lbl">週的星期</span>
    <select class="ev-type-select" data-path="${p}.weekday" onchange="planSet(this)">${WD_LABELS.map((w, d) => `<option value="${d}" ${a.weekday === d ? 'selected' : ''}>${w}</option>`).join('')}</select>
    <span class="ps-lbl">從</span><input class="todo-input field-input ps-date" type="date" value="${iso(a.first)}" data-path="${p}.first" onchange="planSet(this)">
    <input class="todo-input field-input ps-time" type="text" placeholder="時間 例 9:30-11:30" value="${esc(a.time)}" data-path="${p}.time" oninput="planSet(this)">
    <button class="ev-action-btn ev-del-btn" title="刪除" onclick="planDelAppt(${i})">✕</button>
  </div>`;
}
// Write one field from an input into the draft
function planSet(el) {
  planJustSaved = false;
  const path = el.dataset.path.split('.');
  let o = planDraft;
  for (let i = 0; i < path.length - 1; i++) o = o[isNaN(path[i]) ? path[i] : +path[i]];
  const k = path[path.length - 1];
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'date') v = fromIsoDate(el.value);
  else if (el.type === 'number') v = el.value === '' ? '' : +el.value;
  else if (el.tagName === 'SELECT' && /^\d+$/.test(el.value)) v = +el.value;
  else v = el.value;
  o[isNaN(k) ? k : +k] = v;
  updatePlanPreview();
}
function planToggleDay(i, d) { planJustSaved = false;
  const days = planDraft.courses[i].days;
  const at = days.indexOf(d);
  if (at >= 0) days.splice(at, 1); else days.push(d);
  days.sort();
  renderSettings();
}
function planAddCourse() { planJustSaved = false;
  const n = planDraft.courses.length;
  planDraft.courses.push({ name: '', color: COLOR_POOL[n % COLOR_POOL.length], total: 10, per: 1, mode: 'weekly', days: [], start: '', end: '', review: true, reviewEnd: '' });
  renderSettings();
  const cards = document.querySelectorAll('.ps-course'); const last = cards[cards.length - 1];
  if (last) { window.scrollTo({ top: last.getBoundingClientRect().top + window.scrollY - 120 }); last.querySelector('.ps-name').focus({ preventScroll: true }); }
}
function planDelCourse(i) { planJustSaved = false; planDraft.courses.splice(i, 1); renderSettings(); }
function planMoveCourse(i, dir) { planJustSaved = false;
  const j = i + dir, cs = planDraft.courses;
  if (j < 0 || j >= cs.length) return;
  [cs[i], cs[j]] = [cs[j], cs[i]];
  renderSettings();
}
function planAddAppt() { planJustSaved = false;
  planDraft.appts.push({ name: '', color: '#D29922', weekday: 5, every: 1, first: todayStr(), time: '' });
  renderSettings();
}
function planDelAppt(i) { planJustSaved = false; planDraft.appts.splice(i, 1); renderSettings(); }
function planUseTemplate() { planJustSaved = false;
  if (planDraft.courses.length && !confirm('套用會計師範本會取代目前的科目和固定行程設定，確定嗎？')) return;
  planDraft = clone(TEMPLATE_CPA);
  renderSettings();
}
let previewTimer = null;
function updatePlanPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const p = normalizePlan(clone(planDraft));
    const { info } = buildSchedule(p, storage('plan-frozen') || {});
    let warn = 0;
    planDraft.courses.forEach((c, i) => {
      const el = document.getElementById(`psRes${i}`); if (!el) return;
      const n = p.courses[i] ? p.courses[i].name : c.name;
      const r = info[n];
      if (!r) { el.textContent = ''; return; }
      if (p.courses[i].mode === 'weekly' && !p.courses[i].days.length) { el.innerHTML = `<span class="ps-warn">⚠ 請選擇上課的星期</span>`; warn++; return; }
      const span = r.first ? `${r.first} 開始 → ${r.last} 上完` : '尚未排到課';
      const rv = p.courses[i].review ? `・複習 ${r.reviews} 次` : '・不排複習';
      el.innerHTML = r.missing > 0
        ? `<span class="ps-warn">⚠ 讀書期間內排不下，還差 ${r.missing} 堂</span>　${r.first ? span.replace(' 上完', ' 為止') : ''}`
        : `${span}${rv}`;
      if (r.missing > 0) warn++;
    });
    const s = document.getElementById('psSummary');
    if (s && planJustSaved) s.innerHTML = '<span style="color:var(--accent-2)">✓ 已儲存，課表已重新排好</span>';
    else if (s) {
      const end = studyEnd(p);
      s.innerHTML = !isDs(p.study.start) || !end ? '<span class="ps-warn">請設定讀書期間或考試日期</span>'
        : warn ? `<span class="ps-warn">${warn} 個科目需要調整</span>` : `${p.courses.length} 個科目都排得下`;
    }
  }, 120);
}
function planSave() {
  const p = normalizePlan(clone(planDraft));
  const names = p.courses.map(c => c.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) { alert(`科目名稱「${dup}」重複了，請改成不同的名稱`); return; }
  savePlan(p);
  planDraft = clone(PLAN);
  planJustSaved = true;
  renderCountdown();
  renderSettings();
  const w = document.getElementById('welcomeModal'); if (w) w.classList.remove('open');
}

// ── First-time welcome ───────────────────────────────────────────────────
function showWelcome() { document.getElementById('welcomeModal').classList.add('open'); }
function welcomeStart() { document.getElementById('welcomeModal').classList.remove('open'); openPlanSettings('exam'); }
function welcomeTemplate() {
  document.getElementById('welcomeModal').classList.remove('open');
  planDraft = clone(TEMPLATE_CPA);
  switchView('settings');
}
