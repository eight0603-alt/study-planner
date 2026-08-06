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

// ── State ─────────────────────────────────────────
let calYear   = new Date().getFullYear();
let calMonth  = new Date().getMonth();
let dailyDate = todayStr();
let habitYear = new Date().getFullYear();
let habitMonth= new Date().getMonth();
let modalDate = null;

// ── Storage helpers ───────────────────────────────
function storage(key, val) {
  if (val === undefined) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  localStorage.setItem(key, JSON.stringify(val));
}

// Custom events added by user (per date)
function getCustomEvents(ds) { return storage(`custom-${ds}`) || []; }
function saveCustomEvents(ds, evs) { storage(`custom-${ds}`, evs); }

// Completed flags for built-in events
function getCompleted(ds) { return storage(`completed-${ds}`) || []; }
function toggleCompleted(ds, idx) {
  const list = getCompleted(ds);
  const pos  = list.indexOf(idx);
  if (pos === -1) list.push(idx); else list.splice(pos, 1);
  storage(`completed-${ds}`, list);
}

// Combined events for a date
function eventsOn(ds) {
  const builtin = SCHEDULE_DATA.schedule[ds] || [];
  const custom  = getCustomEvents(ds);
  return [...builtin, ...custom.map(e => ({...e, custom: true}))];
}

// ── Date helpers ──────────────────────────────────
function todayStr() { return fmtDate(new Date()); }
function fmtDate(d) {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
function parseDate(s) { const [y,m,d]=s.split('/').map(Number); return new Date(y,m-1,d); }
function addDays(d, n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }

// ── Color helpers ─────────────────────────────────
function courseColor(name) {
  const c = SCHEDULE_DATA.courses.find(x => x.name === name);
  if (c) return c.color;
  return APPT_COLORS[name] || '#8B949E';
}
function evColor(ev) {
  if (ev.type === 'appt') return APPT_COLORS[ev.course] || '#D29922';
  return courseColor(ev.course);
}
function badgeClass(type) {
  return type==='class'?'badge-class':type==='review'?'badge-review':'badge-appt';
}
function badgeLabel(type) {
  return type==='class'?'上課':type==='review'?'複習':'行程';
}

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
    if (parseDate(ds)<=today) {
      evs.forEach(ev=>{ if(ev.type==='class') totalClass++; if(ev.type==='review') totalReview++; });
    }
  });
  document.getElementById('statTotalHours').textContent = (totalClass*2.5).toFixed(0)+'h';
  document.getElementById('statReviewDone').textContent = totalReview;
  const coursesDone = SCHEDULE_DATA.courses.filter(c=>c.sessions_done>=c.total).length;
  document.getElementById('statCourseDone').textContent = `${coursesDone}/10`;

  // Course progress
  document.getElementById('courseProgress').innerHTML = SCHEDULE_DATA.courses.map(c=>{
    const pct = Math.min(100, Math.round(c.sessions_done/c.total*100));
    return `<div class="course-row">
      <div class="course-row-top">
        <span class="course-name" style="color:${c.color}">${c.name}</span>
        <span class="course-pct">${c.sessions_done}/${c.total} (${pct}%)</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${c.color}"></div></div>
    </div>`;
  }).join('');

  // Today
  const todayEvs = eventsOn(todayS);
  const tsEl = document.getElementById('todaySchedule');
  if (!todayEvs.length) { tsEl.innerHTML='<p class="empty-state">今日無排定行程</p>'; }
  else tsEl.innerHTML = todayEvs.map(ev=>{
    const color = evColor(ev);
    return `<div class="schedule-item">
      <div class="schedule-dot" style="background:${color}"></div>
      <div>
        <div class="schedule-course">${ev.course}<span class="badge ${badgeClass(ev.type)}">${badgeLabel(ev.type)}</span></div>
        <div class="schedule-detail">${ev.label||ev.progress||''}</div>
      </div>
    </div>`;
  }).join('');

  // Week
  const monday = new Date(today);
  monday.setDate(today.getDate()-(today.getDay()===0?6:today.getDay()-1));
  let weekHTML='';
  for(let i=0;i<7;i++){
    const d=addDays(monday,i); const ds=fmtDate(d);
    const evs=eventsOn(ds); const isToday=ds===todayS;
    const chips=evs.map(ev=>{
      const c=evColor(ev);
      return `<span class="week-chip" style="background:${c}22;color:${c};opacity:${ev.type==='review'?.6:1}">${ev.course.length>8?ev.course.slice(0,8)+'…':ev.course}</span>`;
    }).join('')||'<span style="color:var(--text-3);font-size:11px">—</span>';
    weekHTML+=`<div class="week-row">
      <div class="week-day" style="${isToday?'color:var(--accent)':''}">
        ${WEEKDAYS_CN[d.getDay()]}<br><small style="font-size:10px">${d.getMonth()+1}/${d.getDate()}</small>
      </div>
      <div class="week-events">${chips}</div>
    </div>`;
  }
  document.getElementById('weekOverview').innerHTML=weekHTML;

  // Milestones
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
// ── Drag state ────────────────────────────────────
let dragEv     = null;  // { ev, fromDs, evIdx, isBuiltin }
let dragEl     = null;

