/**
 * DTR — User Dashboard Module
 */

import {
  getUser, getSessions, setSessions, removeSession,
  clearSessions, saveUser, getCurrentUser, setCurrentUser, uid, migrateUserId, getUsers,
} from './storage.js';
import {
  fmtHM, fmt12, fmtDate, todayStr, calcHours, calcStats, firstName,
  predictCompletionDate, getHolidayLabel, parseFlexibleDate, parseFlexibleTime,
  timeToMins,
} from './utils.js';
import { toast, openModal, closeModal, setProgressRing, setTopbarUser, val, setVal, setText } from './ui.js';
import { exportCSV, exportPrint } from './export.js';

let _editingEntryId = null;
let _importPreview = [];

function currentUserFresh() {
  const user = getCurrentUser();
  if (!user) return null;
  return getUser(user.id) || user;
}

function getLunchCfg(user) {
  return user.lunchBreak || { enabled: false, start: '11:20', end: '12:20' };
}

function overtimeEnabled(user) {
  return user?.overtimeEnabled !== false;
}

function lateTrackingEnabled(user) {
  return user?.lateTrackingEnabled === true;
}

function workSchedule(user) {
  return {
    start: user?.scheduleStart || '08:00',
    end: user?.scheduleEnd || '17:00',
  };
}

function holidayOverrides(user) {
  return {
    add: Array.isArray(user?.manualHolidaysAdd) ? user.manualHolidaysAdd : [],
    remove: Array.isArray(user?.manualHolidaysRemove) ? user.manualHolidaysRemove : [],
  };
}

function isNonWorkingDateForUser(dateStr, user) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const holiday = getHolidayLabel(dateStr, holidayOverrides(user));
  return weekend || !!holiday;
}

function parseDateList(raw) {
  if (!raw) return [];
  const parts = raw.split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
  const clean = parts.filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v));
  return [...new Set(clean)].sort();
}

function scheduleWindowMins(timeIn, timeOut, user) {
  const sched = workSchedule(user);
  const inM = timeToMins(timeIn);
  const outM = timeToMins(timeOut);
  const startM = timeToMins(sched.start);
  const endM = timeToMins(sched.end);
  const wStart = Math.max(inM, startM);
  const wEnd = Math.min(outM, endM);
  return Math.max(0, wEnd - wStart);
}

function isLateEntry(entry, user) {
  if (!lateTrackingEnabled(user)) return false;
  if (!entry || entry.absent || !entry.timeIn || entry.timeIn === '--') return false;
  const sched = workSchedule(user);
  return timeToMins(entry.timeIn) > timeToMins(sched.start);
}

function isUndertimeEntry(entry, user) {
  if (!lateTrackingEnabled(user)) return false;
  if (!entry || entry.absent || !entry.timeOut || entry.timeOut === '--') return false;
  const sched = workSchedule(user);
  return timeToMins(entry.timeOut) < timeToMins(sched.end);
}

function applyOvertimePolicy(hours, overtime, dailyHours, user) {
  if (overtimeEnabled(user)) {
    return {
      finalHours: Math.round(hours * 100) / 100,
      finalOvertime: Math.round(overtime * 100) / 100,
      wasCapped: false,
    };
  }
  const capped = Math.min(hours, dailyHours || 8);
  return {
    finalHours: Math.round(capped * 100) / 100,
    finalOvertime: 0,
    wasCapped: hours > capped,
  };
}

function recalcEntry(entry, user) {
  if (entry.absent) {
    return { ...entry, timeIn: '--', timeOut: '--', hours: 0, overtime: 0, late: false, undertime: false, source: entry.source || 'manual' };
  }
  let baseHours;
  let baseOvertime;
  if (lateTrackingEnabled(user)) {
    const mins = scheduleWindowMins(entry.timeIn, entry.timeOut, user);
    baseHours = mins / 60;
    baseOvertime = 0;
  } else {
    const { hours, overtime } = calcHours(entry.timeIn, entry.timeOut, user.dailyHours || 8, getLunchCfg(user));
    baseHours = hours;
    baseOvertime = overtime;
  }
  const { finalHours, finalOvertime } = applyOvertimePolicy(baseHours, baseOvertime, user.dailyHours || 8, user);
  return {
    ...entry,
    hours: finalHours,
    overtime: finalOvertime,
    late: isLateEntry(entry, user),
    undertime: isUndertimeEntry(entry, user),
  };
}

function recalcAllSessions(user) {
  const sessions = getSessions(user.id).map(s => recalcEntry(s, user));
  setSessions(user.id, sessions);
  return sessions;
}

function buildTimeFromPicker(prefix) {
  const hour = Number(val(`${prefix}Hour`));
  const minute = Number(val(`${prefix}Minute`));
  const ampm = val(`${prefix}Meridiem`);
  if (!hour || Number.isNaN(minute) || !ampm) return '';
  let h24 = hour % 12;
  if (ampm === 'PM') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function syncPickerFromTime(prefix, time24, defaults = { hour: '08', minute: '00', meridiem: 'AM' }) {
  if (!time24 || time24 === '--') {
    setVal(`${prefix}Hour`, defaults.hour);
    setVal(`${prefix}Minute`, defaults.minute);
    setVal(`${prefix}Meridiem`, defaults.meridiem);
    return;
  }
  const mins = timeToMins(time24);
  const h24 = Math.floor(mins / 60);
  const mm = mins % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = (h24 % 12) || 12;
  setVal(`${prefix}Hour`, String(hour12).padStart(2, '0'));
  setVal(`${prefix}Minute`, String(mm).padStart(2, '0'));
  setVal(`${prefix}Meridiem`, ampm);
}

function setNativeTime(prefix, time24) {
  setVal(`${prefix}Time`, time24);
}

function wirePicker(prefix, onChange) {
  [`${prefix}Hour`, `${prefix}Minute`, `${prefix}Meridiem`].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      const time24 = buildTimeFromPicker(prefix);
      setNativeTime(prefix, time24);
      onChange?.();
    });
  });
}

