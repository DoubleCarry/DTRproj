/**
 * DTR — Admin Dashboard Module
 */

import {
  getUsers, setUsers, getUser, saveUser, deleteUser,
  getSessions, clearSessions, getCurrentUser,
} from './storage.js';
import { calcStats, fmtDate, fmt12, fmtHM } from './utils.js';
import { toast, openModal, closeModal, val, setVal, setText } from './ui.js';
import { renderHistoryTable } from './userDashboard.js';
import { exportCSV, exportPrint } from './export.js';
import { apiAdminResetUserPassword } from './api.js';

let _viewingUserId = null;

/* ─── RENDER OVERVIEW ─── */
export function renderAdminDashboard() {
  showAdminView('overview');

  const users = getUsers();
  const regular = Object.values(users).filter(u => u.role !== 'admin');

  setText('adminStatUsers', regular.length);

  let totalHours = 0;
  let totalPct   = 0;
  regular.forEach(u => {
    const s   = getSessions(u.id);
    const hrs = s.reduce((a, b) => a + (b.hours || 0), 0);
    totalHours += hrs;
    totalPct   += Math.min(100, (hrs / (u.goal || 300)) * 100);
  });

  setText('adminStatHours', Math.round(totalHours * 10) / 10 + 'h');
  setText('adminStatAvg',   regular.length ? Math.round(totalPct / regular.length) + '%' : '0%');

  // User grid
  const grid = document.getElementById('adminUserGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!regular.length) {
    grid.innerHTML = '<div class="table-empty" style="grid-column:1/-1"><span class="empty-icon">👥</span>No users yet. Add one with the button above.</div>';
    return;
  }

  regular.forEach(u => {
    const sessions = getSessions(u.id);
    const hrs   = sessions.reduce((a, b) => a + (b.hours || 0), 0);
    const goal  = u.goal || 300;
    const pct   = Math.min(100, Math.round((hrs / goal) * 100));
    const rem   = Math.max(0, goal - hrs);

    const badgeClass = pct >= 100 ? 'badge-yellow' : pct >= 75 ? 'badge-blue' : 'badge-green';
    const barClass   = pct >= 100 ? 'done' : pct >= 75 ? '' : '';

    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML = `
      <div class="user-card-top">
        <div class="user-card-avatar">${(u.name[0] || '?').toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div class="user-card-name">${u.name}</div>
          <div class="user-card-username">@${u.username} &nbsp;·&nbsp; ${sessions.length} entries</div>
        </div>
        <span class="badge ${badgeClass}">${pct}%</span>
      </div>
      <div class="mini-progress">
        <div class="mini-progress-fill ${barClass}" style="width:${pct}%"></div>
      </div>
      <div class="user-card-hours">
        <span>${Math.round(hrs * 10) / 10}h logged</span>
        <span>${pct >= 100 ? '🎉 Goal met!' : Math.round(rem * 10) / 10 + 'h remaining'}</span>
      </div>
    `;
    card.addEventListener('click', () => showUserDetail(u.id));
    grid.appendChild(card);
  });
}