function renderCalendar() {
  document.getElementById('calMonthLabel').textContent = `${calYear}年 ${MONTHS_CN[calMonth]}`;
  const legendEl = document.getElementById('calLegend');
  legendEl.innerHTML = SCHEDULE_DATA.courses.map(c=>
    `<div class="legend-item"><div class="legend-swatch" style="background:${c.color}"></div>${c.name}</div>`
  ).join('')+`<div class="legend-item"><div class="legend-swatch" style="background:#B088CC"></div>身心科</div>
   <div class="legend-item"><div class="legend-swatch" style="background:#5EAA6E"></div>瑜伽</div>
   <div class="legend-item"><div class="legend-swatch" style="background:#C4678A"></div>美甲</div>
   <div class="legend-item" style="font-style:italic;color:var(--text-3)">拖曳可移動行程</div>`;

  const firstDay=new Date(calYear,calMonth,1);
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  let startWd=firstDay.getDay(); startWd=startWd===0?6:startWd-1;
  const todayS=todayStr();

  // Build table via DOM for proper event listeners
  const wrap = document.getElementById('calendarGrid');
  wrap.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'cal-table';

  // Header
  const thead = table.createTHead();
  const hrow  = thead.insertRow();
  ['一','二','三','四','五','六','日'].forEach(d=>{
    const th = document.createElement('th'); th.textContent = d; hrow.appendChild(th);
  });

  const tbody = table.createTBody();
  let row = tbody.insertRow();
  for(let i=0;i<startWd;i++){
    const td=row.insertCell(); td.className='empty';
  }
  let col = startWd;

  for(let day=1;day<=daysInMonth;day++){
    const ds=`${calYear}/${String(calMonth+1).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
    const isToday = ds===todayS;
    const td = row.insertCell();
    if(isToday) td.className='today';
    td.dataset.ds = ds;

    // Day number
    const dayNum = document.createElement('div');
    dayNum.className='day-num'; dayNum.textContent=day;
    td.appendChild(dayNum);

    // Events container (for inner reorder drag)
    const evContainer = document.createElement('div');
    evContainer.className='ev-container';
    evContainer.dataset.ds = ds;
    td.appendChild(evContainer);

    // Render events
    renderCalDayEvents(evContainer, ds);

    // Drop target: accept cross-day drag
    td.addEventListener('dragover', e=>{
      e.preventDefault();
      td.classList.add('drag-over');
    });
    td.addEventListener('dragleave', e=>{
      if(!td.contains(e.relatedTarget)) td.classList.remove('drag-over');
    });
    td.addEventListener('drop', e=>{
      e.preventDefault();
      td.classList.remove('drag-over');
      const toDs = td.dataset.ds;
      if(dragEv && toDs && toDs !== dragEv.fromDs) {
        moveDragEvent(toDs);
      }
    });

    // Click to open modal (only if not dragging)
    td.addEventListener('click', e=>{
      if(!dragEv) openDayModal(ds);
    });

    col++;
    if(col===7 && day<daysInMonth){ row=tbody.insertRow(); col=0; }
  }
  while(col<7&&col>0){ const td=row.insertCell(); td.className='empty'; col++; }

  wrap.appendChild(table);
}

function renderCalDayEvents(container, ds) {
  container.innerHTML = '';
  const builtin = SCHEDULE_DATA.schedule[ds] || [];
  const custom  = getCustomEvents(ds);
  const moved   = storage(`moved-${ds}`) || [];   // built-in events moved TO this day
  const hidden  = storage(`hidden-${ds}`) || [];  // built-in events moved AWAY from original day

  // Order: builtin (non-hidden) + moved-in + custom
  // For reorder, we store a custom order array per day
  const allEvs = [];

  // Built-in (skip hidden)
  builtin.forEach((ev, i) => {
    if (!hidden.includes(i)) allEvs.push({ev, evIdx: i, isBuiltin: true, movedIdx: null});
  });
  // Moved-in built-ins
  moved.forEach((m, mi) => {
    allEvs.push({ev: m.ev, evIdx: mi, isBuiltin: false, movedIdx: mi, fromDs: m.fromDs});
  });
  // Custom
  custom.forEach((ev, i) => {
    allEvs.push({ev, evIdx: i, isBuiltin: false, movedIdx: null, isCustom: true});
  });

  // Apply stored sort order
  const order = storage(`order-${ds}`);
  let orderedEvs = allEvs;
  if (order && order.length === allEvs.length) {
    try {
      orderedEvs = order.map(i => allEvs[i]).filter(Boolean);
    } catch(e) { orderedEvs = allEvs; }
  }

  orderedEvs.forEach((item, pos) => {
    const {ev} = item;
    const color = evColor(ev);
    const chip = document.createElement('div');
    chip.className = `cal-event ${ev.type==='review'?'review':ev.type==='appt'?'appt':''}`;
    chip.style.background = `${color}22`;
    chip.style.color = color;
    chip.textContent = ev.course;
    chip.draggable = true;
    chip.dataset.pos = pos;
    chip.title = `${ev.course} — 拖曳可移動`;

    chip.addEventListener('dragstart', e => {
      dragEv = { ev, fromDs: ds, pos, item };
      dragEl = chip;
      chip.style.opacity = '0.4';
      e.stopPropagation();
    });
    chip.addEventListener('dragend', e => {
      chip.style.opacity = '1';
      dragEv = null; dragEl = null;
      document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
    });

    // Reorder within same cell
    chip.addEventListener('dragover', e => {
      e.preventDefault(); e.stopPropagation();
      if(dragEv && dragEv.fromDs === ds && pos !== dragEv.pos) {
        chip.style.borderTop = pos < dragEv.pos ? '' : '2px solid var(--accent)';
        chip.style.borderBottom = pos < dragEv.pos ? '2px solid var(--accent)' : '';
      }
    });
    chip.addEventListener('dragleave', e => {
      chip.style.borderTop=''; chip.style.borderBottom='';
    });
    chip.addEventListener('drop', e => {
      e.stopPropagation(); e.preventDefault();
      chip.style.borderTop=''; chip.style.borderBottom='';
      if(dragEv && dragEv.fromDs === ds && pos !== dragEv.pos) {
        reorderDayEvents(ds, dragEv.pos, pos, allEvs.length);
      }
    });

    container.appendChild(chip);
  });
}

function reorderDayEvents(ds, fromPos, toPos, total) {
  const order = storage(`order-${ds}`) || Array.from({length:total},(_,i)=>i);
  const item = order.splice(fromPos, 1)[0];
  order.splice(toPos, 0, item);
  storage(`order-${ds}`, order);
  const cont = document.querySelector(`.ev-container[data-ds="${ds}"]`);
  if(cont) renderCalDayEvents(cont, ds);
  dragEv = null;
}

function moveDragEvent(toDs) {
  if(!dragEv) return;
  const {ev, fromDs, item} = dragEv;

  // Remove from source
  if(item.isCustom) {
    const customs = getCustomEvents(fromDs);
    customs.splice(item.evIdx, 1);
    saveCustomEvents(fromDs, customs);
  } else if(item.isBuiltin) {
    // Built-in: COPY only, do NOT hide from original day
  } else if(item.fromDs) {
    // It's a previously-moved built-in — remove from moved list on source
    const moved = storage(`moved-${fromDs}`) || [];
    moved.splice(item.movedIdx, 1);
    storage(`moved-${fromDs}`, moved);
  }
  // Clear order cache for source
  storage(`order-${fromDs}`, null);

  // Add to destination
  const moved = storage(`moved-${toDs}`) || [];
  moved.push({ev, fromDs: item.isBuiltin ? fromDs : (item.fromDs || fromDs)});
  storage(`moved-${toDs}`, moved);
  storage(`order-${toDs}`, null);

  dragEv = null;

  // Re-render both cells
  const fromCont = document.querySelector(`.ev-container[data-ds="${fromDs}"]`);
  const toCont   = document.querySelector(`.ev-container[data-ds="${toDs}"]`);
  if(fromCont) renderCalDayEvents(fromCont, fromDs);
  if(toCont)   renderCalDayEvents(toCont, toDs);
}

function calPrev(){calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCalendar();}
function calNext(){calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCalendar();}

// ── Day Modal ─────────────────────────────────────
function openDayModal(ds) {
  modalDate = ds;
  const d = parseDate(ds);
  document.getElementById('modalDate').textContent = `${ds} (週${WEEKDAYS_CN[d.getDay()]})`;
  renderModalEvents();
  const notesEl = document.getElementById('modalNotes');
  notesEl.value = storage(`notes-${ds}`) || '';
  notesEl.oninput = () => storage(`notes-${ds}`, notesEl.value);
  document.getElementById('dayModal').classList.add('open');
  document.getElementById('addEventForm').style.display='none';
}

function renderModalEvents() {
  const ds = modalDate;
  const builtin = SCHEDULE_DATA.schedule[ds] || [];
  const custom  = getCustomEvents(ds);
  const completed = getCompleted(ds);
  let html = '';

  if (!builtin.length && !custom.length) {
    html = '<p class="empty-state">無排定行程，可在下方新增</p>';
  }

  builtin.forEach((ev, i) => {
    const color = evColor(ev);
    const done = completed.includes(i);
    html += `<div class="modal-event-row ${done?'ev-done':''}">
      <div class="schedule-dot" style="background:${color}"></div>
      <div style="flex:1">
        <div class="schedule-course">${ev.course}
          <span class="badge ${badgeClass(ev.type)}">${badgeLabel(ev.type)}</span>
          ${done?'<span class="badge" style="background:rgba(63,185,80,.15);color:var(--accent-2)">✓ 完成</span>':''}
        </div>
        <div class="schedule-detail">${ev.label||''} ${ev.progress?'('+ev.progress+')':''}</div>
      </div>
      <button class="ev-action-btn" onclick="toggleEventDone('${ds}',${i})" title="${done?'取消完成':'標記完成'}">
        ${done?'↩':'✓'}
      </button>
    </div>`;
  });

  custom.forEach((ev, i) => {
    const color = evColor(ev);
    html += `<div class="modal-event-row custom-ev">
      <div class="schedule-dot" style="background:${color}"></div>
      <div style="flex:1">
        <div class="schedule-course">${ev.course}
          <span class="badge ${badgeClass(ev.type)}">${badgeLabel(ev.type)}</span>
          <span class="badge" style="background:rgba(139,148,158,.15);color:var(--text-2)">自訂</span>
        </div>
        <div class="schedule-detail">${ev.label||''}</div>
      </div>
      <button class="ev-action-btn ev-del-btn" onclick="deleteCustomEvent('${ds}',${i})" title="刪除">✕</button>
    </div>`;
  });

  document.getElementById('modalEvents').innerHTML = html;
}

function toggleEventDone(ds, idx) {
  toggleCompleted(ds, idx);
  renderModalEvents();
  if (document.getElementById('view-dashboard').classList.contains('active')) renderDashboard();
  if (document.getElementById('view-calendar').classList.contains('active')) renderCalendar();
}

function deleteCustomEvent(ds, idx) {
  const evs = getCustomEvents(ds);
  evs.splice(idx, 1);
  saveCustomEvents(ds, evs);
  renderModalEvents();
  renderCalendar();
  if (dailyDate === ds) renderDaily();
}

function closeDayModal(e) {
  if (!e || e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close')) {
    document.getElementById('dayModal').classList.remove('open');
    modalDate = null;
  }
}

// ── Add Event Form ─────────────────────────────────
function showAddEventForm() {
  const form = document.getElementById('addEventForm');
  form.style.display = form.style.display==='none' ? 'block' : 'none';
}

function submitAddEvent() {
  const name = document.getElementById('newEvName').value.trim();
  const type = document.getElementById('newEvType').value;
  const note = document.getElementById('newEvNote').value.trim();
  if (!name) { alert('請輸入行程名稱'); return; }

  const evs = getCustomEvents(modalDate);
  evs.push({ course: name, type, label: note, progress: '', custom: true });
  saveCustomEvents(modalDate, evs);

  document.getElementById('newEvName').value = '';
  document.getElementById('newEvNote').value = '';
  document.getElementById('addEventForm').style.display = 'none';

  renderModalEvents();
  renderCalendar();
  if (dailyDate === modalDate) renderDaily();
}

// ── Daily ─────────────────────────────────────────
function renderDaily() {
  const d = parseDate(dailyDate);
  document.getElementById('dailyDateLabel').textContent = `${dailyDate} 週${WEEKDAYS_CN[d.getDay()]}`;

  const evs = eventsOn(dailyDate);
  const completed = getCompleted(dailyDate);
  const builtin = SCHEDULE_DATA.schedule[dailyDate] || [];
  const evEl = document.getElementById('dailyEvents');

  if (!evs.length) { evEl.innerHTML='<p class="empty-state">今日無行程，<button class="link-btn" onclick="openDayModal(\''+dailyDate+'\')">點此新增</button></p>'; }
  else evEl.innerHTML = evs.map((ev, i) => {
    const color = evColor(ev);
    const isBuiltin = i < builtin.length;
    const done = isBuiltin && completed.includes(i);
    return `<div class="schedule-item ${done?'ev-done':''}">
      <div class="schedule-dot" style="background:${color}"></div>
      <div style="flex:1">
        <div class="schedule-course">${ev.course}
          <span class="badge ${badgeClass(ev.type)}">${badgeLabel(ev.type)}</span>
          ${done?'<span class="badge" style="background:rgba(63,185,80,.15);color:var(--accent-2)">✓</span>':''}
          ${ev.custom?'<span class="badge" style="background:rgba(139,148,158,.15);color:var(--text-2)">自訂</span>':''}
        </div>
        <div class="schedule-detail">${ev.label||''} ${ev.progress?'('+ev.progress+')':''}</div>
      </div>
      ${isBuiltin?`<button class="ev-action-btn" onclick="toggleEventDone('${dailyDate}',${i})">${done?'↩':'✓'}</button>`:''}
    </div>`;
  }).join('');

  renderTodos();
  renderBullets();
}
function dailyPrev(){dailyDate=fmtDate(addDays(parseDate(dailyDate),-1));renderDaily();}
function dailyNext(){dailyDate=fmtDate(addDays(parseDate(dailyDate),1));renderDaily();}

function renderTodos() {
  const todos = storage(`todos-${dailyDate}`) || [];
  document.getElementById('todoList').innerHTML = todos.map((t,i)=>`
    <li class="todo-item">
      <div class="todo-check ${t.done?'done':''}" onclick="toggleTodo(${i})"></div>
      <span class="todo-text ${t.done?'done':''}">${t.text}</span>
      <button class="todo-del" onclick="deleteTodo(${i})">✕</button>
    </li>`).join('');
}
function addTodo(){
  const el=document.getElementById('todoInput'); const text=el.value.trim(); if(!text)return;
  const todos=storage(`todos-${dailyDate}`)||[];
  todos.push({text,done:false}); storage(`todos-${dailyDate}`,todos); el.value=''; renderTodos();
}
function toggleTodo(i){
  const todos=storage(`todos-${dailyDate}`)||[]; todos[i].done=!todos[i].done;
  storage(`todos-${dailyDate}`,todos); renderTodos();
}
function deleteTodo(i){
  const todos=storage(`todos-${dailyDate}`)||[]; todos.splice(i,1);
  storage(`todos-${dailyDate}`,todos); renderTodos();
}

// ── Habits ────────────────────────────────────────
function getHabits(){return storage('habit-list')||['英文練習','日文練習','冥想/放鬆'];}
function addHabit(){
  const el=document.getElementById('habitInput'); const t=el.value.trim(); if(!t)return;
  const h=getHabits(); h.push(t); storage('habit-list',h); el.value=''; renderHabits();
}
function deleteHabit(i){const h=getHabits();h.splice(i,1);storage('habit-list',h);renderHabits();}
function toggleHabit(habit,ds){
  const key=`habit-${habit}-${ds}`; storage(key,!storage(key)); renderHabits();
}
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
      const ds=fmtDate(d); const key=`habit-${habit}-${ds}`;
      const done=storage(key); const isFuture=d>today; const isToday=ds===fmtDate(today);
      html+=`<td class="habit-check-cell ${isToday?'today-col':''}">
        <div class="habit-dot ${done?'done':''} ${isFuture?'future':''}"
          onclick="${isFuture?'':(`toggleHabit('${habit.replace(/'/g,"\\'")}','${ds}')`)}"></div>
      </td>`;
    });
    html+='</tr>';
  });
  html+='</tbody></table></div>';
  document.getElementById('habitTracker').innerHTML=html;
}

