/**
 * DTR — Main Entry Point
 * Handles login, logout, session restore, and wires all modules together.
 */

import { seedDefaults, getUsers, setUsers, getCurrentUser, setCurrentUser, getUser } from './storage.js';
import { toast, openModal, closeModal, startClock, setTopbarUser, initModalOverlayClose, initConfirmDialog, val } from './ui.js';
import {
  initUserDashboard, handleAddEntry, deleteEntry, clearAll,
  openSettings, saveSettings, openExportModal, doExportCSV, doExportPrint,
  openEditEntry, saveEditEntry, openImportModal, previewImport, importParsedEntries,
  setTodayDate, toggleEntryAbsent, setMeridiem, setEditMeridiem, updateEditOvertimePreview, updateExportTemplateUI, addExportAdditionalInfoRow,
} from './userDashboard.js';
import { renderAdminDashboard, showUserDetail, adminBackToOverview, openAddUserModal, handleAddUser, openEditUserGoal, saveEditUserGoal, adminDeleteUser, adminExportCSV, adminExportPrint } from './adminDashboard.js';

const THEME_KEY = 'dtr_theme';

/* ─── BOOT ─── */
seedDefaults();
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
initModalOverlayClose();
initConfirmDialog();

// Expose functions globally (called from HTML onclick attributes)
window.dtr = {
  handleLogin, handleLogout,
  switchAuthMode, switchLoginRole: switchAuthMode, handleSignup,
  handleAddEntry, deleteEntry, clearAll,
  openEditEntry, saveEditEntry,
  openSettings, saveSettings,
  openExportModal, doExportCSV, doExportPrint,
  updateExportTemplateUI,
  addExportAdditionalInfoRow,
  openImportModal, previewImport, importParsedEntries,
  setTodayDate, toggleEntryAbsent,
  setMeridiem, setEditMeridiem, updateEditOvertimePreview,
  // Admin
  openAddUserModal, handleAddUser,
  adminBackToOverview,
  openEditUserGoal, saveEditUserGoal,
  adminDeleteUser, adminExportCSV, adminExportPrint,
  showUserDetail,
  toggleTheme,
};

// Also expose modal helpers globally
window.openModal  = openModal;
window.closeModal = closeModal;

/* ─── SESSION RESTORE ─── */
const existing = getCurrentUser();
if (existing) {
  const fresh = getUser(existing.id);
  if (fresh) {
    setCurrentUser(fresh);
    launchApp(fresh);
  } else {
    setCurrentUser(null);
    showLogin();
  }
} else {
  showLogin();
}

/* ─── LOGIN ─── */
let _authMode = 'login';

function showLogin() {
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
  switchAuthMode('login');
  // Focus username field
  setTimeout(() => document.getElementById('loginUsername')?.focus(), 100);
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = isLight ? '🌙 Dark' : '☀ Light';
}

function toggleTheme() {
  const nowLight = document.body.classList.contains('light-theme');
  const next = nowLight ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function switchAuthMode(mode) {
  _authMode = mode === 'signup' ? 'signup' : 'login';
  document.querySelectorAll('.login-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.auth === _authMode),
  );
  document.getElementById('loginFormPane')?.classList.toggle('hidden', _authMode !== 'login');
  document.getElementById('signupFormPane')?.classList.toggle('hidden', _authMode !== 'signup');
}
window.dtr.switchAuthMode = switchAuthMode;
window.dtr.switchLoginRole = switchAuthMode;

function handleLogin() {
  const username = val('loginUsername').trim();
  const password = val('loginPassword');
  const errEl    = document.getElementById('loginError');
  const errText  = document.getElementById('loginErrorText');

  errEl.classList.add('hidden');

  if (!username || !password) {
    if (errText) errText.textContent = 'Please enter both username and password.';
    errEl.classList.remove('hidden');
    return;
  }

  const users = getUsers();
  const user  = Object.values(users).find(u => u.username === username);

  if (!user || user.password !== password) {
    if (errText) errText.textContent = 'Invalid username or password.';
    errEl.classList.remove('hidden');
    document.getElementById('loginPassword').value = '';
    return;
  }

  if (user.role === 'admin') {
    if (errText) errText.textContent = 'Admin login is disabled on this screen.';
    errEl.classList.remove('hidden');
    return;
  }

  setCurrentUser(user);
  launchApp(user);
}

function handleSignup() {
  const name = val('signupName').trim();
  const username = val('signupUsername').trim().toLowerCase();
  const password = val('signupPassword');
  const confirm = val('signupPasswordConfirm');
  const errEl = document.getElementById('signupError');
  const errText = document.getElementById('signupErrorText');
  errEl?.classList.add('hidden');

  if (!name || !username || !password || !confirm) {
    if (errText) errText.textContent = 'Please complete all sign-up fields.';
    errEl?.classList.remove('hidden');
    return;
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    if (errText) errText.textContent = 'Username must use lowercase letters, numbers, or underscore.';
    errEl?.classList.remove('hidden');
    return;
  }
  if (password.length < 4) {
    if (errText) errText.textContent = 'Password must be at least 4 characters.';
    errEl?.classList.remove('hidden');
    return;
  }
  if (password !== confirm) {
    if (errText) errText.textContent = 'Passwords do not match.';
    errEl?.classList.remove('hidden');
    return;
  }

  const users = getUsers();
  if (Object.values(users).some(u => u.username === username)) {
    if (errText) errText.textContent = 'Username already exists. Please choose another.';
    errEl?.classList.remove('hidden');
    return;
  }

  const newUser = {
    id: username,
    name,
    username,
    password,
    role: 'user',
    goal: 300,
    targetDate: '',
    dailyHours: 8,
    overtimeEnabled: true,
    lateTrackingEnabled: false,
    scheduleStart: '08:00',
    scheduleEnd: '17:00',
    lunchBreak: { enabled: false, start: '11:20', end: '12:20' },
    firstTimeSetup: true,
  };

  users[newUser.id] = newUser;
  setUsers(users);
  setCurrentUser(newUser);
  launchApp(newUser);
  openSettings();
  toast('Account created. Please complete your setup.', 'success');
}

window.dtr.handleSignup = handleSignup;

document.addEventListener('keydown', e => {
  const loginPage = document.getElementById('loginPage');
  if (e.key === 'Enter' && !loginPage.classList.contains('hidden')) {
    if (_authMode === 'signup') handleSignup();
    else handleLogin();
  }
});

/* ─── LAUNCH APP ─── */
function launchApp(user) {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').classList.add('hidden');

  setTopbarUser(user);
  startClock();

  if (user.role === 'admin') {
    document.getElementById('adminDashboard').classList.remove('hidden');
    document.getElementById('userDashboard').classList.add('hidden');
    renderAdminDashboard();
  } else {
    document.getElementById('userDashboard').classList.remove('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');
    initUserDashboard();
  }
}

/* ─── LOGOUT ─── */
function handleLogout() {
  setCurrentUser(null);
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('userDashboard').classList.add('hidden');
  document.getElementById('adminDashboard').classList.add('hidden');
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('signupName').value = '';
  document.getElementById('signupUsername').value = '';
  document.getElementById('signupPassword').value = '';
  document.getElementById('signupPasswordConfirm').value = '';
  showLogin();
  toast('Signed out.', 'info');
}
