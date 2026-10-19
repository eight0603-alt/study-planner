'use strict';
// ═══════════════════════════════════════════════════════════════════════
//  Cloud sync: sign in with Google, every saved item is mirrored to
//  Firestore at users/{uid}/kv/{key}. Each key carries a timestamp; the
//  newest copy wins. Changes from other devices arrive live.
// ═══════════════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {        // public web-app identifiers (not secrets); access is enforced by Firestore rules
  apiKey: 'AIzaSyBz2D0jE6wWcSLhsJmkNf3TZKoHkaLHRDw',
  authDomain: 'study-planner-cdc04.firebaseapp.com',
  projectId: 'study-planner-cdc04',
  storageBucket: 'study-planner-cdc04.firebasestorage.app',
  messagingSenderId: '298555378416',
  appId: '1:298555378416:web:ff694c6337275907479035',
};

const SYNC_META_KEY = 'sp-sync-meta';     // { fullKey: lastModifiedMs }   (this device only)
const SYNC_UID_KEY  = 'sp-sync-uid';      // who this browser's data belongs to (this device only)
const LOCAL_ONLY = new Set(['sp-active', SYNC_META_KEY, SYNC_UID_KEY, 'sp-gcal-cache', 'sp-gcal-token']);

let syncUser = null, syncDb = null, syncUnsub = null;
let syncInitialDone = false, syncApplying = false, syncFlushTimer = null, syncFirstLogin = false;
const syncPending = new Set();
let syncState = 'off';                    // off | connecting | synced | saving | error

function syncEnabled() { return !!(FIREBASE_CONFIG && window.firebase && window.firebase.auth); }
// Firebase libraries are fetched only when sync is configured, after the planner is already on screen
const FIREBASE_SDK = ['app', 'auth', 'firestore'].map(m => `https://www.gstatic.com/firebasejs/10.12.2/firebase-${m}-compat.js`);
function loadFirebase() {
  if (window.firebase && window.firebase.auth && window.firebase.firestore) return Promise.resolve();
  return FIREBASE_SDK.reduce((p, src) => p.then(() => new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('load ' + src));
    document.head.appendChild(s);
  })), Promise.resolve());
}
function syncMeta() { try { return JSON.parse(localStorage.getItem(SYNC_META_KEY)) || {}; } catch { return {}; } }
function syncSaveMeta(m) { try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(m)); } catch (e) { console.error(e); } }
const syncDocId = k => encodeURIComponent(k).replace(/\./g, '%2E');

// Called after every local write/remove (fullKey = key as stored in localStorage)
function syncMark(fullKey) {
  if (!fullKey || LOCAL_ONLY.has(fullKey) || syncApplying) return;
  const meta = syncMeta();
  // While a signed-in browser is still catching up with the cloud, local writes are weak (cloud wins)
  const catchingUp = localStorage.getItem(SYNC_UID_KEY) && !syncInitialDone;
  meta[fullKey] = catchingUp ? 1 : Date.now();
  syncSaveMeta(meta);
  if (syncUser && syncInitialDone) { syncPending.add(fullKey); syncScheduleFlush(); }
}
// Auto-created defaults: never let them overwrite real data from the cloud
function syncMarkWeak(fullKey) {
  if (!fullKey || LOCAL_ONLY.has(fullKey)) return;
  const meta = syncMeta(); if (!(fullKey in meta)) { meta[fullKey] = 1; syncSaveMeta(meta); }
}
function syncScheduleFlush() {
  clearTimeout(syncFlushTimer);
  setSyncState('saving');
  syncFlushTimer = setTimeout(syncFlush, 800);
}
async function syncFlush() {
  if (!syncUser || !syncPending.size) { if (syncUser) setSyncState('synced'); return; }
  const keys = [...syncPending]; syncPending.clear();
  const meta = syncMeta(), col = syncDb.collection('users').doc(syncUser.uid).collection('kv');
  try {
    for (let i = 0; i < keys.length; i += 400) {
      const batch = syncDb.batch();
      keys.slice(i, i + 400).forEach(k => {
        const v = localStorage.getItem(k);
        batch.set(col.doc(syncDocId(k)), { k, v: v === null ? null : v, d: v === null, t: meta[k] || Date.now() });
      });
      await batch.commit();
    }
    setSyncState(syncPending.size ? 'saving' : 'synced');
  } catch (e) {
    console.error('sync push', e);
    keys.forEach(k => syncPending.add(k));
    setSyncState('error');
    setTimeout(syncScheduleFlush, 15000);
  }
}
// Every app key in this browser (all projects + project list), for the first upload
function syncAllLocalKeys() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && !LOCAL_ONLY.has(k)) out.push(k);
  }
  return out;
}
// Apply a batch of cloud documents; returns the keys that changed here
function syncApplyRemote(docs) {
  const meta = syncMeta(), changed = [];
  syncApplying = true;
  try {
    docs.forEach(d => {
      if (!d || !d.k || LOCAL_ONLY.has(d.k)) return;
      if ((d.t || 0) <= (meta[d.k] || 0)) return;
      if (d.d || d.v === null) localStorage.removeItem(d.k); else localStorage.setItem(d.k, d.v);
      meta[d.k] = d.t; changed.push(d.k);
    });
  } finally { syncApplying = false; }
  syncSaveMeta(meta);
  return changed;
}
function syncOnSnapshot(snap) {
  const docs = [];
  if (!syncInitialDone) snap.forEach(doc => docs.push(doc.data()));
  else snap.docChanges().forEach(ch => { if (ch.type !== 'removed' && !ch.doc.metadata.hasPendingWrites) docs.push(ch.doc.data()); });
  if (!syncInitialDone) {
    syncInitialDone = true;
    const live = docs.filter(d => d && d.k && !d.d);
    const meaningful = syncAllLocalKeys().filter(k => !/(^|:)(sp-projects|sync-cal-daily-v1)$/.test(k));
    // First sign-in on a browser that has its own data while the cloud has data too: let the person choose
    let mode = 'merge';
    if (syncFirstLogin && live.length && meaningful.length)
      mode = confirm('雲端已經有你的資料。\n\n按「確定」：使用雲端的資料（這台電腦上的會被取代）\n按「取消」：保留這台電腦的資料，並更新到雲端') ? 'cloud' : 'local';
    let meta = syncMeta();
    if (mode === 'cloud') { syncClearLocal(); localStorage.setItem(SYNC_UID_KEY, syncUser.uid); meta = {}; }
    syncAllLocalKeys().forEach(k => {
      if (mode === 'local') meta[k] = Date.now();
      else if (!(k in meta)) meta[k] = Date.now();                       // data from before sync existed
    });
    syncSaveMeta(meta);
    const changed = syncApplyRemote(docs);
    // Upload whatever this browser has that the cloud doesn't (or has older)
    const remote = {}; docs.forEach(d => { if (d && d.k) remote[d.k] = d.t || 0; });
    meta = syncMeta();
    syncAllLocalKeys().forEach(k => {
      if (meta[k] === 1 && k in remote) return;                          // weak write lost to the cloud
      if (!(k in remote) || meta[k] > remote[k]) syncPending.add(k);
    });
    if (syncPending.size) syncScheduleFlush(); else setSyncState('synced');
    if (changed.length || mode === 'cloud') { setTimeout(() => location.reload(), syncPending.size ? 1500 : 0); }
    return;
  }
  const changed = syncApplyRemote(docs);
  if (!changed.length) return;
  // Something changed on another device while this page is open
  if (changed.some(k => /(^|:)plan-config$|^sp-projects$|(^|:)plan-frozen$/.test(k))) { location.reload(); return; }
  try {
    renderProjectSwitcher(); renderCountdown();
    const v = document.querySelector('.view.active');
    if (v && v.id !== 'view-settings') switchView(v.id.replace('view-', ''));
  } catch (e) { console.error(e); }
}

