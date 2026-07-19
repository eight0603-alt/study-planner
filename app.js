'use strict';

// ── Constants ─────────────────────────────────────
const EXAM_DATE   = new Date('2027-08-20');
const START_DATE  = new Date('2026-07-25');
const WEEKDAYS_CN = ['日','一','二','三','四','五','六'];
const MONTHS_CN   = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const TYPE_COLORS = {
  class:  null,   // use course color
  review: null,
  appt:   '#D29922',
};
const APPT_COLORS = {
  '身心科':             '#B088CC',
  '瑜伽（9:30-11:30）': '#5EAA6E',
  '美甲（13:00-15:00）':'#C4678A',
};

// ── State ─────────────────────────────────────────
let currentView  = 'dashboard';
let calYear      = new Date().getFullYear();
let calMonth     = new Date().getMonth();
let dailyDate    = todayStr();
let habitYear    = new Date().getFullYear();
let habitMonth   = new Date().getMonth();

// ── Helpers ───────────────────────────────────────
function todayStr() {
  const d = new Date();
  return fmtDate(d);
}
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}/${m}/${day}`;
}
function parseDate(s) {
  const [y,m,d] = s.split('/').map(Number);
  return new Date(y, m-1, d);
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate()+n);
  return r;
}
function courseColor(name) {
  const c = SCHEDULE_DATA.courses.find(x => x.name === name);
  return c ? c.color : '#8B949E';
}
function eventsOn(dateStr) {
  return SCHEDULE_DATA.schedule[dateStr] || [];
}
function storage(key, val) {
  if (val === undefined) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  localStorage.setItem(key, JSON.stringify(val));
}

// ── View switcher ─────────────────────────────────
function switchView(view) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');
  currentView = view;
  if (view === 'dashboard')  renderDashboard();
  if (view === 'calendar')   renderCalendar();
  if (view === 'daily')      renderDaily();
  if (view === 'habits')     renderHabits();
}

// ── Countdown ─────────────────────────────────────
function renderCountdown() {
  const el = document.getElementById('examCountdown');
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Math.ceil((EXAM_DATE - today) / 86400000);
  el.innerHTML = `<strong>${days > 0 ? days : 0}</strong>天後考試<br><span style="font-size:10px;color:var(--text-3)">2027/08/20~22</span>`;
}

// ── Dashboard ─────────────────────────────────────
function renderDashboard() {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayS = fmtDate(today);

  // Date label
  document.getElementById('dashDate').textContent = todayS + ' ' + ['日','一','二','三','四','五','六'][today.getDay()];

  // Days left
  const daysLeft = Math.max(0, Math.ceil((EXAM_DATE - today) / 86400000));
  document.getElementById('statDaysLeft').textContent = daysLeft;

  // Count events up to today
  let totalClassSessions = 0, totalReview = 0;
  Object.entries(SCHEDULE_DATA.schedule).forEach(([ds, evs]) => {
    if (parseDate(ds) <= today) {
      evs.forEach(ev => {
        if (ev.type === 'class') totalClassSessions++;
        if (ev.type === 'review') totalReview++;
      });
    }
  });
  const totalHours = (totalClassSessions * 2.5).toFixed(0);
  document.getElementById('statTotalHours').textContent = totalHours + 'h';
  document.getElementById('statReviewDone').textContent = totalReview;

  // Courses done
  const coursesDone = SCHEDULE_DATA.courses.filter(c => c.sessions_done >= c.total).length;
  document.getElementById('statCourseDone').textContent = coursesDone + '/10';

  // Course progress bars
  const cpEl = document.getElementById('courseProgress');
  cpEl.innerHTML = SCHEDULE_DATA.courses.map(c => {
    const pct = Math.min(100, Math.round(c.sessions_done / c.total * 100));
    return `<div class="course-row">
      <div class="course-row-top">
        <span class="course-name" style="color:${c.color}">${c.name}</span>
        <span class="course-pct">${c.sessions_done}/${c.total} (${pct}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%;background:${c.color}"></div>
      </div>
    </div>`;
  }).join('');

  // Today's schedule
  const todayEvs = eventsOn(todayS);
  const tsEl = document.getElementById('todaySchedule');
  if (todayEvs.length === 0) {
    tsEl.innerHTML = '<p class="empty-state">今日無排定行程</p>';
  } else {
    tsEl.innerHTML = todayEvs.map(ev => {
      const color = ev.type === 'appt' ? (APPT_COLORS[ev.course] || '#D29922') : courseColor(ev.course);
      const badge = ev.type === 'class' ? `<span class="badge badge-class">上課</span>` :
                    ev.type === 'review' ? `<span class="badge badge-review">複習</span>` :
                    `<span class="badge badge-appt">行程</span>`;
      return `<div class="schedule-item">
        <div class="schedule-dot" style="background:${color}"></div>
        <div>
          <div class="schedule-course">${ev.course}${badge}</div>
          <div class="schedule-detail">${ev.label || ev.progress || ''}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Week overview
  const monday = new Date(today);
  monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay()-1));
  const wEl = document.getElementById('weekOverview');
  let weekHTML = '';
  for (let i=0; i<7; i++) {
    const d = addDays(monday, i);
    const ds = fmtDate(d);
    const evs = eventsOn(ds);
    const dayLabel = WEEKDAYS_CN[d.getDay()];
    const isToday = ds === todayS;
    const chips = evs.map(ev => {
      const color = ev.type === 'appt' ? (APPT_COLORS[ev.course] || '#D29922') : courseColor(ev.course);
      const opacity = ev.type === 'review' ? '0.55' : '1';
      return `<span class="week-chip" style="background:${color}22;color:${color};opacity:${opacity}">${ev.course.length > 8 ? ev.course.slice(0,8)+'…' : ev.course}</span>`;
    }).join('') || '<span style="color:var(--text-3);font-size:11px">—</span>';
    weekHTML += `<div class="week-row">
      <div class="week-day" style="${isToday?'color:var(--accent)':''}">${['日','一','二','三','四','五','六'][d.getDay()]}<br><small style="font-size:10px">${d.getMonth()+1}/${d.getDate()}</small></div>
      <div class="week-events">${chips}</div>
    </div>`;
  }
  wEl.innerHTML = weekHTML;

  // Upcoming course completions
  const milEl = document.getElementById('upcomingMilestones');
  const milestones = [];
  SCHEDULE_DATA.courses.forEach(c => {
    // Find last class event for this course
    let lastDate = null;
    Object.entries(SCHEDULE_DATA.schedule).forEach(([ds, evs]) => {
      if (evs.some(e => e.type==='class' && e.course===c.name)) {
        if (!lastDate || ds > lastDate) lastDate = ds;
      }
    });
    if (lastDate) milestones.push({name: c.name, date: lastDate, color: c.color, done: c.sessions_done >= c.total});
  });
  milestones.sort((a,b) => a.date.localeCompare(b.date));
  milEl.innerHTML = milestones.slice(0,6).map(m => `
    <div class="milestone-item">
      <span style="color:${m.color}">${m.done ? '✓ ' : ''}${m.name}</span>
      <span class="milestone-date">${m.date}</span>
    </div>`).join('');
}