function readEntryTimes() {
  const timeIn = buildTimeFromPicker('entryIn');
  const timeOut = buildTimeFromPicker('entryOut');
  setNativeTime('entryIn', timeIn);
  setNativeTime('entryOut', timeOut);
  return { timeIn, timeOut };
}

function readEditTimes() {
  const timeIn = buildTimeFromPicker('editIn');
  const timeOut = buildTimeFromPicker('editOut');
  setNativeTime('editIn', timeIn);
  setNativeTime('editOut', timeOut);
  return { timeIn, timeOut };
}

function fillMinuteSelect(id) {
  const el = document.getElementById(id);
  if (!el || el.options.length) return;
  const html = [];
  for (let i = 0; i < 60; i++) {
    const mm = String(i).padStart(2, '0');
    html.push(`<option value="${mm}">${mm}</option>`);
  }
  el.innerHTML = html.join('');
}

function addWheelBehavior(id, onChange) {
  const el = document.getElementById(id);
  if (!el || el.dataset.wheelBound === '1') return;
  el.dataset.wheelBound = '1';
  el.addEventListener('wheel', e => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    const len = el.options.length;
    if (!len) return;
    const next = (el.selectedIndex + dir + len) % len;
    el.selectedIndex = next;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    onChange?.();
  }, { passive: false });
}

function setEntryAbsentUI(isAbsent) {
  document.getElementById('entryTimeFields')?.classList.toggle('hidden', isAbsent);
  document.getElementById('entryAbsentNote')?.classList.toggle('hidden', !isAbsent);
}

/* ─── INIT ─── */
export function initUserDashboard() {
  const user = currentUserFresh();
  if (!user) return;

  [
    'entryInMinute', 'entryOutMinute',
    'editInMinute', 'editOutMinute',
    'scheduleStartMinute', 'scheduleEndMinute',
    'lunchStartMinute', 'lunchEndMinute',
  ].forEach(fillMinuteSelect);

  [
    'entryInHour','entryInMinute','entryInMeridiem',
    'entryOutHour','entryOutMinute','entryOutMeridiem',
    'editInHour','editInMinute','editInMeridiem',
    'editOutHour','editOutMinute','editOutMeridiem',
    'scheduleStartHour','scheduleStartMinute','scheduleStartMeridiem',
    'scheduleEndHour','scheduleEndMinute','scheduleEndMeridiem',
    'lunchStartHour','lunchStartMinute','lunchStartMeridiem',
    'lunchEndHour','lunchEndMinute','lunchEndMeridiem',
  ].forEach(id => addWheelBehavior(id));

  setText('userGreetName', firstName(user.name));
  const now = new Date();
  setText('userGreetDate', now.toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }));

  setTodayDate();
  const absentEl = document.getElementById('entryAbsent');
  if (absentEl) absentEl.checked = false;
  setEntryAbsentUI(false);

  syncPickerFromTime('entryIn', '08:00', { hour: '08', minute: '00', meridiem: 'AM' });
  syncPickerFromTime('entryOut', '17:00', { hour: '05', minute: '00', meridiem: 'PM' });
  setNativeTime('entryIn', '08:00');
  setNativeTime('entryOut', '17:00');

  wirePicker('entryIn', updateEntryPreview);
  wirePicker('entryOut', updateEntryPreview);
  wirePicker('editIn', updateEditOvertimePreview);
  wirePicker('editOut', updateEditOvertimePreview);

  ['entryDate', 'entryNote', 'entryAbsent'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateEntryPreview);
  });

  refresh();
}

/* ─── REFRESH ALL ─── */
export function refresh() {
  const user = getCurrentUser();
  if (!user) return;
  const freshUser = getUser(user.id) || user;

  const sessions = getSessions(freshUser.id);
  const stats = calcStats(sessions, freshUser.goal || 300, freshUser.dailyHours || 8);
  const predicted = predictCompletionDate(sessions, freshUser.goal || 300, {
    isNonWorkingDate: ds => isNonWorkingDateForUser(ds, freshUser),
  });
  const attendance = sessions.filter(s => !s.absent && (s.hours || 0) > 0).length;
  const absence = sessions.filter(s => !!s.absent).length;
  const attendanceRate = sessions.length ? Math.round((attendance / sessions.length) * 100) : 0;
  const schedule = workSchedule(freshUser);
  const lateCount = lateTrackingEnabled(freshUser)
    ? sessions.filter(s => (typeof s.late === 'boolean' ? s.late : isLateEntry(s, freshUser))).length
    : 0;
  const undertimeCount = lateTrackingEnabled(freshUser)
    ? sessions.filter(s => (typeof s.undertime === 'boolean' ? s.undertime : isUndertimeEntry(s, freshUser))).length
    : 0;

  setProgressRing(stats.pct);

  setText('ringStat_logged', fmtHM(stats.totalMins));
  setText('ringStat_remaining', fmtHM(stats.remainMins));
  setText('ringStat_overtime', fmtHM(stats.overtimeMins));

  setText('statGoal', (freshUser.goal || 300) + 'h');
  setText('statDays', sessions.length);
  setText('statAttendance', attendance);
  setText('statAbsence', absence);
  setText('statAttendanceContext', `${attendanceRate}% attendance rate`);
  setText('statLate', lateCount);
  setText('statLateSub', lateTrackingEnabled(freshUser) ? `Late after ${fmt12(schedule.start)} · Undertime before ${fmt12(schedule.end)}` : 'Fixed schedule off');
  setText('statUndertime', undertimeCount);
  const deadline = deadlineStatus(freshUser, predicted, sessions);
  setText('statStatus', deadline.label);
  setText('statStatusSub', deadline.sub);
  setText('statPredictDate', predicted.label);
  setText('statPredictSub', predicted.sub);
  const upcoming = upcomingCountedHolidays(freshUser);
  const upcomingEl = document.getElementById('statUpcomingHolidays');
  if (upcomingEl) {
    if (upcoming.length) {
      upcomingEl.textContent = `Upcoming holidays:\n${upcoming.map(h => `${fmtDate(h.date)} (${h.label})`).join('\n')}`;
    } else {
      upcomingEl.textContent = 'Upcoming holidays: none';
    }
  }

  const statusEl = document.getElementById('statStatus');
  if (statusEl) {
    statusEl.className = 'stat-card-value ' +
      (stats.pct >= 100 ? 'green' : stats.pct >= 75 ? 'blue' : stats.pct >= 40 ? '' : 'yellow');
  }

  renderHistoryTable(sessions, freshUser.dailyHours || 8);
}