// ── Init ──────────────────────────────────────────
renderCountdown();
renderDashboard();

// ── Bullet Journal ────────────────────────────────
// Statuses cycle: note → todo → done → cancel → scheduled → key → note
const BULLET_STATUSES = ['note','todo','done','cancel','scheduled','key'];
const BULLET_SYMBOLS  = { note:'•', todo:'○', done:'✓', cancel:'✕', scheduled:'◎', key:'★' };
const BULLET_CLASSES  = { note:'', todo:'', done:'status-done', cancel:'status-cancel', scheduled:'status-scheduled', key:'status-key' };

function getBullets(ds) { return storage(`bullets-${ds}`) || []; }
function saveBullets(ds, list) { storage(`bullets-${ds}`, list); }

function addBulletEntry() {
  const input = document.getElementById('bulletInput');
  const text  = input.value.trim();
  if (!text) return;
  const bullets = getBullets(dailyDate);
  bullets.push({ text, status: 'note' });
  saveBullets(dailyDate, bullets);
  input.value = '';
  renderBullets();
}

function cycleBulletStatus(idx) {
  const bullets = getBullets(dailyDate);
  const cur = BULLET_STATUSES.indexOf(bullets[idx].status);
  bullets[idx].status = BULLET_STATUSES[(cur + 1) % BULLET_STATUSES.length];
  saveBullets(dailyDate, bullets);
  renderBullets();
}

function updateBulletText(idx, text) {
  const bullets = getBullets(dailyDate);
  bullets[idx].text = text;
  saveBullets(dailyDate, bullets);
}

function deleteBullet(idx) {
  const bullets = getBullets(dailyDate);
  bullets.splice(idx, 1);
  saveBullets(dailyDate, bullets);
  renderBullets();
}

function renderBullets() {
  const bullets = getBullets(dailyDate);
  const ul = document.getElementById('bulletList');
  if (!ul) return;
  ul.innerHTML = bullets.map((b, i) => {
    const sym   = BULLET_SYMBOLS[b.status]  || '•';
    const cls   = BULLET_CLASSES[b.status]  || '';
    return `<li class="bullet-item ${cls}">
      <button class="bullet-status-btn" onclick="cycleBulletStatus(${i})" title="點擊切換狀態">${sym}</button>
      <input class="bullet-text" type="text" value="${b.text.replace(/"/g,'&quot;')}"
        onchange="updateBulletText(${i}, this.value)"
        onblur="updateBulletText(${i}, this.value)">
      <button class="bullet-del-btn" onclick="deleteBullet(${i})">✕</button>
    </li>`;
  }).join('');
}
