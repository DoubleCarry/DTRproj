/**
 * DTR — Storage Module
 * All localStorage read/write operations live here.
 */

const KEYS = {
  users:   'dtr_users',
  session: uid => `dtr_sessions_${uid}`,
  current: 'dtr_current_user',
};

export function getUsers() {
  return JSON.parse(localStorage.getItem(KEYS.users) || '{}');
}
export function setUsers(users) {
  localStorage.setItem(KEYS.users, JSON.stringify(users));
}
export function getUser(id) {
  return getUsers()[id] || null;
}
export function saveUser(user) {
  const users = getUsers();
  users[user.id] = user;
  setUsers(users);
}
export function deleteUser(id) {
  const users = getUsers();
  delete users[id];
  setUsers(users);
  localStorage.removeItem(KEYS.session(id));
}

export function getSessions(userId) {
  return JSON.parse(localStorage.getItem(KEYS.session(userId)) || '[]');
}
export function setSessions(userId, sessions) {
  localStorage.setItem(KEYS.session(userId), JSON.stringify(sessions));
}
export function addSession(userId, entry) {
  const sessions = getSessions(userId);
  sessions.push(entry);
  setSessions(userId, sessions);
}
export function removeSession(userId, entryId) {
  const sessions = getSessions(userId).filter(s => s.id !== entryId);
  setSessions(userId, sessions);
  return sessions;
}
export function clearSessions(userId) {
  localStorage.removeItem(KEYS.session(userId));
}

export function migrateUserId(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return false;
  const users = getUsers();
  const existing = users[oldId];
  if (!existing || users[newId]) return false;

  const sessions = getSessions(oldId);
  delete users[oldId];
  users[newId] = { ...existing, id: newId, username: newId };
  setUsers(users);

  setSessions(newId, sessions);
  clearSessions(oldId);
  return true;
}

export function getCurrentUser() {
  return JSON.parse(localStorage.getItem(KEYS.current) || 'null');
}
export function setCurrentUser(user) {
  if (user === null) localStorage.removeItem(KEYS.current);
  else localStorage.setItem(KEYS.current, JSON.stringify(user));
}

/** Seed default accounts + sample data on first run */
export function seedDefaults() {
  const users = getUsers();

  if (!users['admin']) {
    users['admin'] = {
      id: 'admin', name: 'Administrator', username: 'admin',
      password: 'admin123', role: 'admin', goal: 300, dailyHours: 8, overtimeEnabled: true, lateTrackingEnabled: false, scheduleStart: '08:00', scheduleEnd: '17:00',
    };
  }
  if (!users['john']) {
    users['john'] = {
      id: 'john', name: 'John Reyes', username: 'john',
      password: 'pass123', role: 'user', goal: 300, dailyHours: 8, overtimeEnabled: true, lateTrackingEnabled: false, scheduleStart: '08:00', scheduleEnd: '17:00',
    };
  }
  if (!users['maria']) {
    users['maria'] = {
      id: 'maria', name: 'Maria Santos', username: 'maria',
      password: 'pass123', role: 'user', goal: 300, dailyHours: 8, overtimeEnabled: true, lateTrackingEnabled: false, scheduleStart: '08:00', scheduleEnd: '17:00',
    };
  }
  setUsers(users);

  // Sample sessions for john
  if (!getSessions('john').length) {
    setSessions('john', [
      { id: uid(), date: '2025-01-06', timeIn: '08:00', timeOut: '17:00', hours: 9,    overtime: 1,   source: 'manual', note: '' },
      { id: uid(), date: '2025-01-07', timeIn: '08:30', timeOut: '18:00', hours: 9.5,  overtime: 1.5, source: 'manual', note: '' },
      { id: uid(), date: '2025-01-08', timeIn: '07:45', timeOut: '15:45', hours: 8,    overtime: 0,   source: 'manual', note: '' },
      { id: uid(), date: '2025-01-09', timeIn: '08:00', timeOut: '17:00', hours: 9,    overtime: 1,   source: 'manual', note: 'Catch-up sprint' },
      { id: uid(), date: '2025-01-10', timeIn: '08:00', timeOut: '12:00', hours: 4,    overtime: 0,   source: 'manual', note: 'Half day' },
    ]);
  }

  // Sample sessions for maria
  if (!getSessions('maria').length) {
    setSessions('maria', [
      { id: uid(), date: '2025-01-06', timeIn: '09:00', timeOut: '18:00', hours: 9,    overtime: 1,   source: 'manual', note: '' },
      { id: uid(), date: '2025-01-07', timeIn: '09:00', timeOut: '17:00', hours: 8,    overtime: 0,   source: 'manual', note: '' },
    ]);
  }
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