// ── Calendar ──────────────────────────────────────
function renderCalendar() {
  document.getElementById('calMonthLabel').textContent = `${calYear}年 ${MONTHS_CN[calMonth]}`;

  // Legend
  const legendEl = document.getElementById('calLegend');
  legendEl.innerHTML = SCHEDULE_DATA.courses.map(c =>
    `<div class="legend-item"><div class="legend-swatch" style="background:${c.color}"></div>${c.name}</div>`
  ).join('') + `<div class="legend-item"><div class="legend-swatch" style="background:#B088CC"></div>身心科</div>
   <div class="legend-item"><div class="legend-swatch" style="background:#5EAA6E"></div>瑜伽</div>
   <div class="legend-item"><div class="legend-swatch" style="background:#C4678A"></div>美甲</div>`;

  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  let startWd = firstDay.getDay(); // 0=Sun; convert to Mon-first
  startWd = startWd === 0 ? 6 : startWd - 1;
  const todayS = todayStr();

  let html = '<table class="cal-table"><thead><tr>';
  ['一','二','三','四','五','六','日'].forEach(d => html += `<th>${d}</th>`);
  html += '</tr></thead><tbody><tr>';

  for (let i=0; i<startWd; i++) html += '<td class="empty"></td>';
  let col = startWd;

  for (let day=1; day<=daysInMonth; day++) {
    const ds = `${calYear}/${String(calMonth+1).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
    const evs = eventsOn(ds);
    const isToday = ds === todayS;
    html += `<td class="${isToday ? 'today' : ''}" onclick="openDayModal('${ds}')">`;
    html += `<div class="day-num">${day}</div>`;
    evs.forEach(ev => {
      const color = ev.type === 'appt' ? (APPT_COLORS[ev.course] || '#D29922') : courseColor(ev.course);
      const cls = ev.type === 'review' ? 'cal-event review' : ev.type === 'appt' ? 'cal-event appt' : 'cal-event';
      html += `<div class="${cls}" style="background:${color}22;color:${color}">${ev.course}</div>`;
    });
    html += '</td>';
    col++;
    if (col === 7 && day < daysInMonth) { html += '</tr><tr>'; col = 0; }
  }
  while (col < 7 && col > 0) { html += '<td class="empty"></td>'; col++; }
  html += '</tr></tbody></table>';
  document.getElementById('calendarGrid').innerHTML = html;
}
function calPrev() { calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderCalendar(); }
function calNext() { calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderCalendar(); }

// ── Day Modal ─────────────────────────────────────
function openDayModal(ds) {
  const modal = document.getElementById('dayModal');
  document.getElementById('modalDate').textContent = ds + ' (' + WEEKDAYS_CN[parseDate(ds).getDay()] + ')';
  const evs = eventsOn(ds);
  let html = '';
  if (evs.length === 0) html = '<p class="empty-state">無排定行程</p>';
  evs.forEach(ev => {
    const color = ev.type === 'appt' ? (APPT_COLORS[ev.course]||'#D29922') : courseColor(ev.course);
    const badge = ev.type==='class'?'上課':ev.type==='review'?'複習':'行程';
    html += `<div class="schedule-item">
      <div class="schedule-dot" style="background:${color}"></div>
      <div><div class="schedule-course">${ev.course} <span class="badge ${ev.type==='class'?'badge-class':ev.type==='review'?'badge-review':'badge-appt'}">${badge}</span></div>
      <div class="schedule-detail">${ev.label||''} ${ev.progress?'('+ev.progress+')':''}</div></div>
    </div>`;
  });
  document.getElementById('modalEvents').innerHTML = html;
  const savedNotes = storage(`notes-${ds}`) || '';
  const notesEl = document.getElementById('modalNotes');
  notesEl.value = savedNotes;
  notesEl.oninput = () => storage(`notes-${ds}`, notesEl.value);
  modal.classList.add('open');
}
function closeDayModal(e) {
  if (!e || e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close')) {
    document.getElementById('dayModal').classList.remove('open');
  }
}

// ── Daily ─────────────────────────────────────────
function renderDaily() {
  const d = parseDate(dailyDate);
  document.getElementById('dailyDateLabel').textContent = `${dailyDate} (${WEEKDAYS_CN[d.getDay()]})`;

  // Events
  const evs = eventsOn(dailyDate);
  const evEl = document.getElementById('dailyEvents');
  if (evs.length === 0) {
    evEl.innerHTML = '<p class="empty-state">今日無排定行程</p>';
  } else {
    evEl.innerHTML = evs.map(ev => {
      const color = ev.type === 'appt' ? (APPT_COLORS[ev.course]||'#D29922') : courseColor(ev.course);
      const badge = ev.type==='class'?'上課':ev.type==='review'?'複習':'行程';
      return `<div class="schedule-item">
        <div class="schedule-dot" style="background:${color}"></div>
        <div>
          <div class="schedule-course">${ev.course} <span class="badge ${ev.type==='class'?'badge-class':ev.type==='review'?'badge-review':'badge-appt'}">${badge}</span></div>
          <div class="schedule-detail">${ev.label||''} ${ev.progress?'('+ev.progress+')':''}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Todos
  renderTodos();

  // Bullet notes
  const notesEl = document.getElementById('bulletNotes');
  notesEl.value = storage(`notes-${dailyDate}`) || '';
  notesEl.oninput = () => storage(`notes-${dailyDate}`, notesEl.value);
}
function dailyPrev() {
  const d = parseDate(dailyDate);
  dailyDate = fmtDate(addDays(d, -1));
  renderDaily();
}
function dailyNext() {
  const d = parseDate(dailyDate);
  dailyDate = fmtDate(addDays(d, 1));
  renderDaily();
}

// Todos
function renderTodos() {
  const todos = storage(`todos-${dailyDate}`) || [];
  const ul = document.getElementById('todoList');
  ul.innerHTML = todos.map((t, i) => `
    <li class="todo-item">
      <div class="todo-check ${t.done ? 'done' : ''}" onclick="toggleTodo(${i})"></div>
      <span class="todo-text ${t.done ? 'done' : ''}">${t.text}</span>
      <button class="todo-del" onclick="deleteTodo(${i})">✕</button>
    </li>`).join('');
}
function addTodo() {
  const input = document.getElementById('todoInput');
  const text = input.value.trim();
  if (!text) return;
  const todos = storage(`todos-${dailyDate}`) || [];
  todos.push({ text, done: false });
  storage(`todos-${dailyDate}`, todos);
  input.value = '';
  renderTodos();
}
function toggleTodo(i) {
  const todos = storage(`todos-${dailyDate}`) || [];
  todos[i].done = !todos[i].done;
  storage(`todos-${dailyDate}`, todos);
  renderTodos();
}
function deleteTodo(i) {
  const todos = storage(`todos-${dailyDate}`) || [];
  todos.splice(i, 1);
  storage(`todos-${dailyDate}`, todos);
  renderTodos();
}

// ── Habits ────────────────────────────────────────
const DEFAULT_HABITS = ['英文練習', '日文練習', '冥想/放鬆'];

function getHabits() {
  return storage('habit-list') || DEFAULT_HABITS;
}
function addHabit() {
  const input = document.getElementById('habitInput');
  const text = input.value.trim();
  if (!text) return;
  const habits = getHabits();
  habits.push(text);
  storage('habit-list', habits);
  input.value = '';
  renderHabits();
}
function deleteHabit(i) {
  const habits = getHabits();
  habits.splice(i, 1);
  storage('habit-list', habits);
  renderHabits();
}

function renderHabits() {
  document.getElementById('habitMonthLabel').textContent = `${habitYear}年 ${MONTHS_CN[habitMonth]}`;
  const habits = getHabits();
  const firstDay = new Date(habitYear, habitMonth, 1);
  const daysInMonth = new Date(habitYear, habitMonth+1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  // Build day columns
  const days = [];
  for (let d=1; d<=daysInMonth; d++) {
    days.push(new Date(habitYear, habitMonth, d));
  }

  let html = '<div class="habit-table-wrap"><table class="habit-table"><thead><tr><th>習慣</th>';
  days.forEach(d => {
    const isToday = fmtDate(d) === fmtDate(today);
    html += `<th style="${isToday?'color:var(--accent)':''}">
      <div>${WEEKDAYS_CN[d.getDay()]}</div>
      <div style="font-family:'JetBrains Mono';font-size:10px">${d.getDate()}</div>
    </th>`;
  });
  html += '</tr></thead><tbody>';

  habits.forEach((habit, hi) => {
    html += `<tr><td><div class="habit-name-cell">${habit}<button class="habit-del" onclick="deleteHabit(${hi})">✕</button></div></td>`;
    days.forEach(d => {
      const ds = fmtDate(d);
      const key = `habit-${habit}-${ds}`;
      const done = storage(key);
      const isFuture = d > today;
      const isToday = ds === fmtDate(today);
      html += `<td class="habit-check-cell ${isToday?'today-col':''}">
        <div class="habit-dot ${done?'done':''} ${isFuture?'future':''}"
          onclick="${isFuture?'':(`toggleHabit('${habit}','${ds}')`)}" ></div>
      </td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  document.getElementById('habitTracker').innerHTML = html;
}
function toggleHabit(habit, ds) {
  const key = `habit-${habit}-${ds}`;
  storage(key, !storage(key));
  renderHabits();
}
function habitPrev() { habitMonth--; if(habitMonth<0){habitMonth=11;habitYear--;} renderHabits(); }
function habitNext() { habitMonth++; if(habitMonth>11){habitMonth=0;habitYear++;} renderHabits(); }

// ── Init ──────────────────────────────────────────
renderCountdown();
renderDashboard();
