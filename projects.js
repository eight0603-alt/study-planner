'use strict';
// ═══════════════════════════════════════════════════════════════════════
//  Projects: several independent study plans in one browser.
//  Every project has its own copy of everything (plan, notes, ticks, habits).
//  The first project ("default") keeps the original un-prefixed keys, so
//  existing data needs no migration; other projects use "p:<id>:" keys.
// ═══════════════════════════════════════════════════════════════════════
const PROJ_LIST_KEY = 'sp-projects';
const PROJ_ACTIVE_KEY = 'sp-active';

function rawGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function rawSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.error(e); } }

function getProjects() {
  let list = rawGet(PROJ_LIST_KEY);
  if (!Array.isArray(list) || !list.length) {
    let name = '我的計畫';
    const cfg = rawGet('plan-config');
    if (cfg && cfg.exam && cfg.exam.name) name = cfg.exam.name;
    list = [{ id: 'default', name }];
    rawSet(PROJ_LIST_KEY, list);
  }
  return list;
}
function activeProjectId() {
  const list = getProjects(), id = rawGet(PROJ_ACTIVE_KEY);
  return list.some(p => p.id === id) ? id : list[0].id;
}
function activeProject() { const id = activeProjectId(); return getProjects().find(p => p.id === id); }
function projPrefix(id) { id = id || activeProjectId(); return id === 'default' ? '' : `p:${id}:`; }
function projKey(k) { return projPrefix() + k; }
const isGlobalKey = k => k === PROJ_LIST_KEY || k === PROJ_ACTIVE_KEY;
// All keys that belong to a project, without their prefix
function projectLocalKeys(id) {
  const pre = projPrefix(id), out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || isGlobalKey(k)) continue;
    if (pre === '') { if (!k.startsWith('p:')) out.push(k); }
    else if (k.startsWith(pre)) out.push(k.slice(pre.length));
  }
  return out;
}

function switchProject(id) {
  if (id === '__new') { newProject(); return; }
  rawSet(PROJ_ACTIVE_KEY, id);
  location.reload();
}
function newProject() {
  const name = (prompt('新專案名稱（例：高考三級、記帳士）') || '').trim();
  const sel = document.getElementById('projSelect');
  if (!name) { if (sel) sel.value = activeProjectId(); return; }
  const list = getProjects();
  const id = 'x' + Date.now().toString(36);
  list.push({ id, name });
  rawSet(PROJ_LIST_KEY, list);
  rawSet(PROJ_ACTIVE_KEY, id);
  location.reload();
}
function renameProject(name) {
  name = (name || '').trim(); if (!name) return;
  const list = getProjects(), p = list.find(x => x.id === activeProjectId());
  if (!p) return;
  p.name = name; rawSet(PROJ_LIST_KEY, list);
  renderProjectSwitcher();
}
function deleteProject() {
  const list = getProjects(), id = activeProjectId(), p = list.find(x => x.id === id);
  if (list.length < 2) { alert('至少要保留一個專案'); return; }
  if (!confirm(`確定要刪除「${p.name}」嗎？\n這個專案的課表、筆記、打勾紀錄和習慣都會一起刪除，無法復原。`)) return;
  const pre = projPrefix(id);
  projectLocalKeys(id).forEach(k => localStorage.removeItem(pre + k));
  rawSet(PROJ_LIST_KEY, list.filter(x => x.id !== id));
  rawSet(PROJ_ACTIVE_KEY, list.find(x => x.id !== id).id);
  location.reload();
}

// A project still called the placeholder name takes its exam's name
function nameProjectAfterExam(examName) {
  examName = (examName || '').trim(); if (!examName) return;
  const list = getProjects(), p = list.find(x => x.id === activeProjectId());
  if (p && p.name === '我的計畫') { p.name = examName; rawSet(PROJ_LIST_KEY, list); renderProjectSwitcher(); }
}
function renderProjectSwitcher() {
  const sel = document.getElementById('projSelect');
  if (!sel) return;
  const list = getProjects(), cur = activeProjectId();
  sel.innerHTML = list.map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${String(p.name).replace(/</g, '&lt;')}</option>`).join('')
    + `<option value="__new">＋ 新增專案</option>`;
  document.title = `${activeProject().name} · Study Planner`;
}
// Card shown at the top of the settings page
function projectCardHTML() {
  const p = activeProject(), many = getProjects().length > 1;
  return `<div class="ps-card" id="plan-sec-project">
    <h2 class="panel-title">專案</h2>
    <div class="ps-row">
      <span class="ps-lbl">專案名稱</span>
      <input class="todo-input field-input ps-name" type="text" value="${String(p.name).replace(/"/g, '&quot;')}" onchange="renameProject(this.value)">
      <button class="cancel-btn" onclick="newProject()">＋ 新增專案</button>
      ${many ? `<button class="cancel-btn ps-danger" onclick="deleteProject()">刪除這個專案</button>` : ''}
    </div>
    <p class="ps-hint">每個專案的課表、筆記、打勾和習慣都是分開的。用左上角的選單切換專案。</p>
  </div>`;
}
