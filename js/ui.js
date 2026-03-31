/**
 * DTR — UI Helpers
 * Toast notifications, modal open/close, confirm dialog.
 */

/* ─── TOAST ─── */
const toastContainer = () => document.getElementById('toastContainer');

const TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

export function toast(message, type = 'info', duration = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] ?? 'ℹ️'}</span><span>${message}</span>`;
  toastContainer().appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, duration);
}

/* ─── MODAL ─── */
export function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}
export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/** Close modal when clicking the dark overlay (not the modal box itself) */
export function initModalOverlayClose() {
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.add('hidden');
    }
  });
}

/* ─── CONFIRM DIALOG ─── */
let _confirmResolve = null;

export function initConfirmDialog() {
  document.getElementById('confirmYesBtn').addEventListener('click', () => {
    closeModal('confirmModal');
    if (_confirmResolve) _confirmResolve(true);
  });
  document.getElementById('confirmNoBtn').addEventListener('click', () => {
    closeModal('confirmModal');
    if (_confirmResolve) _confirmResolve(false);
  });
}

/**
 * Show a custom confirm dialog.
 * @returns {Promise<boolean>}
 */
export function confirm(title, body, yesLabel = 'Confirm', yesClass = 'btn-danger') {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBody').textContent = body;
  const yesBtn = document.getElementById('confirmYesBtn');
  yesBtn.textContent = yesLabel;
  yesBtn.className = `btn ${yesClass}`;
  openModal('confirmModal');
  return new Promise(resolve => { _confirmResolve = resolve; });
}

/* ─── PROGRESS RING ─── */
const RING_CIRCUMFERENCE = 471.24; // 2π × 75

export function setProgressRing(pct) {
  const fill   = document.getElementById('progressRingFill');
  const pctEl  = document.getElementById('ringPct');
  const clamped = Math.min(100, Math.max(0, pct));
  const offset  = RING_CIRCUMFERENCE - (clamped / 100) * RING_CIRCUMFERENCE;

  fill.style.strokeDashoffset = offset;
  if (clamped >= 100)     fill.style.stroke = 'var(--accent4)';
  else if (clamped >= 75) fill.style.stroke = 'var(--accent2)';
  else                    fill.style.stroke = 'var(--accent)';

  if (pctEl) pctEl.textContent = clamped + '%';
}

/* ─── LIVE CLOCK ─── */
import { fmtClock } from './utils.js';

export function startClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  const tick = () => { el.textContent = fmtClock(); };
  tick();
  setInterval(tick, 1000);
}

/* ─── TOPBAR USER ─── */
export function setTopbarUser(user) {
  const avatar = document.getElementById('topbarAvatar');
  const name   = document.getElementById('topbarName');
  const role   = document.getElementById('topbarRole');
  if (avatar) avatar.textContent = (user.name || '?')[0].toUpperCase();
  if (name)   name.textContent   = user.name;
  if (role)   role.textContent   = user.role.toUpperCase();
}

/* ─── VAL / SET helpers ─── */
export function val(id)      { return document.getElementById(id)?.value ?? ''; }
export function setVal(id,v) { const el = document.getElementById(id); if(el) el.value = v; }
export function setText(id,v){ const el = document.getElementById(id); if(el) el.textContent = v; }
export function show(id)     { document.getElementById(id)?.classList.remove('hidden'); }
export function hide(id)     { document.getElementById(id)?.classList.add('hidden'); }
export function toggle(id, force) { document.getElementById(id)?.classList.toggle('hidden', force !== undefined ? !force : undefined); }