/* ─── USER DETAIL ─── */
export function showUserDetail(userId) {
  _viewingUserId = userId;
  const u        = getUser(userId);
  const sessions = getSessions(userId);
  const stats    = calcStats(sessions, u.goal || 300, u.dailyHours || 8);

  showAdminView('detail');

  setText('adminDetailTitle',    `${u.name}'s`);
  setText('adminDetailUsername', `@${u.username}  ·  Goal: ${u.goal || 300}h  ·  Daily: ${u.dailyHours || 8}h`);

  // Detail stats
  const statsRow = document.getElementById('adminDetailStats');
  if (statsRow) {
    statsRow.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-label">Total Hours</div>
        <div class="stat-card-value green">${(stats.totalMins/60).toFixed(1)}h</div>
        <div class="stat-card-sub">${sessions.length} sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Progress</div>
        <div class="stat-card-value blue">${stats.pct}%</div>
        <div class="stat-card-sub">of ${u.goal || 300}h goal</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Overtime</div>
        <div class="stat-card-value purple">${fmtHM(stats.overtimeMins)}</div>
        <div class="stat-card-sub">extra hours</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Remaining</div>
        <div class="stat-card-value yellow">${fmtHM(stats.remainMins)}</div>
        <div class="stat-card-sub">to complete</div>
      </div>
    `;
  }

  renderHistoryTable(sessions, u.dailyHours || 8, 'adminDetailTbody', 'adminDetailEmpty', u);
}

/* ─── BACK ─── */
export function adminBackToOverview() {
  _viewingUserId = null;
  renderAdminDashboard();
}

/* ─── SHOW/HIDE SUB-VIEWS ─── */
function showAdminView(view) {
  document.getElementById('adminOverview')?.classList.toggle('hidden', view !== 'overview');
  document.getElementById('adminUserDetail')?.classList.toggle('hidden', view !== 'detail');
}

/* ─── ADD USER ─── */
export function openAddUserModal() { openModal('addUserModal'); }

export function handleAddUser() {
  const name     = val('newUserName').trim();
  const username = val('newUserUsername').trim().toLowerCase();
  const password = val('newUserPassword');
  const goal     = parseFloat(val('newUserGoal')) || 300;
  const daily    = parseFloat(val('newUserDaily')) || 8;

  if (!name)     { toast('Name is required.', 'error'); return; }
  if (!username) { toast('Username is required.', 'error'); return; }
  if (!password) { toast('Password is required.', 'error'); return; }
  if (!/^[a-z0-9_]+$/.test(username)) { toast('Username: lowercase letters, numbers, underscores only.', 'error'); return; }

  const users = getUsers();
  if (users[username]) { toast('Username already taken.', 'error'); return; }

  users[username] = { id: username, name, username, password, role: 'user', goal, dailyHours: daily };
  setUsers(users);
  closeModal('addUserModal');

  // Reset form
  ['newUserName','newUserUsername','newUserPassword'].forEach(id => setVal(id, ''));
  setVal('newUserGoal', '300');
  setVal('newUserDaily', '8');

  toast(`User "${name}" created!`, 'success');
  renderAdminDashboard();
}

/* ─── EDIT USER GOAL ─── */
export function openEditUserGoal() {
  if (!_viewingUserId) return;
  const u = getUser(_viewingUserId);
  setVal('adminEditGoal',  u.goal || 300);
  setVal('adminEditDaily', u.dailyHours || 8);
  openModal('adminEditUserModal');
}

export function saveEditUserGoal() {
  const goal  = parseFloat(val('adminEditGoal'));
  const daily = parseFloat(val('adminEditDaily'));
  if (!goal || goal < 1)  { toast('Invalid goal.', 'error'); return; }
  if (!daily || daily < 1){ toast('Invalid daily hours.', 'error'); return; }

  const u   = getUser(_viewingUserId);
  saveUser({ ...u, goal, dailyHours: daily });
  closeModal('adminEditUserModal');
  toast('Goal updated.', 'success');
  showUserDetail(_viewingUserId);
}

/* ─── DELETE USER ─── */
export async function adminDeleteUser() {
  if (!_viewingUserId) return;
  const u  = getUser(_viewingUserId);
  const { confirm } = await import('./ui.js');
  const ok = await confirm(
    `Delete "${u.name}"?`,
    `This will permanently remove this user and all their time records.`,
    'Delete User',
    'btn-danger',
  );
  if (!ok) return;
  deleteUser(_viewingUserId);
  adminBackToOverview();
  toast(`User "${u.name}" deleted.`, 'info');
}

/* ─── EXPORT (admin for any user) ─── */
export function adminExportCSV() {
  if (!_viewingUserId) return;
  const u   = getUser(_viewingUserId);
  const s   = getSessions(_viewingUserId);
  if (!s.length) { toast('No records to export.', 'warning'); return; }
  exportCSV(u, s);
  toast('CSV exported.', 'success');
}

export function adminExportPrint() {
  if (!_viewingUserId) return;
  const u = getUser(_viewingUserId);
  const s = getSessions(_viewingUserId);
  if (!s.length) { toast('No records to export.', 'warning'); return; }
  exportPrint(u, s);
}

/* ─── ADMIN RESET USER PASSWORD ─── */
export function openAdminResetPasswordModal() {
  setVal('adminResetUsername', '');
  setVal('adminResetPassword', '');
  setVal('adminResetPasswordConfirm', '');
  openModal('adminResetPasswordModal');
}

export function adminResetUserPassword() {
  const username = val('adminResetUsername').trim().toLowerCase();
  const newPassword = val('adminResetPassword');
  const confirmPassword = val('adminResetPasswordConfirm');

  if (!username) { toast('Username is required.', 'error'); return; }
  if (!/^[a-z0-9_]+$/.test(username)) { toast('Invalid username format.', 'error'); return; }
  if (!newPassword || !confirmPassword) { toast('Enter and confirm the new password.', 'error'); return; }
  if (newPassword.length < 4) { toast('Password must be at least 4 characters.', 'error'); return; }
  if (newPassword !== confirmPassword) { toast('Passwords do not match.', 'error'); return; }

  apiAdminResetUserPassword(username, newPassword, confirmPassword).then(() => {
    closeModal('adminResetPasswordModal');
    setVal('adminResetUsername', '');
    setVal('adminResetPassword', '');
    setVal('adminResetPasswordConfirm', '');
    toast(`Password reset for @${username}.`, 'success');
  }).catch((e) => {
    toast(e.message || 'Failed to reset password.', 'error');
  });
}