function setSyncState(s) { syncState = s; renderSyncBox(); }
function renderSyncBox() {
  const box = document.getElementById('syncBox'); if (!box) return;
  if (!syncEnabled()) { box.innerHTML = ''; return; }
  if (!syncUser) {
    box.innerHTML = `<button class="sync-login" onclick="syncSignIn()">
      <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7H2a11 11 0 0 0 0 9.9L5.7 14z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7l3.7 2.9C6.6 7.3 9.1 5.4 12 5.4z"/></svg>
      Google 登入・雲端同步</button>`;
    return;
  }
  const label = { connecting: '連線中…', synced: '✓ 已同步', saving: '同步中…', error: '⚠ 同步失敗，稍後重試' }[syncState] || '';
  box.innerHTML = `<div class="sync-user">
      <div class="sync-status sync-${syncState}">${label}</div>
      <div class="sync-email" title="${syncUser.email || ''}">${syncUser.email || ''}</div>
      <button class="sync-logout" onclick="syncSignOut()">登出</button>
    </div>`;
}

async function syncSignIn() {
  if (!syncEnabled()) return;
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await firebase.auth().signInWithPopup(provider); }
  catch (e) {
    if (e && /popup/.test(e.code || '')) { try { await firebase.auth().signInWithRedirect(provider); } catch (e2) { console.error(e2); } }
    else if (e && e.code !== 'auth/cancelled-popup-request') { console.error(e); alert('登入失敗：' + (e.message || e.code || e)); }
  }
}
async function syncSignOut() {
  if (!confirm('登出後，這台電腦上的資料會清除（雲端仍保留），下次登入會再同步回來。確定登出嗎？')) return;
  try { clearTimeout(syncFlushTimer); await syncFlush(); } catch (e) { console.error(e); }
  if (syncUnsub) { syncUnsub(); syncUnsub = null; }
  syncClearLocal();
  await firebase.auth().signOut();
  location.reload();
}
// Remove every app key from this browser (used on sign-out / account switch)
function syncClearLocal() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) keys.push(k); }
  syncApplying = true;
  keys.forEach(k => localStorage.removeItem(k));
  syncApplying = false;
}

async function initSync() {
  if (!FIREBASE_CONFIG) return;
  try { await loadFirebase(); } catch (e) { console.error('firebase load', e); return; }
  renderSyncBox();
  const wb = document.getElementById('welcomeSyncBtn'); if (wb) wb.style.display = '';
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    syncDb = firebase.firestore();
  } catch (e) { console.error('firebase init', e); return; }
  firebase.auth().onAuthStateChanged(user => {
    if (syncUnsub) { syncUnsub(); syncUnsub = null; }
    syncUser = user; syncInitialDone = false;
    if (!user) { setSyncState('off'); return; }
    const prevUid = localStorage.getItem(SYNC_UID_KEY);
    syncFirstLogin = !prevUid;
    if (prevUid && prevUid !== user.uid) { syncClearLocal(); localStorage.setItem(SYNC_UID_KEY, user.uid); location.reload(); return; }
    localStorage.setItem(SYNC_UID_KEY, user.uid);
    setSyncState('connecting');
    syncUnsub = syncDb.collection('users').doc(user.uid).collection('kv')
      .onSnapshot(syncOnSnapshot, err => { console.error('sync listen', err); setSyncState('error'); });
  });
}
