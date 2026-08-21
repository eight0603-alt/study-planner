'use strict';

// ── Constants ─────────────────────────────────────
const EXAM_DATE   = new Date('2027-08-20');
const WEEKDAYS_CN = ['日','一','二','三','四','五','六'];
const MONTHS_CN   = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const APPT_COLORS = {
  '身心科':             '#B088CC',
  '瑜伽（9:30-11:30）': '#5EAA6E',
  '美甲（13:00-15:00）':'#C4678A',
};
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
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  if (val === null) { localStorage.removeItem(key); return; }
  localStorage.setItem(key, JSON.stringify(val));
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
  return result;
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
  return c ? c.color : (APPT_COLORS[name]||'#8B949E');
}
const TYPE_DEFAULT_COLORS = {class:'#58A6FF', review:'#3FB950', appt:'#D29922'};
function evColor(ev) {
  if (!ev) return '#8B949E';
  if (ev.type==='appt') return APPT_COLORS[ev.course]||'#D29922';
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
}

// ── Countdown ─────────────────────────────────────
function renderCountdown() {
  const el = document.getElementById('examCountdown');
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Math.max(0, Math.ceil((EXAM_DATE-today)/86400000));
  el.innerHTML = `<strong>${days}</strong>天後考試<br><span style="font-size:10px;color:var(--text-3)">2027/08/20~22</span>`;
}

// ── Dashboard ─────────────────────────────────────
function renderDashboard() {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayS = fmtDate(today);
  document.getElementById('dashDate').textContent = `${todayS} 週${WEEKDAYS_CN[today.getDay()]}`;
  const daysLeft = Math.max(0, Math.ceil((EXAM_DATE-today)/86400000));
  document.getElementById('statDaysLeft').textContent = daysLeft;
  let totalClass=0, totalReview=0;
  Object.entries(SCHEDULE_DATA.schedule).forEach(([ds,evs])=>{
    if(parseDate(ds)<=today) evs.forEach(ev=>{
      if(ev.type==='class') totalClass++;
      if(ev.type==='review') totalReview++;
    });
  });
  document.getElementById('statTotalHours').textContent=(totalClass*2.5).toFixed(0)+'h';
  document.getElementById('statReviewDone').textContent=totalReview;
  const coursesDone=SCHEDULE_DATA.courses.filter(c=>c.sessions_done>=c.total).length;
  document.getElementById('statCourseDone').textContent=`${coursesDone}/10`;

  document.getElementById('courseProgress').innerHTML=SCHEDULE_DATA.courses.map(c=>{
    const pct=Math.min(100,Math.round(c.sessions_done/c.total*100));
    return `<div class="course-row">
      <div class="course-row-top">
        <span class="course-name" style="color:${c.color}">${c.name}</span>
        <span class="course-pct">${c.sessions_done}/${c.total} (${pct}%)</span>
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
    if(lastDate) milestones.push({name:c.name,date:lastDate,color:c.color,done:c.sessions_done>=c.total});
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
  document.getElementById('calMonthLabel').textContent=`${calYear}年 ${MONTHS_CN[calMonth]}`;
  const legendEl=document.getElementById('calLegend');
  legendEl.innerHTML=SCHEDULE_DATA.courses.map(c=>
    `<div class="legend-item"><div class="legend-swatch" style="background:${c.color}"></div>${c.name}</div>`
  ).join('')+`
    <div class="legend-item"><div class="legend-swatch" style="background:#B088CC"></div>身心科</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#5EAA6E"></div>瑜伽</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#C4678A"></div>美甲</div>
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
    chip.textContent=(isDone?'✓ ':'')+ev.course;
    chip.draggable=true;
    chip.title=`${ev.course}　拖曳=移動　點擊=編輯`;
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
    const tevs=getTimeEvents(ds);
    const timeEv=tevs.find(e=>e.course===ev.course);
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
    const color  = ev.type==='appt'?(APPT_COLORS[ev.course]||'#D29922'):courseColor(ev.course);
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
  document.getElementById('dailyDateLabel').textContent=`${dailyDate} 週${WEEKDAYS_CN[d.getDay()]}`;
  renderTimeline();
  renderTodos();
  renderBullets();
}
function dailyPrev(){dailyDate=fmtDate(addDays(parseDate(dailyDate),-1));renderDaily();}
function dailyNext(){dailyDate=fmtDate(addDays(parseDate(dailyDate),1));renderDaily();}

function renderTodos(){
  const todos=storage(`todos-${dailyDate}`)||[];
  document.getElementById('todoList').innerHTML=todos.map((t,i)=>`
    <li class="todo-item">
      <div class="todo-check${t.done?' done':''}" onclick="toggleTodo(${i})"></div>
      <span class="todo-text${t.done?' done':''}">${t.text}</span>
      <button class="todo-del" onclick="deleteTodo(${i})">✕</button>
    </li>`).join('');
}
function addTodo(){
  const el=document.getElementById('todoInput'); const t=el.value.trim(); if(!t)return;
  const todos=storage(`todos-${dailyDate}`)||[]; todos.push({text:t,done:false});
  storage(`todos-${dailyDate}`,todos); el.value=''; renderTodos();
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
  saveBullets(dailyDate,bullets); renderBullets();
}
function updateBulletText(idx,text){
  const bullets=getBullets(dailyDate); bullets[idx].text=text; saveBullets(dailyDate,bullets);
}
function deleteBullet(idx){
  const bullets=getBullets(dailyDate); bullets.splice(idx,1); saveBullets(dailyDate,bullets); renderBullets();
}
function renderBullets(){
  const bullets=getBullets(dailyDate);
  const ul=document.getElementById('bulletList'); if(!ul)return;
  ul.innerHTML=bullets.map((b,i)=>`
    <li class="bullet-item ${BULLET_CLASSES[b.status]||''}">
      <button class="bullet-status-btn" onclick="cycleBulletStatus(${i})" title="點擊切換狀態">${BULLET_SYMBOLS[b.status]||'•'}</button>
      <input class="bullet-text" type="text" value="${b.text.replace(/"/g,'&quot;')}"
        onchange="updateBulletText(${i},this.value)" onblur="updateBulletText(${i},this.value)">
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
renderCountdown();
renderDashboard();