function statusLabel(pct) {
  if (pct >= 100) return '🎉 Complete';
  if (pct >= 75) return '🔥 Near Goal';
  if (pct >= 40) return '✅ On Track';
  return '⏳ In Progress';
}

function workdaysBetween(fromDate, toDate, user) {
  const start = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  if (end <= start) return 0;
  let days = 0;
  const cur = new Date(start);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const ds = cur.toISOString().slice(0, 10);
    if (!isNonWorkingDateForUser(ds, user)) days++;
  }
  return days;
}

function upcomingCountedHolidays(user, options = {}) {
  const maxItems = options.maxItems || 4;
  const horizonDays = options.horizonDays || 120;
  const target = user?.targetDate || '';
  const endDate = target || (() => {
    const d = new Date(todayStr() + 'T00:00:00');
    d.setDate(d.getDate() + horizonDays);
    return d.toISOString().slice(0, 10);
  })();
  const out = [];
  const cur = new Date(todayStr() + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end && out.length < maxItems) {
    const ds = cur.toISOString().slice(0, 10);
    const label = getHolidayLabel(ds, holidayOverrides(user));
    if (label) out.push({ date: ds, label });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function deadlineStatus(user, predicted, sessions) {
  const target = user.targetDate || '';
  const totalLogged = sessions.reduce((sum, s) => sum + (s.hours || 0), 0);
  const goal = user.goal || 300;
  const pct = Math.min(100, Math.round((totalLogged / goal) * 100));
  if (!target) return { label: statusLabel(pct), sub: 'Set target date for deadline check' };
  if (!predicted?.date) return { label: '⏳ In Progress', sub: `Target ${fmtDate(target)} · Need work history` };
  if (predicted.date <= target) return { label: '✅ Safe', sub: `On track for ${fmtDate(target)}` };

  const remaining = Math.max(0, goal - totalLogged);
  const leftDays = workdaysBetween(todayStr(), target, user);
  if (leftDays <= 0) return { label: '⚠ Will not finish before target', sub: `Target ${fmtDate(target)} has passed or is today` };
  const needPerDay = remaining / leftDays;
  if (needPerDay > (user.dailyHours || 8)) {
    return { label: '⚠ Will not finish before target', sub: `Need ${needPerDay.toFixed(2)}h/day by ${fmtDate(target)}` };
  }
  return { label: '⚠ Need overtime', sub: `Need ~${needPerDay.toFixed(2)}h/day by ${fmtDate(target)}` };
}

export function setTodayDate() {
  setVal('entryDate', todayStr());
}

export function setMeridiem(which, value) {
  if (which === 'in') setVal('entryInMeridiem', value);
  if (which === 'out') setVal('entryOutMeridiem', value);
  const { timeIn, timeOut } = readEntryTimes();
  if (timeIn) setNativeTime('entryIn', timeIn);
  if (timeOut) setNativeTime('entryOut', timeOut);
  updateEntryPreview();
}

export function setEditMeridiem(which, value) {
  if (which === 'in') setVal('editInMeridiem', value);
  if (which === 'out') setVal('editOutMeridiem', value);
  const { timeIn, timeOut } = readEditTimes();
  if (timeIn) setNativeTime('editIn', timeIn);
  if (timeOut) setNativeTime('editOut', timeOut);
  updateEditOvertimePreview();
}

export function toggleEntryAbsent() {
  const isAbsent = document.getElementById('entryAbsent')?.checked || false;
  setEntryAbsentUI(isAbsent);
  updateEntryPreview();
}

function updateEntryPreview() {
  const absent = document.getElementById('entryAbsent')?.checked || false;
  const preview = document.getElementById('overtimePreview');
  const previewText = document.getElementById('overtimePreviewText');
  if (absent) {
    preview?.classList.remove('show');
    return;
  }

  const { timeIn, timeOut } = readEntryTimes();
  const user = currentUserFresh();
  const daily = user?.dailyHours || 8;
  if (!timeIn || !timeOut) { preview?.classList.remove('show'); return; }

  const diffMins = timeToMins(timeOut) - timeToMins(timeIn);
  if (diffMins <= 0) { preview?.classList.remove('show'); return; }
  if (lateTrackingEnabled(user)) {
    const windowMins = scheduleWindowMins(timeIn, timeOut, user);
    const sched = workSchedule(user);
    previewText.textContent = `Fixed schedule active: ${fmtHM(windowMins)} counted within ${fmt12(sched.start)}-${fmt12(sched.end)}`;
    preview?.classList.add('show');
    return;
  }

  const { overtimeMins, lunchMins } = calcHours(timeIn, timeOut, daily, getLunchCfg(user));
  const otEnabled = overtimeEnabled(user);
  if (preview && previewText) {
    const lunchText = lunchMins > 0 ? `, ${fmtHM(lunchMins)} lunch deducted` : '';
    if (otEnabled && overtimeMins > 0) {
      previewText.textContent = `+${fmtHM(overtimeMins)} overtime detected (beyond ${daily}h standard${lunchText})`;
      preview.classList.add('show');
    } else if (!otEnabled && overtimeMins > 0) {
      previewText.textContent = `Overtime disabled: hours will be capped at ${daily}h${lunchText}`;
      preview.classList.add('show');
    } else if (lunchMins > 0) {
      previewText.textContent = `${fmtHM(lunchMins)} lunch deduction applied`;
      preview.classList.add('show');
    } else {
      preview.classList.remove('show');
    }
  }
}

/* ─── ADD MANUAL ENTRY ─── */
export function handleAddEntry() {
  const date = val('entryDate');
  const note = val('entryNote').trim();
  const absent = document.getElementById('entryAbsent')?.checked || false;

  if (!date) { toast('Please select a date.', 'error'); return; }

  const user = currentUserFresh();
  if (!user) return;

  let entry;
  if (absent) {
    entry = {
      id: uid(),
      date,
      timeIn: '--',
      timeOut: '--',
      hours: 0,
      overtime: 0,
      source: 'manual',
      absent: true,
      note: note || 'Absent',
    };
  } else {
    const { timeIn, timeOut } = readEntryTimes();
    if (!timeIn) { toast('Please enter Time In.', 'error'); return; }
    if (!timeOut) { toast('Please enter Time Out.', 'error'); return; }

    const diffMins = timeToMins(timeOut) - timeToMins(timeIn);
    if (diffMins <= 0) { toast('Time Out must be after Time In.', 'error'); return; }

    const daily = user.dailyHours || 8;
    const fixed = lateTrackingEnabled(user);
    let hours;
    let overtime;
    let lunchMins = 0;
    if (fixed) {
      hours = scheduleWindowMins(timeIn, timeOut, user) / 60;
      overtime = 0;
    } else {
      const calc = calcHours(timeIn, timeOut, daily, getLunchCfg(user));
      hours = calc.hours;
      overtime = calc.overtime;
      lunchMins = calc.lunchMins;
    }
    const policy = applyOvertimePolicy(hours, overtime, daily, user);
    entry = {
      id: uid(),
      date,
      timeIn,
      timeOut,
      hours: policy.finalHours,
      overtime: policy.finalOvertime,
      late: isLateEntry({ date, timeIn, absent: false }, user),
      undertime: isUndertimeEntry({ date, timeOut, absent: false }, user),
      source: 'manual',
      absent: false,
      note,
    };

    const sched = workSchedule(user);
    const msg = fixed
      ? `Added ${policy.finalHours}h for ${fmtDate(date)} (fixed schedule ${fmt12(sched.start)}-${fmt12(sched.end)})`
      : policy.finalOvertime > 0
      ? `Added ${fmtHM(diffMins)} (${fmtHM(Math.round(policy.finalOvertime * 60))} OT${lunchMins ? `, ${fmtHM(lunchMins)} lunch` : ''}) for ${fmtDate(date)}`
      : policy.wasCapped
        ? `Added ${policy.finalHours}h for ${fmtDate(date)} (capped to daily ${daily}h; overtime disabled)`
        : `Added ${fmtHM(diffMins)} for ${fmtDate(date)}${lunchMins ? ` (${fmtHM(lunchMins)} lunch deducted)` : ''}`;
    toast(msg, 'success');
  }

  const sessions = getSessions(user.id);
  sessions.push(entry);
  setSessions(user.id, sessions);

  if (absent) toast(`Marked ${fmtDate(date)} as absent.`, 'info');

  setTodayDate();
  setVal('entryNote', '');
  const absentEl = document.getElementById('entryAbsent');
  if (absentEl) absentEl.checked = false;
  setEntryAbsentUI(false);
  syncPickerFromTime('entryIn', '08:00', { hour: '08', minute: '00', meridiem: 'AM' });
  syncPickerFromTime('entryOut', '17:00', { hour: '05', minute: '00', meridiem: 'PM' });
  updateEntryPreview();
  refresh();
}

export function openEditEntry(entryId) {
  const user = getCurrentUser();
  const sessions = getSessions(user.id);
  const entry = sessions.find(s => s.id === entryId);
  if (!entry) { toast('Entry not found.', 'error'); return; }

  _editingEntryId = entryId;
  setVal('editEntryDate', entry.date);
  setVal('editEntryNote', entry.note || '');
  const editAbsentEl = document.getElementById('editEntryAbsent');
  if (editAbsentEl) editAbsentEl.checked = !!entry.absent;
  toggleEditAbsent();

  syncPickerFromTime('editIn', entry.timeIn === '--' ? '08:00' : entry.timeIn, { hour: '08', minute: '00', meridiem: 'AM' });
  syncPickerFromTime('editOut', entry.timeOut === '--' ? '17:00' : entry.timeOut, { hour: '05', minute: '00', meridiem: 'PM' });
  readEditTimes();
  updateEditOvertimePreview();
  openModal('editEntryModal');
}

function toggleEditAbsent() {
  const absent = document.getElementById('editEntryAbsent')?.checked || false;
  document.getElementById('editTimeFields')?.classList.toggle('hidden', absent);
}

export function updateEditOvertimePreview() {
  const preview = document.getElementById('editOvertimePreview');
  const previewText = document.getElementById('editOvertimePreviewText');
  const absent = document.getElementById('editEntryAbsent')?.checked || false;
  if (absent) { preview?.classList.remove('show'); return; }

  const { timeIn, timeOut } = readEditTimes();
  const user = currentUserFresh();
  const daily = user?.dailyHours || 8;
  if (!timeIn || !timeOut) { preview?.classList.remove('show'); return; }
  if (timeToMins(timeOut) <= timeToMins(timeIn)) { preview?.classList.remove('show'); return; }
  if (lateTrackingEnabled(user)) {
    const windowMins = scheduleWindowMins(timeIn, timeOut, user);
    const sched = workSchedule(user);
    previewText.textContent = `Fixed schedule active: ${fmtHM(windowMins)} counted within ${fmt12(sched.start)}-${fmt12(sched.end)}`;
    preview?.classList.add('show');
    return;
  }

  const { overtimeMins, lunchMins } = calcHours(timeIn, timeOut, daily, getLunchCfg(user));
  const otEnabled = overtimeEnabled(user);
  if (preview && previewText) {
    if (otEnabled && overtimeMins > 0) {
      previewText.textContent = `+${fmtHM(overtimeMins)} overtime detected${lunchMins ? `, ${fmtHM(lunchMins)} lunch deducted` : ''}`;
      preview.classList.add('show');
    } else if (!otEnabled && overtimeMins > 0) {
      previewText.textContent = `Overtime disabled: hours will be capped at ${daily}h${lunchMins ? `, ${fmtHM(lunchMins)} lunch deducted` : ''}`;
      preview.classList.add('show');
    } else if (lunchMins > 0) {
      previewText.textContent = `${fmtHM(lunchMins)} lunch deduction applied`;
      preview.classList.add('show');
    } else {
      preview.classList.remove('show');
    }
  }
}

export function saveEditEntry() {
  const entryId = _editingEntryId;
  if (!entryId) { toast('No entry selected.', 'error'); return; }

  const date = val('editEntryDate');
  const note = val('editEntryNote').trim();
  const absent = document.getElementById('editEntryAbsent')?.checked || false;
  if (!date) { toast('Please select a date.', 'error'); return; }

  const user = currentUserFresh();
  const sessions = getSessions(user.id);
  const idx = sessions.findIndex(s => s.id === entryId);
  if (idx === -1) { toast('Entry not found.', 'error'); return; }

  if (absent) {
    sessions[idx] = { ...sessions[idx], date, timeIn: '--', timeOut: '--', hours: 0, overtime: 0, absent: true, note: note || 'Absent' };
  } else {
    const { timeIn, timeOut } = readEditTimes();
    if (!timeIn || !timeOut) { toast('Please provide both Time In and Time Out.', 'error'); return; }
    const diff = timeToMins(timeOut) - timeToMins(timeIn);
    if (diff <= 0) { toast('Time Out must be after Time In.', 'error'); return; }

    const daily = user.dailyHours || 8;
    const fixed = lateTrackingEnabled(user);
    let hours;
    let overtime;
    if (fixed) {
      hours = scheduleWindowMins(timeIn, timeOut, user) / 60;
      overtime = 0;
    } else {
      const calc = calcHours(timeIn, timeOut, daily, getLunchCfg(user));
      hours = calc.hours;
      overtime = calc.overtime;
    }
    const policy = applyOvertimePolicy(hours, overtime, daily, user);
    sessions[idx] = {
      ...sessions[idx],
      date,
      timeIn,
      timeOut,
      hours: policy.finalHours,
      overtime: policy.finalOvertime,
      late: isLateEntry({ ...sessions[idx], date, timeIn, absent: false }, user),
      undertime: isUndertimeEntry({ ...sessions[idx], date, timeOut, absent: false }, user),
      absent: false,
      note,
    };
  }

  setSessions(user.id, sessions);
  closeModal('editEntryModal');
  _editingEntryId = null;
  toast('Entry updated.', 'success');
  refresh();
}

export async function deleteEntry(entryId) {
  const { confirm } = await import('./ui.js');
  const ok = await confirm('Delete Entry', 'Remove this time record? This cannot be undone.', 'Delete', 'btn-danger');
  if (!ok) return;
  const user = getCurrentUser();
  removeSession(user.id, entryId);
  toast('Entry removed.', 'info');
  refresh();
}

export async function clearAll() {
  const { confirm } = await import('./ui.js');
  const ok = await confirm('Clear All Records', 'This will permanently delete ALL time records for your account.', 'Clear All', 'btn-danger');
  if (!ok) return;
  const user = getCurrentUser();
  clearSessions(user.id);
  toast('All records cleared.', 'info');
  refresh();
}

export function openSettings() {
  const user = currentUserFresh();
  setVal('settingGoal', user.goal || 300);
  setVal('settingTargetDate', user.targetDate || '');
  setVal('settingDaily', user.dailyHours || 8);
  setVal('settingName', user.name || '');
  setVal('settingUsername', user.username || user.id || '');
  const overtimeEl = document.getElementById('settingOvertimeEnabled');
  if (overtimeEl) overtimeEl.checked = overtimeEnabled(user);
  const lateEl = document.getElementById('settingLateEnabled');
  if (lateEl) lateEl.checked = lateTrackingEnabled(user);
  const sched = workSchedule(user);
  syncPickerFromTime('scheduleStart', sched.start, { hour: '08', minute: '00', meridiem: 'AM' });
  syncPickerFromTime('scheduleEnd', sched.end, { hour: '05', minute: '00', meridiem: 'PM' });
  const lunch = getLunchCfg(user);
  const lunchEnabled = document.getElementById('settingLunchEnabled');
  if (lunchEnabled) lunchEnabled.checked = !!lunch.enabled;
  syncPickerFromTime('lunchStart', lunch.start || '11:20', { hour: '11', minute: '20', meridiem: 'AM' });
  syncPickerFromTime('lunchEnd', lunch.end || '12:20', { hour: '12', minute: '20', meridiem: 'PM' });
  setVal('settingHolidayAdd', (holidayOverrides(user).add || []).join('\n'));
  setVal('settingHolidayRemove', (holidayOverrides(user).remove || []).join('\n'));
  setVal('settingCurrentPassword', '');
  setVal('settingNewPassword', '');
  setVal('settingConfirmPassword', '');
  openModal('settingsModal');
}

export function saveSettings() {
  const goal = parseFloat(val('settingGoal'));
  const targetDate = val('settingTargetDate');
  const daily = parseFloat(val('settingDaily'));
  const name = val('settingName').trim();
  const username = val('settingUsername').trim().toLowerCase();
  const overtimeOn = document.getElementById('settingOvertimeEnabled')?.checked ?? true;
  const lateOn = document.getElementById('settingLateEnabled')?.checked ?? false;
  const scheduleStart = buildTimeFromPicker('scheduleStart');
  const scheduleEnd = buildTimeFromPicker('scheduleEnd');
  const lunchEnabled = document.getElementById('settingLunchEnabled')?.checked || false;
  const lunchStart = buildTimeFromPicker('lunchStart');
  const lunchEnd = buildTimeFromPicker('lunchEnd');
  const holidayAdd = parseDateList(val('settingHolidayAdd'));
  const holidayRemove = parseDateList(val('settingHolidayRemove'));
  const currentPass = val('settingCurrentPassword');
  const newPass = val('settingNewPassword');
  const confirmPass = val('settingConfirmPassword');

  if (!goal || goal < 1) { toast('Goal must be at least 1 hour.', 'error'); return; }
  if (!daily || daily < 1) { toast('Daily hours must be at least 1.', 'error'); return; }
  if (!username) { toast('Username is required.', 'error'); return; }
  if (!/^[a-z0-9_]+$/.test(username)) { toast('Username must use lowercase letters, numbers, or underscore.', 'error'); return; }
  if (!scheduleStart || !scheduleEnd || timeToMins(scheduleEnd) <= timeToMins(scheduleStart)) {
    toast('Work schedule must have a valid start and end time.', 'error');
    return;
  }
  if (lunchEnabled && (!lunchStart || !lunchEnd || timeToMins(lunchEnd) <= timeToMins(lunchStart))) {
    toast('Lunch window must have a valid start and end time.', 'error');
    return;
  }

  const user = getCurrentUser();
  const fresh = getUser(user.id) || user;
  if (newPass || confirmPass || currentPass) {
    if (!currentPass) { toast('Enter current password to change it.', 'error'); return; }
    if (currentPass !== fresh.password) { toast('Current password is incorrect.', 'error'); return; }
    if (!newPass || newPass.length < 4) { toast('New password must be at least 4 characters.', 'error'); return; }
    if (newPass !== confirmPass) { toast('New passwords do not match.', 'error'); return; }
  }

  const updated = {
    ...fresh,
    goal,
    targetDate: targetDate || '',
    dailyHours: daily,
    overtimeEnabled: overtimeOn,
    lateTrackingEnabled: lateOn,
    scheduleStart,
    scheduleEnd,
    manualHolidaysAdd: holidayAdd,
    manualHolidaysRemove: holidayRemove,
    name: name || fresh.name,
    username,
    password: newPass ? newPass : fresh.password,
    lunchBreak: {
      enabled: lunchEnabled,
      start: lunchStart || '11:20',
      end: lunchEnd || '12:20',
    },
  };

  let activeUser = updated;
  if (username !== fresh.id) {
    const users = getUsers();
    if (users[username]) { toast('That username is already taken.', 'error'); return; }
    const migrated = migrateUserId(fresh.id, username);
    if (!migrated) { toast('Failed to change username.', 'error'); return; }
    activeUser = { ...updated, id: username, username };
  }

  saveUser(activeUser);
  setCurrentUser(activeUser);
  recalcAllSessions(activeUser);
  setTopbarUser(activeUser);
  setText('userGreetName', firstName(activeUser.name));

  closeModal('settingsModal');
  toast('Settings saved.', 'success');
  refresh();
}

/* ─── IMPORT ─── */
function parseDtrText(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const dateMatch = line.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})/);
    if (!dateMatch) continue;
    const date = parseFlexibleDate(dateMatch[1]);
    if (!date) continue;

    const absent = /\b(absent|no work|nowork|leave)\b/i.test(line);
    if (absent) {
      rows.push({ date, timeIn: '--', timeOut: '--', absent: true, note: 'Imported absent', source: 'import' });
      continue;
    }

    const withoutDate = line.replace(dateMatch[1], ' ');
    const times = withoutDate.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\b/gi) || [];
    const parsedTimes = times.map(t => parseFlexibleTime(t)).filter(Boolean);
    if (parsedTimes.length < 2) continue;
    const tIn = parsedTimes[0];
    const tOut = parsedTimes[1];
    if (!tIn || !tOut) continue;
    if (timeToMins(tOut) <= timeToMins(tIn)) continue;
    rows.push({ date, timeIn: tIn, timeOut: tOut, absent: false, note: 'Imported from text', source: 'import' });
  }
  return rows;
}

