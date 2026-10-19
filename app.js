'use strict';

// ── Constants ─────────────────────────────────────
const WEEKDAYS_CN = ['日','一','二','三','四','五','六'];
const MONTHS_CN   = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const BULLET_STATUSES = ['note','todo','done','cancel','scheduled','key'];
const BULLET_SYMBOLS  = {note:'•',todo:'○',done:'✓',cancel:'✕',scheduled:'◎',key:'★'};
const BULLET_CLASSES  = {note:'',todo:'',done:'status-done',cancel:'status-cancel',scheduled:'status-scheduled',key:'status-key'};

// ── State ─────────────────────────────────────────
let calYear    = new Date().getFullYear();
let calMonth   = new Date().getMonth();
let dailyDate  = todayStr();
let habitYear  = new Date().getFullYear();
let habitMonth = new Date().getMonth();
let modalDate  = null;
let dragInfo   = null;  // { ev, fromDs, srcType, srcIdx }

// ── Storage ───────────────────────────────────────
function storage(key, val) {
  if (val === undefined) {
    try { return JSON.parse(localStorage.getItem(projKey(key))); } catch { return null; }
  }
  if (val === null) { localStorage.removeItem(projKey(key)); syncMark(projKey(key)); return; }
  localStorage.setItem(projKey(key), JSON.stringify(val));
  syncMark(projKey(key));
}
function getCustomEvents(ds)        { return storage(`custom-${ds}`) || []; }
function saveCustomEvents(ds, evs)  { storage(`custom-${ds}`, evs); }
function getMovedEvents(ds)         { return storage(`moved-${ds}`)  || []; }
function saveMovedEvents(ds, evs)   { storage(`moved-${ds}`, evs); }
function getCompleted(ds)           { return storage(`completed-${ds}`) || []; }

// ── All events for a day ──────────────────────────
// Returns [{ev, srcType:'builtin'|'moved'|'custom', srcIdx}]
function allEventsOn(ds) {
  const result = [];
  const builtin = SCHEDULE_DATA.schedule[ds] || [];
  const hidden  = storage(`hidden-${ds}`) || [];
  builtin.forEach((ev, i) => {
    if (!hidden.includes(i)) result.push({ev, srcType:'builtin', srcIdx:i});
  });
  getMovedEvents(ds).forEach((ev, i) => result.push({ev, srcType:'moved', srcIdx:i}));
  getCustomEvents(ds).forEach((ev, i) => result.push({ev, srcType:'custom', srcIdx:i}));

  // Sort by start time if available; events without time go last
  result.sort((a, b) => {
    const ta = (eventTime(ds, a.ev)||{}).start || 'ZZ:ZZ';
    const tb = (eventTime(ds, b.ev)||{}).start || 'ZZ:ZZ';
    return ta.localeCompare(tb);
  });

  return result;
}
// Time of an event: set via ⏱ / timeline, else parsed from a name like 瑜伽（9:30-11:30）
function padTime(t){ const [h,m]=t.split(':'); return h.padStart(2,'0')+':'+m; }
function eventTime(ds, ev) {
  const t = getTimeEvents(ds).find(e => e.course === ev.course);
  if (t) return {start:t.start, end:t.end};
  const m = /(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2})/.exec(ev.course||'');
  return m ? {start:padTime(m[1]), end:padTime(m[2])} : null;
}
// Timed entries added on the timeline that don't match any event of that day
function orphanTimeEvents(ds) {
  const names = new Set(allEventsOn(ds).map(x => x.ev.course));
  return getTimeEvents(ds).filter(t => !names.has(t.course));
}
// Legacy compat
function eventsOn(ds) { return allEventsOn(ds).map(x=>x.ev); }