function looksLikeDuplicate(targetSessions, row) {
  return targetSessions.some(s =>
    s.date === row.date &&
    (s.absent ? '--' : s.timeIn) === (row.absent ? '--' : row.timeIn) &&
    (s.absent ? '--' : s.timeOut) === (row.absent ? '--' : row.timeOut),
  );
}

function renderImportPreview(items) {
  const tbody = document.getElementById('importPreviewTbody');
  const empty = document.getElementById('importPreviewEmpty');
  if (!tbody || !empty) return;
  tbody.innerHTML = '';
  if (!items.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  items.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${fmtDate(row.date)}</td>
      <td>${row.absent ? 'Absent' : fmt12(row.timeIn)}</td>
      <td>${row.absent ? '—' : fmt12(row.timeOut)}</td>
      <td>${row.note || '—'}</td>
    `;
    tbody.appendChild(tr);
  });
}

export function openImportModal() {
  _importPreview = [];
  setVal('importText', '');
  renderImportPreview([]);
  openModal('importModal');
}

export function previewImport() {
  const raw = val('importText');
  if (!raw.trim()) { toast('Paste DTR text first.', 'warning'); return; }
  _importPreview = parseDtrText(raw);
  renderImportPreview(_importPreview);
  if (!_importPreview.length) toast('No valid entries detected.', 'warning');
  else toast(`Detected ${_importPreview.length} entries.`, 'success');
}

export function importParsedEntries() {
  if (!_importPreview.length) { toast('No parsed entries to import.', 'warning'); return; }
  const user = currentUserFresh();
  const sessions = getSessions(user.id);

  const incoming = _importPreview.map(row => {
    if (row.absent) {
      return {
        id: uid(), date: row.date, timeIn: '--', timeOut: '--', hours: 0, overtime: 0,
        source: 'import', absent: true, note: row.note || 'Imported absent',
      };
    }
    const daily = user.dailyHours || 8;
    const fixed = lateTrackingEnabled(user);
    let hours;
    let overtime;
    if (fixed) {
      hours = scheduleWindowMins(row.timeIn, row.timeOut, user) / 60;
      overtime = 0;
    } else {
      const calc = calcHours(row.timeIn, row.timeOut, daily, getLunchCfg(user));
      hours = calc.hours;
      overtime = calc.overtime;
    }
    const policy = applyOvertimePolicy(hours, overtime, daily, user);
    return {
      id: uid(), date: row.date, timeIn: row.timeIn, timeOut: row.timeOut,
      hours: policy.finalHours,
      overtime: policy.finalOvertime,
      late: isLateEntry({ ...row, absent: false }, user),
      undertime: isUndertimeEntry({ ...row, absent: false }, user),
      source: 'import', absent: false, note: row.note || '',
    };
  });
  const deduped = incoming.filter(row => !looksLikeDuplicate(sessions, row));
  if (!deduped.length) {
    toast('All parsed entries already exist.', 'info');
    return;
  }
  setSessions(user.id, [...sessions, ...deduped]);
  closeModal('importModal');
  toast(`Imported ${deduped.length} entries.`, 'success');
  refresh();
}

/* ─── EXPORT ─── */
export function openExportModal() {
  const user = currentUserFresh();
  const p = user?.exportProfile || {};
  setVal('exportTemplateType', p.templateType || 'quick');
  setVal('exportTitle', p.title || '');
  setVal('exportLogoUrl', p.logoUrl || '');
  setVal('exportOrganization', p.organization || '');
  setVal('exportStudentName', p.studentName || user?.name || '');
  setVal('exportStudentId', p.studentId || '');
  setVal('exportProgram', p.program || '');
  setVal('exportDetails', p.details || '');
  setVal('exportCustomTemplate', p.customTemplate || '');
  setExportAdditionalInfoRows(Array.isArray(p.additionalInfo) ? p.additionalInfo : []);
  updateExportTemplateUI();
  openModal('exportModal');
}

function exportAdditionalListEl() {
  return document.getElementById('exportAdditionalInfoList');
}

function createAdditionalInfoRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'export-additional-row';
  row.innerHTML = `
    <input class="input-field export-add-title" placeholder="Title (e.g. Supervisor)" value="${(item.title || '').replace(/"/g, '&quot;')}">
    <input class="input-field export-add-value" placeholder="Value (e.g. Juan Dela Cruz)" value="${(item.value || '').replace(/"/g, '&quot;')}">
    <button type="button" class="btn btn-ghost btn-sm">Remove</button>
  `;
  row.querySelector('button')?.addEventListener('click', () => row.remove());
  return row;
}

function setExportAdditionalInfoRows(items = []) {
  const list = exportAdditionalListEl();
  if (!list) return;
  list.innerHTML = '';
  const safeItems = items.filter(it => (it?.title || '').trim() || (it?.value || '').trim());
  (safeItems.length ? safeItems : [{}]).forEach(item => list.appendChild(createAdditionalInfoRow(item)));
}

export function addExportAdditionalInfoRow() {
  const list = exportAdditionalListEl();
  if (!list) return;
  list.appendChild(createAdditionalInfoRow({}));
}

function readExportAdditionalInfoRows() {
  const list = exportAdditionalListEl();
  if (!list) return [];
  return [...list.querySelectorAll('.export-additional-row')].map(row => ({
    title: row.querySelector('.export-add-title')?.value?.trim() || '',
    value: row.querySelector('.export-add-value')?.value?.trim() || '',
  })).filter(it => it.title || it.value);
}

export function updateExportTemplateUI() {
  const type = val('exportTemplateType') || 'quick';
  const metaWrap = document.getElementById('exportMetaFields');
  const customWrap = document.getElementById('exportCustomTemplateWrap');
  if (metaWrap) metaWrap.classList.toggle('hidden', type === 'quick');
  if (customWrap) customWrap.classList.toggle('hidden', type !== 'custom');
  if (type === 'university') {
    if (!val('exportTitle')) setVal('exportTitle', 'University OJT Daily Time Record');
  } else if (type === 'quick' && val('exportTitle').includes('Daily Time Record')) {
    setVal('exportTitle', '');
  }
}

function readExportOptions(freshUser) {
  const profile = freshUser.exportProfile || {};
  const additionalInfo = readExportAdditionalInfoRows();
  const resolvedMeta = {
    title: val('exportTitle').trim() || profile.title || '',
    logoUrl: val('exportLogoUrl').trim() || profile.logoUrl || '',
    organization: val('exportOrganization').trim() || profile.organization || '',
    studentName: val('exportStudentName').trim() || profile.studentName || freshUser.name,
    studentId: val('exportStudentId').trim() || profile.studentId || '',
    program: val('exportProgram').trim() || profile.program || '',
    additionalInfo: additionalInfo.length ? additionalInfo : (Array.isArray(profile.additionalInfo) ? profile.additionalInfo : []),
    details: val('exportDetails').trim() || profile.details || '',
  };
  const customTemplate = val('exportCustomTemplate').trim() || profile.customTemplate || '';
  const templateType = val('exportTemplateType') || profile.templateType || 'quick';
  const updated = {
    ...freshUser,
    exportProfile: {
      ...profile,
      templateType,
      ...resolvedMeta,
      customTemplate,
    },
  };
  saveUser(updated);
  setCurrentUser(updated);
  return {
    templateType,
    meta: resolvedMeta,
    customTemplate,
  };
}

export function doExportCSV() {
  const user = getCurrentUser();
  const fresh = getUser(user.id) || user;
  const sessions = getSessions(user.id);
  if (!sessions.length) { toast('No records to export.', 'warning'); return; }
  exportCSV(fresh, sessions);
  closeModal('exportModal');
  toast('CSV downloaded!', 'success');
}

export function doExportPrint() {
  const user = getCurrentUser();
  const fresh = getUser(user.id) || user;
  const sessions = getSessions(user.id);
  if (!sessions.length) { toast('No records to export.', 'warning'); return; }
  const options = readExportOptions(fresh);
  if (options.templateType === 'custom' && !options.customTemplate) {
    toast('Please provide a custom HTML template.', 'warning');
    return;
  }
  exportPrint(fresh, sessions, options);
  closeModal('exportModal');
}

/* ─── RENDER TABLE ─── */
export function renderHistoryTable(sessions, dailyHours = 8, tbodyId = 'historyTbody', emptyId = 'historyEmpty', userForHolidays = null) {
  const tbody = document.getElementById(tbodyId);
  const empty = document.getElementById(emptyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!sessions.length) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  sorted.forEach((s, i) => {
    const hrs = parseFloat(s.hours) || 0;
    const ot = parseFloat(s.overtime) || 0;
    const isOT = ot > 0;
    const h = Math.floor(hrs);
    const m = Math.round((hrs - h) * 60);
    const otH = Math.floor(ot);
    const otM = Math.round((ot - otH) * 60);
    const holidayUser = userForHolidays || currentUserFresh();
    const holiday = getHolidayLabel(s.date, holidayOverrides(holidayUser));

    const tr = document.createElement('tr');
    if (isOT) tr.classList.add('row-overtime');

    const sourceMark = s.source === 'import' ? '📥' : s.source === 'punch' ? '🟢' : '✏️';
    const tags = [];
    if (s.late) tags.push('<span class="badge badge-red">Late</span>');
    if (s.undertime) tags.push('<span class="badge badge-yellow">Undertime</span>');
    const note = [s.note || '', tags.join(' ')].filter(Boolean).join(' ').trim() || '—';

    tr.innerHTML = `
      <td class="mono" style="color:var(--text3);font-size:0.72rem">${sorted.length - i}</td>
      <td class="td-main">
        ${fmtDate(s.date)}
        ${holiday ? `<div class="holiday-flag" title="${holiday}">🇵🇭 ${holiday}</div>` : ''}
      </td>
      <td>${s.absent ? 'Absent' : fmt12(s.timeIn)}</td>
      <td>${s.absent ? '—' : fmt12(s.timeOut)}</td>
      <td class="td-num">${s.absent ? '0h 0m' : `${h}h ${m}m`}</td>
      <td>${isOT ? `<span class="badge badge-purple"><span class="badge-dot"></span>+${otH}h ${otM}m</span>` : '<span class="badge badge-neutral">—</span>'}</td>
      <td style="color:var(--text3);font-size:0.75rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;">${note}</td>
      <td style="color:var(--text3);font-size:0.7rem">${sourceMark}</td>
      ${tbodyId === 'historyTbody'
        ? `<td style="display:flex;gap:0.4rem;"><button class="btn btn-secondary btn-sm" onclick="window.dtr.openEditEntry('${s.id}')">✎</button><button class="btn btn-danger btn-sm" onclick="window.dtr.deleteEntry('${s.id}')">✕</button></td>`
        : ''}
    `;
    tbody.appendChild(tr);
  });
}

window.addEventListener('change', e => {
  if (e.target?.id === 'editEntryAbsent') toggleEditAbsent();
  if (e.target?.id === 'editInMeridiem') setEditMeridiem('in', e.target.value);
  if (e.target?.id === 'editOutMeridiem') setEditMeridiem('out', e.target.value);
});