// ── Date helpers ──────────────────────────────────
function todayStr() { return fmtDate(new Date()); }
function fmtDate(d) {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
function parseDate(s) { const [y,m,d]=s.split('/').map(Number); return new Date(y,m-1,d); }
function addDays(d,n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }

// ── Color helpers ─────────────────────────────────
function courseColor(name) {
  const c = SCHEDULE_DATA.courses.find(x=>x.name===name);
  return c ? c.color : (apptColor(name));
}
const TYPE_DEFAULT_COLORS = {class:'#58A6FF', review:'#3FB950', appt:'#D29922'};
function evColor(ev) {
  if (!ev) return '#8B949E';
  if (ev.type==='appt') return apptColor(ev.course);
  const c = SCHEDULE_DATA.courses.find(x=>x.name===ev.course);
  if (c) return c.color;
  return TYPE_DEFAULT_COLORS[ev.type]||'#8B949E';
}
function badgeClass(t) { return t==='class'?'badge-class':t==='review'?'badge-review':'badge-appt'; }
function badgeLabel(t) { return t==='class'?'上課':t==='review'?'複習':'行程'; }

// ── View switcher ─────────────────────────────────
function switchView(view) {
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el=>el.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');
  if (view==='dashboard') renderDashboard();
  if (view==='calendar')  renderCalendar();
  if (view==='daily')     renderDaily();
  if (view==='habits')    renderHabits();
  if (view==='settings')  renderSettings();
  if (view==='gcal')      renderGcal();
}

// ── Countdown ─────────────────────────────────────
function renderCountdown() {
  const el = document.getElementById('examCountdown');
  const today = new Date(); today.setHours(0,0,0,0);
  const ex = examDateObj();
  if (!ex) { el.innerHTML = `<span style="font-size:11px;color:var(--text-3)">尚未設定考試日期</span>`; return; }
  const days = Math.max(0, Math.ceil((ex-today)/86400000));
  const range = PLAN.exam.end && PLAN.exam.end!==PLAN.exam.start ? `${PLAN.exam.start}~${PLAN.exam.end.slice(5)}` : PLAN.exam.start;
  el.innerHTML = `<strong>${days}</strong>天後${esc(PLAN.exam.name||'')}考試<br><span style="font-size:10px;color:var(--text-3)">${range}</span>`;
}

// ── Dashboard ─────────────────────────────────────
// ── Calendar ✓ ⇄ daily ✓ sync ──
function bulletMatchesEvent(b, ev) {
  if (b.ref) return b.ref.course===ev.course && b.ref.type===ev.type && (ev.type==='review' || (b.ref.label||'')===(ev.label||''));
  if (ev.type==='review') return b.text.startsWith(ev.course) && b.text.includes('複習');
  const hasLabel = ev.label && ev.label!=='—';
  return b.text.startsWith(ev.course) && (!hasLabel || b.text.includes(ev.label));
}
function eventBulletText(ds, ev) {
  const tm = eventTime(ds, ev);
  return ev.course + (ev.label && ev.label!=='—' ? '　'+ev.label : '') + (tm ? ` (${tm.start}–${tm.end})` : '');
}
// Calendar → daily: mark the matching daily bullet done / back to todo (adds it if missing)
function setBulletDoneForEvent(ds, ev, done) {
  ensureScheduleBullets(ds);
  const bullets = getBullets(ds);
  const b = bullets.find(x => bulletMatchesEvent(x, ev));
  if (b) b.status = done ? 'done' : (b.status==='done' ? 'todo' : b.status);
  else if (done) bullets.push({text:eventBulletText(ds, ev), status:'done', ref:{course:ev.course, type:ev.type, label:ev.label}});
  saveBullets(ds, bullets);
}
// Daily → calendar: mirror a bullet's done state onto the calendar's completed list
function syncCalendarFromBullet(ds, b) {
  const item = allEventsOn(ds).find(({ev}) => bulletMatchesEvent(b, ev));
  if (!item) return;
  const key = `${item.srcType}-${item.srcIdx}`;
  const list = getCompleted(ds);
  const has = list.includes(key);
  if (b.status==='done' && !has) list.push(key);
  if (b.status!=='done' && has) list.splice(list.indexOf(key), 1);
  storage(`completed-${ds}`, list);
}
// One-time: carry over ✓ already made on the calendar before sync existed
function migrateCalendarDoneToBullets() {
  if (storage('sync-cal-daily-v1')) return;
  for (const lk of projectLocalKeys()) {
    const m=/^completed-(\d{4}\/\d{2}\/\d{2})$/.exec(lk);
    if(!m) continue;
    const ds=m[1], list=getCompleted(ds);
    allEventsOn(ds).forEach(({ev,srcType,srcIdx})=>{ if(list.includes(`${srcType}-${srcIdx}`)) setBulletDoneForEvent(ds, ev, true); });
  }
  storage('sync-cal-daily-v1', true);
}

// ── Progress from the daily page: only bullets marked ✓ 完成 count ──
// Which schedule event a daily bullet stands for (stored ref, or matched from its text for older bullets)
function bulletEventRef(ds, b) {
  if (b.ref) return b.ref;
  for (const {ev} of allEventsOn(ds)) {
    if (ev.type!=='class' && ev.type!=='review') continue;
    const hasLabel = ev.label && ev.label!=='—';
    const hit = ev.type==='review' ? (b.text.startsWith(ev.course) && b.text.includes('複習'))
                                   : (b.text.startsWith(ev.course) && (!hasLabel || b.text.includes(ev.label)));
    if (hit) return {course:ev.course, type:ev.type, label:ev.label};
  }
  return null;
}
function sessionNumbers(label) {
  const m=/第(\d+)(?:-(\d+))?堂/.exec(label||'');
  if(!m) return [];
  const a=+m[1], b=m[2]?+m[2]:a, out=[];
  for(let i=a;i<=b;i++) out.push(i);
  return out;
}
function computeProgress() {
  const sessions={}, reviews=new Set();
  SCHEDULE_DATA.courses.forEach(c=>sessions[c.name]=new Set());
  for (const key of projectLocalKeys()) {
    const m=/^bullets-(\d{4}\/\d{2}\/\d{2})$/.exec(key||'');
    if(!m) continue;
    const ds=m[1];
    (storage(key)||[]).forEach(b=>{
      if(b.status!=='done') return;
      const ref=bulletEventRef(ds,b);
      if(!ref) return;
      if(ref.type==='class' && sessions[ref.course]) sessionNumbers(ref.label).forEach(n=>sessions[ref.course].add(n));
      if(ref.type==='review') reviews.add(ds+'|'+ref.course);
    });
  }
  const done={}; let totalSessions=0;
  SCHEDULE_DATA.courses.forEach(c=>{ done[c.name]=Math.min(c.total, sessions[c.name].size); totalSessions+=done[c.name]; });
  return {done, totalSessions, reviewCount:reviews.size};
}

function renderDashboard() {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayS = fmtDate(today);
  document.getElementById('dashDate').textContent = `${todayS} 週${WEEKDAYS_CN[today.getDay()]}`;
  const ex = examDateObj();
  document.getElementById('statDaysLeft').textContent = ex ? Math.max(0, Math.ceil((ex-today)/86400000)) : '—';
  const regCard = document.getElementById('statRegCard');
  if (regCard) {
    const rs = PLAN.exam.regStart, re = PLAN.exam.regEnd;
    regCard.style.display = (rs||re) ? '' : 'none';
    let v='—', lbl='報名';
    if (rs && todayS < rs) { v = Math.ceil((parseDate(rs)-today)/86400000); lbl = '距報名開始'; }
    else if (re && todayS <= re) { v = Math.ceil((parseDate(re)-today)/86400000); lbl = rs ? '報名中・距截止' : '距報名截止'; }
    else if (re) { v = '已截止'; lbl = '報名'; }
    document.getElementById('statReg').textContent = v;
    document.getElementById('statRegLabel').textContent = lbl;
  }
  const prog=computeProgress();
  const doneOf=c=>prog.done[c.name]||0;
  const hrs=prog.totalSessions*(PLAN.hoursPerSession||2.5);
  document.getElementById('statTotalHours').textContent=(Number.isInteger(hrs)?hrs:hrs.toFixed(1))+'h';
  document.getElementById('statReviewDone').textContent=prog.reviewCount;
  const coursesDone=SCHEDULE_DATA.courses.filter(c=>doneOf(c)>=c.total).length;
  document.getElementById('statCourseDone').textContent=`${coursesDone}/${SCHEDULE_DATA.courses.length}`;

  document.getElementById('courseProgress').innerHTML=SCHEDULE_DATA.courses.map(c=>{
    const pct=Math.min(100,Math.round(doneOf(c)/c.total*100));
    return `<div class="course-row">
      <div class="course-row-top">
        <span class="course-name" style="color:${c.color}">${c.name}</span>
        <span class="course-pct">${doneOf(c)}/${c.total} (${pct}%)</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${c.color}"></div></div>
    </div>`;
  }).join('');

  const todayItems = allEventsOn(todayS);
  const tsEl = document.getElementById('todaySchedule');
  if(!todayItems.length){ tsEl.innerHTML='<p class="empty-state">今日無排定行程</p>'; }
  else tsEl.innerHTML=todayItems.map(({ev})=>{
    const color=evColor(ev);
    return `<div class="schedule-item">
      <div class="schedule-dot" style="background:${color}"></div>
      <div><div class="schedule-course">${ev.course}<span class="badge ${badgeClass(ev.type)}">${badgeLabel(ev.type)}</span></div>
      <div class="schedule-detail">${ev.label||ev.progress||''}</div></div>
    </div>`;
  }).join('');

  const monday=new Date(today);
  monday.setDate(today.getDate()-(today.getDay()===0?6:today.getDay()-1));
  let weekHTML='';
  for(let i=0;i<7;i++){
    const d=addDays(monday,i); const ds=fmtDate(d); const isToday=ds===todayS;
    const items=allEventsOn(ds);
    const chips=items.map(({ev})=>{
      const c=evColor(ev);
      return `<span class="week-chip" style="background:${c}22;color:${c};opacity:${ev.type==='review'?.6:1}">${ev.course.length>8?ev.course.slice(0,8)+'…':ev.course}</span>`;
    }).join('')||'<span style="color:var(--text-3);font-size:11px">—</span>';
    weekHTML+=`<div class="week-row">
      <div class="week-day" style="${isToday?'color:var(--accent)':''}">
        ${WEEKDAYS_CN[d.getDay()]}<br><small style="font-size:10px">${d.getMonth()+1}/${d.getDate()}</small>
      </div><div class="week-events">${chips}</div></div>`;
  }
  document.getElementById('weekOverview').innerHTML=weekHTML;

  const milestones=[];
  SCHEDULE_DATA.courses.forEach(c=>{
    let lastDate=null;
    Object.entries(SCHEDULE_DATA.schedule).forEach(([ds,evs])=>{
      if(evs.some(e=>e.type==='class'&&e.course===c.name)&&(!lastDate||ds>lastDate)) lastDate=ds;
    });
    if(lastDate) milestones.push({name:c.name,date:lastDate,color:c.color,done:doneOf(c)>=c.total});
  });
  milestones.sort((a,b)=>a.date.localeCompare(b.date));
  document.getElementById('upcomingMilestones').innerHTML=milestones.slice(0,6).map(m=>`
    <div class="milestone-item">
      <span style="color:${m.color}">${m.done?'✓ ':''}${m.name}</span>
      <span class="milestone-date">${m.date}</span>
    </div>`).join('');
}

// ── Calendar ──────────────────────────────────────
function renderCalendar() {
  const ci=document.getElementById('calMonthInput');
  if(ci && document.activeElement!==ci){ ci.value=`${calYear}年 ${MONTHS_CN[calMonth]}`; ci.classList.remove('invalid'); }
  const legendEl=document.getElementById('calLegend');
  legendEl.innerHTML=SCHEDULE_DATA.courses.map(c=>
    `<div class="legend-item"><div class="legend-swatch" style="background:${c.color}"></div>${c.name}</div>`
  ).join('')+`
    ${PLAN.appts.map(a=>`<div class="legend-item"><div class="legend-swatch" style="background:${a.color}"></div>${esc(a.name)}</div>`).join('')}
    ${(PLAN.exam.regStart||PLAN.exam.regEnd)?`<div class="legend-item"><div class="legend-swatch" style="background:${MARKER_COLORS.reg}"></div>報名</div>`:''}
    ${PLAN.exam.start?`<div class="legend-item"><div class="legend-swatch" style="background:${MARKER_COLORS.exam}"></div>考試</div>`:''}
    <div class="legend-item" style="color:var(--text-3);font-style:italic">拖曳移動行程・點擊編輯</div>`;

  const firstDay=new Date(calYear,calMonth,1);
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  let startWd=firstDay.getDay(); startWd=startWd===0?6:startWd-1;
  const todayS=todayStr();

  const wrap=document.getElementById('calendarGrid');
  wrap.innerHTML='';
  const table=document.createElement('table');
  table.className='cal-table';
  const thead=table.createTHead(); const hrow=thead.insertRow();
  ['一','二','三','四','五','六','日'].forEach(d=>{const th=document.createElement('th');th.textContent=d;hrow.appendChild(th);});
  const tbody=table.createTBody();
  let row=tbody.insertRow();
  for(let i=0;i<startWd;i++){const td=row.insertCell();td.className='empty';}
  let col=startWd;

  for(let day=1;day<=daysInMonth;day++){
    const ds=`${calYear}/${String(calMonth+1).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
    const isToday=ds===todayS;
    const td=row.insertCell();
    if(isToday) td.classList.add('today');
    td.dataset.ds=ds;

    const dayNum=document.createElement('div');
    dayNum.className='day-num'; dayNum.textContent=day;
    td.appendChild(dayNum);

    const evWrap=document.createElement('div');
    evWrap.className='ev-container'; evWrap.dataset.ds=ds;
    td.appendChild(evWrap);
    buildCalDayEvents(evWrap, ds);

    // Drop zone for cross-day drag
    td.addEventListener('dragenter', e=>{e.preventDefault();});
    td.addEventListener('dragover',  e=>{e.preventDefault(); td.classList.add('drag-over');});
    td.addEventListener('dragleave', e=>{if(!td.contains(e.relatedTarget)) td.classList.remove('drag-over');});
    td.addEventListener('drop', e=>{
      e.preventDefault(); td.classList.remove('drag-over');
      if(dragInfo && dragInfo.fromDs!==ds) execMoveEvent(ds);
    });
    // Click only if NOT dragging
    td.addEventListener('click', e=>{
      if(dragInfo) return;
      openDayModal(ds);
    });

    col++; if(col===7&&day<daysInMonth){row=tbody.insertRow();col=0;}
  }
  while(col<7&&col>0){const td=row.insertCell();td.className='empty';col++;}
  wrap.appendChild(table);
}

function buildCalDayEvents(container, ds) {
  container.innerHTML='';
  const items=allEventsOn(ds);
  items.forEach((item, pos)=>{
    const {ev,srcType,srcIdx}=item;
    const color=evColor(ev);
    const chip=document.createElement('div');
    chip.className=`cal-event${ev.type==='review'?' review':ev.type==='appt'?' appt':''}`;
    const completed=getCompleted(ds);
    const doneKey=`${srcType}-${srcIdx}`;
    const isDone=completed.includes(doneKey);
    chip.style.cssText=`background:${color}22;color:${color}${isDone?';opacity:0.45;text-decoration:line-through':''}`;
    const tm=eventTime(ds, ev);
    chip.textContent='';
    if(tm){ const ts=document.createElement('span'); ts.className='cal-ev-time'; ts.textContent=tm.start; chip.appendChild(ts); }
    chip.appendChild(document.createTextNode((isDone?'✓ ':'')+ev.course.replace(/（\d{1,2}:\d{2}\s*[-–~]\s*\d{1,2}:\d{2}）/,'')));
    chip.draggable=true;
    chip.title=`${tm?tm.start+'–'+tm.end+' ':''}${ev.course}　拖曳=移動　點擊=編輯`;
    chip.dataset.pos=String(pos);

    chip.addEventListener('mousedown', e=>e.stopPropagation());

    chip.addEventListener('dragstart', e=>{
      dragInfo={ev, fromDs:ds, srcType, srcIdx, pos};
      setTimeout(()=>chip.style.opacity='0.35', 0);
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain', ds);
      e.stopPropagation();
    });
    chip.addEventListener('dragend', ()=>{
      chip.style.opacity='1';
      document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
      setTimeout(()=>{ dragInfo=null; }, 50);
    });

    // Reorder within same day
    chip.addEventListener('dragover', e=>{
      if(dragInfo?.fromDs!==ds) return;
      e.preventDefault(); e.stopPropagation();
      const draggingPos=parseInt(dragInfo.pos);
      chip.style.borderTop   = pos<draggingPos ? '2px solid var(--accent)' : '';
      chip.style.borderBottom= pos>draggingPos ? '2px solid var(--accent)' : '';
    });
    chip.addEventListener('dragleave', ()=>{ chip.style.borderTop=''; chip.style.borderBottom=''; });
    chip.addEventListener('drop', e=>{
      e.preventDefault(); e.stopPropagation();
      chip.style.borderTop=''; chip.style.borderBottom='';
      if(dragInfo?.fromDs===ds && parseInt(dragInfo.pos)!==pos) {
        execReorder(ds, parseInt(dragInfo.pos), pos);
      }
    });

    // Click on chip opens modal (not the whole cell)
    chip.addEventListener('click', e=>{
      e.stopPropagation();
      if(!dragInfo) openDayModal(ds);
    });

    container.appendChild(chip);
  });
  orphanTimeEvents(ds).forEach(t=>{
    const color=t.type==='appt'?apptColor(t.course):courseColor(t.course);
    const chip=document.createElement('div');
    chip.className=`cal-event${t.type==='review'?' review':t.type==='appt'?' appt':''}`;
    chip.style.cssText=`background:${color}22;color:${color}`;
    const ts=document.createElement('span'); ts.className='cal-ev-time'; ts.textContent=t.start; chip.appendChild(ts);
    chip.appendChild(document.createTextNode(t.course));
    chip.title=`${t.start}–${t.end} ${t.course}`;
    container.appendChild(chip);
  });
}

function execReorder(ds, fromPos, toPos) {
  // Store a reorder map in localStorage
  const items=allEventsOn(ds);
  const arr=items.map((_,i)=>i);
  const [moved]=arr.splice(fromPos,1);
  arr.splice(toPos,0,moved);
  storage(`order-${ds}`,arr);
  // Reorder the actual arrays is complex; just re-render with updated visual
  // For simplicity we store the visual order and apply on render
  const cont=document.querySelector(`.ev-container[data-ds="${ds}"]`);
  if(cont){
    // Apply order visually
    const chips=[...cont.children];
    const sorted=arr.map(i=>chips[i]).filter(Boolean);
    sorted.forEach(c=>cont.appendChild(c));
  }
  dragInfo=null;
}

function execMoveEvent(toDs) {
  if(!dragInfo) return;
  const {ev, fromDs, srcType, srcIdx}=dragInfo;
  dragInfo=null;

  // ── Remove from source (all types) ──
  if(srcType==='custom'){
    const evs=getCustomEvents(fromDs); evs.splice(srcIdx,1); saveCustomEvents(fromDs,evs);
  } else if(srcType==='moved'){
    const evs=getMovedEvents(fromDs); evs.splice(srcIdx,1); saveMovedEvents(fromDs,evs);
  } else if(srcType==='builtin'){
    // Hide this built-in on its original day
    const hidden=storage(`hidden-${fromDs}`)||[];
    if(!hidden.includes(srcIdx)) hidden.push(srcIdx);
    storage(`hidden-${fromDs}`,hidden);
  }

  // ── Add to destination ──
  const moved=getMovedEvents(toDs);
  moved.push({course:ev.course, type:ev.type, label:ev.label||'', progress:ev.progress||''});
  saveMovedEvents(toDs,moved);

  // Re-render both days
  [fromDs,toDs].forEach(ds=>{
    const cont=document.querySelector(`.ev-container[data-ds="${ds}"]`);
    if(cont) buildCalDayEvents(cont,ds);
  });
}

function calPrev(){calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCalendar();}
function calNext(){calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCalendar();}
function calToday(){const t=new Date();calYear=t.getFullYear();calMonth=t.getMonth();renderCalendar();calHighlight(todayStr());}

// Type to jump on the month calendar: 2027/3, 3月, 202703, 3 (month) — or a full date 11/20, 1120, 2027/3/5, 明天 (also highlights that day)
function parseMonthInput(raw){
  const ref=`${calYear}/${String(calMonth+1).padStart(2,'0')}/15`;
  let s=String(raw||'').trim().replace(/\s+/g,'')
    .replace(/[０-９／－]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248));
  let y=null,m=null,mm;
  if((mm=/^(\d{4})[\/\-.年](\d{1,2})月?$/.exec(s))) [y,m]=[+mm[1],+mm[2]];
  else if((mm=/^(\d{4})(\d{2})$/.exec(s))) [y,m]=[+mm[1],+mm[2]];
  else if((mm=/^(\d{1,2})月?$/.exec(s))) m=+mm[1];
  if(m!==null){
    if(m<1||m>12) return null;
    if(y===null){
      const keys=Object.keys(SCHEDULE_DATA.schedule).sort();
      const lo=keys.length?keys[0].slice(0,7):'0000/00', hi=keys.length?keys[keys.length-1].slice(0,7):'0000/00';
      const cands=[calYear-1,calYear,calYear+1];
      const key=yy=>`${yy}/${String(m).padStart(2,'0')}`;
      const inPlan=cands.filter(yy=>key(yy)>=lo&&key(yy)<=hi);
      const pool=inPlan.length?inPlan:cands;
      y=pool.reduce((b,yy)=>Math.abs((yy*12+m)-(calYear*12+calMonth+1))<Math.abs((b*12+m)-(calYear*12+calMonth+1))?yy:b);
    }
    return {y, m, ds:null};
  }
  const ds=parseDateInput(raw, ref);
  if(!ds) return null;
  const [yy,m2]=ds.split('/').map(Number);
  return {y:yy, m:m2, ds};
}
function calGoto(){
  const ci=document.getElementById('calMonthInput');
  const r=parseMonthInput(ci.value);
  if(!r){ ci.classList.add('invalid'); return; }
  ci.classList.remove('invalid');
  calYear=r.y; calMonth=r.m-1; ci.blur(); renderCalendar();
  if(r.ds) calHighlight(r.ds);
}
function calHighlight(ds){
  const td=document.querySelector(`.cal-table td[data-ds="${ds}"]`);
  if(!td) return;
  td.classList.add('search-hit');
  td.scrollIntoView({block:'nearest', behavior:'smooth'});
  setTimeout(()=>td.classList.remove('search-hit'), 2500);
}
function calMonthKey(e){
  const ci=e.target;
  if(e.key==='Enter'){ e.preventDefault(); calGoto(); }
  else if(e.key==='Escape'){ ci.classList.remove('invalid'); ci.value=`${calYear}年 ${MONTHS_CN[calMonth]}`; ci.blur(); }
  else ci.classList.remove('invalid');
}

// ── Day Modal ─────────────────────────────────────
function openDayModal(ds) {
  modalDate=ds;
  const d=parseDate(ds);
  document.getElementById('modalDate').textContent=`${ds}（週${WEEKDAYS_CN[d.getDay()]}）`;
  renderModalContent();
  const notesEl=document.getElementById('modalNotes');
  notesEl.value=storage(`notes-${ds}`)||'';
  notesEl.oninput=()=>storage(`notes-${ds}`,notesEl.value);
  document.getElementById('addEventForm').style.display='none';
  document.getElementById('dayModal').classList.add('open');
}

function renderModalContent() {
  const ds=modalDate;
  const items=allEventsOn(ds);
  const completed=getCompleted(ds);  // stores composite keys "srcType-srcIdx"
  let html='';

  if(!items.length) html='<p class="empty-state">無排定行程，可在下方新增</p>';

  items.forEach(({ev,srcType,srcIdx},i)=>{
    const color=evColor(ev);
    const doneKey=`${srcType}-${srcIdx}`;
    const done=completed.includes(doneKey);
    const isMoved=srcType==='moved';
    const isCustom=srcType==='custom';
    const isBuiltin=srcType==='builtin';
    // Time info if set
    const timeEv=eventTime(ds, ev);
    const timeStr=timeEv?`${timeEv.start}–${timeEv.end}`:'';

    html+=`<div class="modal-event-row${done?' ev-done':''}">
      <div class="schedule-dot" style="background:${color}"></div>
      <div style="flex:1">
        <div class="schedule-course">${ev.course}
          <span class="badge ${badgeClass(ev.type)}">${badgeLabel(ev.type)}</span>
          ${done?'<span class="badge" style="background:rgba(63,185,80,.15);color:var(--accent-2)">✓完成</span>':''}
          ${isMoved?'<span class="badge" style="background:rgba(139,148,158,.15);color:var(--text-2)">已移入</span>':''}
          ${isCustom?'<span class="badge" style="background:rgba(139,148,158,.15);color:var(--text-2)">自訂</span>':''}
        </div>
        <div class="schedule-detail">
          ${timeStr?`⏱ ${timeStr}`:ev.label||''} ${ev.progress&&ev.progress!=='—'?'('+ev.progress+')':''}
        </div>
      </div>
      <div style="display:flex;gap:4px;align-items:center">
        <button class="ev-action-btn" onclick="setTimeForEvent('${ds}','${ev.course}','${ev.type}')" title="設定時間">⏱</button>
        <button class="ev-action-btn" onclick="editModalEvent('${ds}','${srcType}',${srcIdx})" title="編輯">✎</button>
        <button class="ev-action-btn" onclick="toggleModalDoneAll('${ds}','${doneKey}')" title="${done?'取消完成':'標記完成'}">${done?'↩':'✓'}</button>
        <button class="ev-action-btn ev-del-btn" onclick="deleteModalEvent('${ds}','${srcType}',${srcIdx})" title="刪除">✕</button>
      </div>
    </div>`;
  });

  document.getElementById('modalEvents').innerHTML=html;
}

// New: toggleModalDone works for ALL event types using composite key
function toggleModalDoneAll(ds, doneKey) {
  const list=getCompleted(ds);
  const pos=list.indexOf(doneKey);
  if(pos===-1) list.push(doneKey); else list.splice(pos,1);
  storage(`completed-${ds}`,list);
  const item=allEventsOn(ds).find(({srcType,srcIdx})=>`${srcType}-${srcIdx}`===doneKey);
  if(item) setBulletDoneForEvent(ds, item.ev, pos===-1);
  renderModalContent();
  const cont=document.querySelector(`.ev-container[data-ds="${ds}"]`);
  if(cont) buildCalDayEvents(cont,ds);
}

// Set time for any event (built-in, custom, moved)
function setTimeForEvent(ds, courseName, courseType) {
  const tevs = getTimeEvents(ds);
  const existIdx = tevs.findIndex(e => e.course === courseName);
  editingTevIdx = existIdx >= 0 ? existIdx : null;
  document.getElementById('timeModalTitle').textContent = existIdx >= 0 ? '修改時間' : '設定時間';
  document.getElementById('tevcourse').value = courseName;
  document.getElementById('tevtype').value   = courseType || 'class';
  if(existIdx >= 0) {
    document.getElementById('tevstart').value = tevs[existIdx].start;
    document.getElementById('tevend').value   = tevs[existIdx].end;
    document.getElementById('tevnote').value  = tevs[existIdx].note||'';
  } else {
    document.getElementById('tevstart').value = '09:00';
    document.getElementById('tevend').value   = '11:30';
    document.getElementById('tevnote').value  = '';
  }
  // Store which date we're editing
  modalDate = ds;
  document.getElementById('timeEventModal').classList.add('open');
}

function toggleModalDone(ds, idx) {
  // Legacy: redirect to new composite-key version for builtin events
  toggleModalDoneAll(ds, `builtin-${idx}`);
}

function deleteModalEvent(ds, srcType, srcIdx) {
  if(srcType==='custom'){
    const evs=getCustomEvents(ds); evs.splice(srcIdx,1); saveCustomEvents(ds,evs);
  } else if(srcType==='moved'){
    const evs=getMovedEvents(ds); evs.splice(srcIdx,1); saveMovedEvents(ds,evs);
  } else if(srcType==='builtin'){
    // Hide this built-in event on this day
    const hidden=storage(`hidden-${ds}`)||[];
    if(!hidden.includes(srcIdx)) hidden.push(srcIdx);
    storage(`hidden-${ds}`,hidden);
  }
  renderModalContent();
  const cont=document.querySelector(`.ev-container[data-ds="${ds}"]`);
  if(cont) buildCalDayEvents(cont,ds);
}

function editModalEvent(ds, srcType, srcIdx) {
  const items=allEventsOn(ds);
  // find the item matching srcType+srcIdx
  const match=items.find(x=>x.srcType===srcType && x.srcIdx===srcIdx);
  if(!match) return;
  const newName=prompt('課程名稱：', match.ev.course);
  if(newName===null) return;  // cancelled
  const newLabel=prompt('備註：', match.ev.label||'');
  if(newLabel===null) return;

  if(srcType==='custom'){
    const evs=getCustomEvents(ds);
    evs[srcIdx].course=newName.trim()||evs[srcIdx].course;
    evs[srcIdx].label=newLabel;
    saveCustomEvents(ds,evs);
  } else if(srcType==='moved'){
    const evs=getMovedEvents(ds);
    evs[srcIdx].course=newName.trim()||evs[srcIdx].course;
    evs[srcIdx].label=newLabel;
    saveMovedEvents(ds,evs);
  } else if(srcType==='builtin'){
    // For built-in: hide original and create a custom copy with edits
    const hidden=storage(`hidden-${ds}`)||[];
    if(!hidden.includes(srcIdx)) hidden.push(srcIdx);
    storage(`hidden-${ds}`,hidden);
    const orig=match.ev;
    const customs=getCustomEvents(ds);
    customs.push({course:newName.trim()||orig.course, type:orig.type,
                  label:newLabel, progress:orig.progress||''});
    saveCustomEvents(ds,customs);
  }
  renderModalContent();
  const cont=document.querySelector(`.ev-container[data-ds="${ds}"]`);
  if(cont) buildCalDayEvents(cont,ds);
}

function closeDayModal(e) {
  if(!e||e.target.classList.contains('modal-overlay')||e.target.classList.contains('modal-close')){
    document.getElementById('dayModal').classList.remove('open');
    modalDate=null;
  }
}
function showAddEventForm(){
  const f=document.getElementById('addEventForm');
  f.style.display=f.style.display==='none'?'block':'none';
  if(f.style.display!=='none'){
    // Populate datalist with course names
    let dl=document.getElementById('courseNameList');
    if(!dl){
      dl=document.createElement('datalist');
      dl.id='courseNameList';
      SCHEDULE_DATA.courses.forEach(c=>{
        const opt=document.createElement('option'); opt.value=c.name; dl.appendChild(opt);
      });
      document.body.appendChild(dl);
      document.getElementById('newEvName').setAttribute('list','courseNameList');
    }
  }
}
function submitAddEvent(){
  const name  = document.getElementById('newEvName').value.trim();
  const type  = document.getElementById('newEvType').value;
  const note  = document.getElementById('newEvNote').value.trim();
  const start = document.getElementById('newEvStart')?.value || '';
  const end   = document.getElementById('newEvEnd')?.value   || '';
  if(!name){alert('請輸入行程名稱');return;}

  // Save to custom events (shows on calendar)
  const evs=getCustomEvents(modalDate);
  evs.push({course:name, type, label:start&&end?`${start}–${end}`:note, progress:'', custom:true});
  saveCustomEvents(modalDate,evs);

  // If times provided, also save as time event (shows on daily timeline)
  if(start && end && start < end){
    const tevs=getTimeEvents(modalDate);
    tevs.push({course:name, type, start, end, note});
    tevs.sort((a,b)=>a.start.localeCompare(b.start));
    saveTimeEvents(modalDate,tevs);
  }

  document.getElementById('newEvName').value='';
  document.getElementById('newEvNote').value='';
  if(document.getElementById('newEvStart')) document.getElementById('newEvStart').value='';
  if(document.getElementById('newEvEnd'))   document.getElementById('newEvEnd').value='';
  document.getElementById('addEventForm').style.display='none';
  renderModalContent();
  const cont=document.querySelector(`.ev-container[data-ds="${modalDate}"]`);
  if(cont) buildCalDayEvents(cont,modalDate);
}

// ── Daily ─────────────────────────────────────────
// ── Timeline helpers ──────────────────────────────
const TL_START_H = 6;   // timeline starts at 6:00
const TL_END_H   = 24;  // timeline ends at 24:00
const TL_PX_PER_H = 60; // 60px per hour

function timeToMinutes(t) {
  const [h,m]=(t||'00:00').split(':').map(Number); return h*60+m;
}
function minutesToPx(minutes) {
  return (minutes - TL_START_H*60) / 60 * TL_PX_PER_H;
}
function getTimeEvents(ds) { return storage(`tevents-${ds}`) || []; }
function saveTimeEvents(ds, evs) { storage(`tevents-${ds}`, evs); }

let editingTevIdx = null;

function openAddTimeEvent(idx) {
  editingTevIdx = (idx !== undefined) ? idx : null;
  const modal = document.getElementById('timeEventModal');
  document.getElementById('timeModalTitle').textContent = idx !== undefined ? '編輯行程' : '新增行程';
  if (idx !== undefined) {
    const evs = getTimeEvents(dailyDate);
    const ev = evs[idx];
    document.getElementById('tevcourse').value = ev.course;
    document.getElementById('tevstart').value  = ev.start;
    document.getElementById('tevend').value    = ev.end;
    document.getElementById('tevtype').value   = ev.type;
    document.getElementById('tevnote').value   = ev.note||'';
  } else {
    document.getElementById('tevcourse').value = '';
    document.getElementById('tevstart').value  = '09:00';
    document.getElementById('tevend').value    = '11:30';
    document.getElementById('tevtype').value   = 'class';
    document.getElementById('tevnote').value   = '';
  }
  modal.classList.add('open');
}

function closeTimeModal(e) {
  if(!e || e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close')) {
    document.getElementById('timeEventModal').classList.remove('open');
  }
}

function submitTimeEvent() {
  const course = document.getElementById('tevcourse').value.trim();
  const start  = document.getElementById('tevstart').value;
  const end    = document.getElementById('tevend').value;
  const type   = document.getElementById('tevtype').value;
  const note   = document.getElementById('tevnote').value.trim();
  if (!course) { alert('請輸入名稱'); return; }
  if (start >= end) { alert('結束時間必須晚於開始時間'); return; }
  // Use modalDate if set (called from calendar modal), else dailyDate
  const targetDs = modalDate || dailyDate;
  const evs = getTimeEvents(targetDs);
  const ev = {course, start, end, type, note};
  if (editingTevIdx !== null) {
    evs[editingTevIdx] = ev;
  } else {
    evs.push(ev);
  }
  evs.sort((a,b) => a.start.localeCompare(b.start));
  saveTimeEvents(targetDs, evs);
  document.getElementById('timeEventModal').classList.remove('open');
  // Refresh timeline if on daily view
  if (targetDs === dailyDate) renderTimeline();
  // Refresh calendar modal if open
  if (modalDate && document.getElementById('dayModal').classList.contains('open')) {
    renderModalContent();
  }
}

function deleteTimeEvent(idx) {
  const evs = getTimeEvents(dailyDate);
  evs.splice(idx,1);
  saveTimeEvents(dailyDate, evs);
  renderTimeline();
}

function renderTimeline() {
  const tl = document.getElementById('timeline');
  if (!tl) return;

  const totalHours = TL_END_H - TL_START_H;
  const totalPx    = totalHours * TL_PX_PER_H;

  // Build HTML: left labels column + right event column
  let html = `<div class="tl-labels">`;
  for (let h = TL_START_H; h <= TL_END_H; h++) {
    html += `<div class="tl-hour-label">${h < TL_END_H ? String(h).padStart(2,'0')+':00' : ''}</div>`;
  }
  html += `</div><div class="tl-col" style="height:${totalPx}px">`;

  // Hour + half-hour lines
  for (let h = TL_START_H; h < TL_END_H; h++) {
    const topH  = (h - TL_START_H) * TL_PX_PER_H;
    const topHH = topH + TL_PX_PER_H * 0.5;
    html += `<div class="tl-line tl-line-hour"  style="top:${topH}px"></div>`;
    html += `<div class="tl-line tl-line-half"  style="top:${topHH}px"></div>`;
  }

  // Now indicator
  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  if (dailyDate === todayStr() && nowMin >= TL_START_H*60 && nowMin < TL_END_H*60) {
    html += `<div class="tl-now" style="top:${minutesToPx(nowMin)}px"></div>`;
  }

  // User-added time events
  const tevs = getTimeEvents(dailyDate);
  tevs.forEach((ev, i) => {
    const color  = ev.type==='appt'?(apptColor(ev.course)):courseColor(ev.course);
    const top    = minutesToPx(timeToMinutes(ev.start));
    const height = Math.max(24, minutesToPx(timeToMinutes(ev.end)) - top);
    html += `<div class="tl-event" style="top:${top}px;height:${height}px;background:${color}22;color:${color};border:1px solid ${color}44"
              onclick="openAddTimeEvent(${i})">
      <div class="tl-event-name">${ev.course}</div>
      <div class="tl-event-time">${ev.start}–${ev.end}${ev.note?' · '+ev.note:''}</div>
      <button class="tl-event-del" onclick="event.stopPropagation();deleteTimeEvent(${i})">✕</button>
    </div>`;
  });

  html += '</div>';

  // Unscheduled built-in events below
  const scheduledCourses = new Set(tevs.map(e=>e.course));
  const unscheduled = allEventsOn(dailyDate).filter(({ev})=>!scheduledCourses.has(ev.course));
  if (unscheduled.length) {
    html += `<div class="tl-unscheduled">
      <div class="tl-unsched-label">未設定時間</div>`;
    unscheduled.forEach(({ev})=>{
      const color=evColor(ev);
      html+=`<div class="tl-event tl-event-unsched" style="background:${color}22;color:${color};border:1px dashed ${color}55">
        <div class="tl-event-name">${ev.course} <span style="opacity:.6;font-size:10px">${badgeLabel(ev.type)}</span></div>
      </div>`;
    });
    html += '</div>';
  }

  tl.innerHTML = html;
}

function renderDaily(){
  const d=parseDate(dailyDate);
  const di=document.getElementById('dailyDateInput');
  if(di && document.activeElement!==di){ di.value=dailyDate; di.classList.remove('invalid'); }
  document.getElementById('dailyDateLabel').textContent=`週${WEEKDAYS_CN[d.getDay()]}`;
  try { renderTimeline(); } catch(e) { console.error('renderTimeline:', e); }
  try { renderBullets(); } catch(e) { console.error('renderBullets:', e); }
  try {
    const notesEl = document.getElementById('dailyNotes');
    if(notesEl) {
      notesEl.value = storage(`dnotes-${dailyDate}`) || '';
      notesEl.oninput = () => storage(`dnotes-${dailyDate}`, notesEl.value);
    }
  } catch(e) { console.error('renderNotes:', e); }
}
function dailyPrev(){dailyDate=fmtDate(addDays(parseDate(dailyDate),-1));renderDaily();}
function dailyNext(){dailyDate=fmtDate(addDays(parseDate(dailyDate),1));renderDaily();}
function dailyToday(){dailyDate=todayStr();renderDaily();}

// Type a date to jump: 11/20, 1120, 2026/11/20, 2026-11-20, 20261120, 11月20日, 今天/明天/昨天
function parseDateInput(raw, refDs){
  refDs = refDs || dailyDate;
  let s=String(raw||'').trim().replace(/\s+/g,'');
  if(!s) return null;
  const rel={'今天':0,'今日':0,'明天':1,'明日':1,'後天':2,'昨天':-1,'昨日':-1,'前天':-2};
  if(s in rel) return fmtDate(addDays(new Date(), rel[s]));
  s=s.replace(/[０-９／－]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/[年月.\-]/g,'/').replace(/[日號号]$/,'');
  let y=null,m,d,mm;
  if((mm=/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s))) [y,m,d]=[+mm[1],+mm[2],+mm[3]];
  else if((mm=/^(\d{1,2})\/(\d{1,2})$/.exec(s))) [m,d]=[+mm[1],+mm[2]];
  else if((mm=/^(\d{4})(\d{2})(\d{2})$/.exec(s))) [y,m,d]=[+mm[1],+mm[2],+mm[3]];
  else if((mm=/^(\d{1,2})(\d{2})$/.exec(s))) [m,d]=[+mm[1],+mm[2]];
  else if((mm=/^(\d{1,2})$/.exec(s))) { const c=parseDate(refDs); [y,m,d]=[c.getFullYear(),c.getMonth()+1,+mm[1]]; }
  else return null;
  const valid=(yy)=>{const t=new Date(yy,m-1,d);return t.getMonth()===m-1&&t.getDate()===d?t:null;};
  if(y!==null){ const t=valid(y); return t?fmtDate(t):null; }
  // No year typed: prefer the year inside the study plan, else the one closest to the date shown
  const keys=Object.keys(SCHEDULE_DATA.schedule).sort();
  const lo=keys.length?parseDate(keys[0]):new Date(0), hi=keys.length?parseDate(keys[keys.length-1]):new Date(0);
  const cur=parseDate(refDs), cy=cur.getFullYear();
  const cands=[cy-1,cy,cy+1].map(valid).filter(Boolean);
  const inPlan=cands.filter(t=>t>=lo&&t<=hi);
  const pool=inPlan.length?inPlan:cands;
  let best=null;
  pool.forEach(t=>{ if(!best||Math.abs(t-cur)<Math.abs(best-cur)) best=t; });
  return best?fmtDate(best):null;
}
function dailyGoto(){
  const di=document.getElementById('dailyDateInput');
  const ds=parseDateInput(di.value);
  if(!ds){ di.classList.add('invalid'); return; }
  di.classList.remove('invalid');
  dailyDate=ds; renderDaily(); di.blur();
}
function dailyDateKey(e){
  const di=e.target;
  if(e.key==='Enter'){ e.preventDefault(); dailyGoto(); }
  else if(e.key==='Escape'){ di.value=dailyDate; di.classList.remove('invalid'); di.blur(); }
  else di.classList.remove('invalid');
}

function getScheduleTodos(ds) {
  // Return today's schedule events as todo-like objects
  return allEventsOn(ds).map(({ev}) => ({
    text: ev.course + (ev.label && ev.label !== '—' ? '　' + ev.label : ''),
    type: ev.type,
    course: ev.course,
    auto: true,
  }));
}

function renderTodos(){
  const userTodos = storage(`todos-${dailyDate}`) || [];
  const autoTodos = getScheduleTodos(dailyDate);
  const donedAuto = storage(`auto-done-${dailyDate}`) || [];
  const el = document.getElementById('todoList');
  if(!el){ setTimeout(renderTodos, 150); return; }

  let html = '';

  // Auto todos from schedule
  if(autoTodos.length) {
    html += '<li class="todo-section-label">今日行程</li>';
    autoTodos.forEach((t, i) => {
      const color = evColor({course: t.course, type: t.type});
      const done = donedAuto.includes(i);
      html += `<li class="todo-item">
        <div class="todo-check${done?' done':''}" onclick="toggleAutoTodo(${i})"></div>
        <span class="todo-text${done?' done':''}" style="color:${color}">${t.text}</span>
      </li>`;
    });
  }

  // User todos
  if(userTodos.length) {
    html += '<li class="todo-section-label">自訂待辦</li>';
    html += userTodos.map((t,i) => `
      <li class="todo-item">
        <div class="todo-check${t.done?' done':''}" onclick="toggleTodo(${i})"></div>
        <span class="todo-text${t.done?' done':''}">${t.text}</span>
        <button class="todo-del" onclick="deleteTodo(${i})">✕</button>
      </li>`).join('');
  }

  if(!autoTodos.length && !userTodos.length) {
    html = '<li style="color:var(--text-3);font-size:12px;padding:8px 4px;list-style:none">今日無行程</li>';
  }

  el.innerHTML = html;
}

function toggleAutoTodo(i) {
  const list = storage(`auto-done-${dailyDate}`) || [];
  const pos = list.indexOf(i);
  if(pos === -1) list.push(i); else list.splice(pos, 1);
  storage(`auto-done-${dailyDate}`, list);
  renderTodos();
}
function addTodo(){
  const el=document.getElementById('todoInput');
  if(!el) return;
  const t=el.value.trim();
  if(!t) return;
  const todos=storage(`todos-${dailyDate}`)||[];
  todos.push({text:t,done:false});
  storage(`todos-${dailyDate}`,todos);
  el.value='';
  renderTodos();
}
function toggleTodo(i){
  const todos=storage(`todos-${dailyDate}`)||[]; todos[i].done=!todos[i].done;
  storage(`todos-${dailyDate}`,todos); renderTodos();
}
function deleteTodo(i){
  const todos=storage(`todos-${dailyDate}`)||[]; todos.splice(i,1);
  storage(`todos-${dailyDate}`,todos); renderTodos();
}

// ── Bullet Journal ─────────────────────────────────
function getBullets(ds){return storage(`bullets-${ds}`)||[];}
function saveBullets(ds,list){storage(`bullets-${ds}`,list);}
function addBulletEntry(){
  const input=document.getElementById('bulletInput');
  const text=input.value.trim(); if(!text)return;
  const bullets=getBullets(dailyDate);
  bullets.push({text,status:'note'});
  saveBullets(dailyDate,bullets); input.value=''; renderBullets();
}
function cycleBulletStatus(idx){
  const bullets=getBullets(dailyDate);
  const cur=BULLET_STATUSES.indexOf(bullets[idx].status);
  bullets[idx].status=BULLET_STATUSES[(cur+1)%BULLET_STATUSES.length];
  saveBullets(dailyDate,bullets);
  syncCalendarFromBullet(dailyDate, bullets[idx]);
  renderBullets();
}
// ── Bullet status menu (click the symbol) ──
const BULLET_LABELS = {note:'筆記',todo:'待辦',done:'完成',cancel:'取消',scheduled:'排程',key:'重點'};
function closeBulletMenu(){ const m=document.getElementById('bulletMenu'); if(m) m.remove(); document.removeEventListener('mousedown', bulletMenuOutside, true); }
function bulletMenuOutside(e){ const m=document.getElementById('bulletMenu'); if(m && !m.contains(e.target)) closeBulletMenu(); }
function openBulletMenu(idx, btn){
  closeBulletMenu();
  const b=getBullets(dailyDate)[idx]; if(!b) return;
  const m=document.createElement('div'); m.id='bulletMenu'; m.className='bullet-menu';
  const next=fmtDate(addDays(parseDate(dailyDate),1));
  m.innerHTML=['todo','done','note','key','cancel'].map(s=>
    `<button class="bm-item${b.status===s?' on':''}" onclick="setBulletStatus(${idx},'${s}')"><span class="bm-sym">${BULLET_SYMBOLS[s]}</span>${BULLET_LABELS[s]}</button>`).join('')+
    `<div class="bm-sched">
       <div class="bm-sched-title"><span class="bm-sym">◎</span>排程到</div>
       <div class="bm-sched-row">
         <input id="bmDate" type="date" class="todo-input field-input" value="${next.replace(/\//g,'-')}">
         <button class="small-btn" style="padding:4px 10px" onclick="scheduleBullet(${idx}, document.getElementById('bmDate').value)">移過去</button>
       </div>
       ${b.movedTo?`<div class="bm-note">目前排在 ${b.movedTo}</div>`:''}
     </div>`;
  document.body.appendChild(m);
  const r=btn.getBoundingClientRect();
  const top=r.bottom+window.scrollY+4, left=Math.min(r.left+window.scrollX, window.scrollX+document.documentElement.clientWidth-m.offsetWidth-8);
  m.style.top=top+'px'; m.style.left=Math.max(8,left)+'px';
  setTimeout(()=>document.addEventListener('mousedown', bulletMenuOutside, true),0);
}
function setBulletStatus(idx, status){
  const bullets=getBullets(dailyDate); if(!bullets[idx]) return;
  bullets[idx].status=status;
  if(status!=='scheduled') delete bullets[idx].movedTo;
  saveBullets(dailyDate,bullets);
  syncCalendarFromBullet(dailyDate, bullets[idx]);
  closeBulletMenu(); renderBullets();
}
// Move one calendar event from a day to another (same as dragging it on the month calendar)
function moveEventItem(fromDs, item, toDs){
  const {ev, srcType, srcIdx}=item;
  if(srcType==='custom'){ const evs=getCustomEvents(fromDs); evs.splice(srcIdx,1); saveCustomEvents(fromDs,evs); }
  else if(srcType==='moved'){ const evs=getMovedEvents(fromDs); evs.splice(srcIdx,1); saveMovedEvents(fromDs,evs); }
  else if(srcType==='builtin'){ const hidden=storage(`hidden-${fromDs}`)||[]; if(!hidden.includes(srcIdx)) hidden.push(srcIdx); storage(`hidden-${fromDs}`,hidden); }
  const moved=getMovedEvents(toDs);
  moved.push({course:ev.course, type:ev.type, label:ev.label||'', progress:ev.progress||''});
  saveMovedEvents(toDs,moved);
}
// ◎ 排程: really move the item to another day; this day keeps a ◎ record pointing there
function scheduleBullet(idx, isoDate){
  const toDs=(isoDate||'').replace(/-/g,'/');
  if(!/^\d{4}\/\d{2}\/\d{2}$/.test(toDs)) return;
  const fromDs=dailyDate;
  if(toDs===fromDs){ closeBulletMenu(); return; }
  const bullets=getBullets(fromDs); const b=bullets[idx]; if(!b) return;
  ensureScheduleBullets(toDs);                       // seed the target day before anything moves in
  const item=allEventsOn(fromDs).find(({ev})=>bulletMatchesEvent(b,ev));
  if(item) moveEventItem(fromDs, item, toDs);         // the calendar follows
  const tb=getBullets(toDs);
  const copy={text:b.text, status:(b.status==='note'||b.status==='key')?b.status:'todo', from:fromDs};
  if(b.ref) copy.ref=b.ref;
  tb.push(copy); saveBullets(toDs,tb);
  b.status='scheduled'; b.movedTo=toDs;
  saveBullets(fromDs,bullets);
  closeBulletMenu(); renderBullets();
  const cont=document.querySelector(`.ev-container[data-ds="${fromDs}"]`); if(cont) buildCalDayEvents(cont,fromDs);
}
function gotoDaily(ds){ dailyDate=ds; renderDaily(); }
function updateBulletText(idx,text){
  const bullets=getBullets(dailyDate); bullets[idx].text=text; saveBullets(dailyDate,bullets);
}
function deleteBullet(idx){
  const bullets=getBullets(dailyDate); const [gone]=bullets.splice(idx,1); saveBullets(dailyDate,bullets);
  if(gone && gone.status==='done') syncCalendarFromBullet(dailyDate, {...gone, status:'todo'});
  renderBullets();
}
function ensureScheduleBullets(ds) {
  // Auto-add schedule events as bullet entries if not done yet for this day
  if(storage(`bullets-seeded-${ds}`)) return;
  const items = allEventsOn(ds);  // already sorted by time from allEventsOn
  if(!items.length) return;
  const bullets = getBullets(ds);
  // Only add if bullets is empty (first visit)
  if(bullets.length === 0) {
    const tevs = getTimeEvents(ds);
    const timeMap = {};
    tevs.forEach(t => { timeMap[t.course] = `${t.start}–${t.end}`; });
    const autoEntries = items.map(({ev}) => {
      const timeStr = timeMap[ev.course] ? ` (${timeMap[ev.course]})` : '';
      const entry = {
        text: ev.course + (ev.label && ev.label !== '—' ? '　' + ev.label : '') + timeStr,
        status: 'todo',
      };
      entry.ref = {course:ev.course, type:ev.type, label:ev.label};
      return entry;
    });
    saveBullets(ds, autoEntries);
  }
  storage(`bullets-seeded-${ds}`, true);
}

function renderBullets(){
  ensureScheduleBullets(dailyDate);
  const bullets=getBullets(dailyDate);
  const ul=document.getElementById('bulletList'); if(!ul)return;
  if(!bullets.length){
    ul.innerHTML='<li style="color:var(--text-3);font-size:12px;padding:8px 4px;list-style:none">輸入後按 Enter 新增筆記</li>';
    return;
  }
  ul.innerHTML=bullets.map((b,i)=>`
    <li class="bullet-item ${BULLET_CLASSES[b.status]||''}">
      <button class="bullet-status-btn" onclick="openBulletMenu(${i},this)" title="點擊選擇狀態">${BULLET_SYMBOLS[b.status]||'•'}</button>
      <input class="bullet-text" type="text" value="${b.text.replace(/"/g,'&quot;')}"
        onchange="updateBulletText(${i},this.value)" onblur="updateBulletText(${i},this.value)">
      ${b.status==='scheduled'&&b.movedTo?`<button class="bullet-link" onclick="gotoDaily('${b.movedTo}')" title="前往那一天">→ ${b.movedTo.slice(5)}</button>`:''}
      ${b.from?`<button class="bullet-link bullet-link--from" onclick="gotoDaily('${b.from}')" title="從這天移過來">← ${b.from.slice(5)}</button>`:''}
      <button class="bullet-del-btn" onclick="deleteBullet(${i})">✕</button>
    </li>`).join('');
}

// ── Habits ─────────────────────────────────────────
function getHabits(){return storage('habit-list')||['英文練習','日文練習','冥想/放鬆'];}
function addHabit(){
  const el=document.getElementById('habitInput'); const t=el.value.trim(); if(!t)return;
  const h=getHabits(); h.push(t); storage('habit-list',h); el.value=''; renderHabits();
}
function deleteHabit(i){const h=getHabits();h.splice(i,1);storage('habit-list',h);renderHabits();}
function toggleHabit(habit,ds){storage(`habit-${habit}-${ds}`,!storage(`habit-${habit}-${ds}`));renderHabits();}
function habitPrev(){habitMonth--;if(habitMonth<0){habitMonth=11;habitYear--;}renderHabits();}
function habitNext(){habitMonth++;if(habitMonth>11){habitMonth=0;habitYear++;}renderHabits();}
function renderHabits(){
  document.getElementById('habitMonthLabel').textContent=`${habitYear}年 ${MONTHS_CN[habitMonth]}`;
  const habits=getHabits();
  const daysInMonth=new Date(habitYear,habitMonth+1,0).getDate();
  const today=new Date(); today.setHours(0,0,0,0);
  const days=Array.from({length:daysInMonth},(_,i)=>new Date(habitYear,habitMonth,i+1));
  let html='<div class="habit-table-wrap"><table class="habit-table"><thead><tr><th>習慣</th>';
  days.forEach(d=>{
    const isToday=fmtDate(d)===fmtDate(today);
    html+=`<th style="${isToday?'color:var(--accent)':''}"><div>${WEEKDAYS_CN[d.getDay()]}</div><div style="font-family:'JetBrains Mono';font-size:10px">${d.getDate()}</div></th>`;
  });
  html+='</tr></thead><tbody>';
  habits.forEach((habit,hi)=>{
    html+=`<tr><td><div class="habit-name-cell">${habit}<button class="habit-del" onclick="deleteHabit(${hi})">✕</button></div></td>`;
    days.forEach(d=>{
      const ds=fmtDate(d); const done=storage(`habit-${habit}-${ds}`);
      const isFuture=d>today; const isToday=ds===fmtDate(today);
      html+=`<td class="habit-check-cell${isToday?' today-col':''}">
        <div class="habit-dot${done?' done':''}${isFuture?' future':''}"
          onclick="${isFuture?'':(`toggleHabit('${habit.replace(/'/g,"\\'")}','${ds}')`)}"></div></td>`;
    });
    html+='</tr>';
  });
  html+='</tbody></table></div>';
  document.getElementById('habitTracker').innerHTML=html;
}


// ── Init ──────────────────────────────────────────
const planReady = initPlan();
renderProjectSwitcher();
try { migrateCalendarDoneToBullets(); } catch(e) { console.error('migrate:', e); }
renderCountdown();
renderDashboard();
if (!planReady && !localStorage.getItem('sp-sync-uid')) showWelcome();
try { initSync(); } catch(e) { console.error('sync:', e); }
