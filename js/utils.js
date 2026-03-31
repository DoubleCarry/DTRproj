/**
 * DTR — Utility / Helper Functions
 */

const PH_TZ = 'en-PH';

/** Format total minutes → "Xh Ym" */
export function fmtHM(totalMins) {
  const absMin = Math.abs(Math.round(totalMins));
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  const sign = totalMins < 0 ? '-' : '';
  return `${sign}${h}h ${m}m`;
}

/** Format decimal hours → "Xh Ym" */
export function fmtHours(hours) {
  return fmtHM(Math.round(hours * 60));
}

/** Format "HH:MM" 24h → "H:MM AM/PM" */
export function fmt12(t) {
  if (!t || t === '--') return '--';
  const [hStr, mStr] = t.split(':');
  const hh = parseInt(hStr, 10);
  const mm = mStr || '00';
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12  = (hh % 12) || 12;
  return `${h12}:${mm} ${ampm}`;
}

/** Format date string "YYYY-MM-DD" → "Jan 01, 2025" */
export function fmtDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(PH_TZ, { month: 'short', day: '2-digit', year: 'numeric' });
}

/** Today's date as "YYYY-MM-DD" */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Current time as "HH:MM" */
export function nowTimeStr() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

export function timeToMins(time24) {
  const [h, m] = time24.split(':').map(Number);
  return (h * 60) + m;
}

export function minsToTime(mins) {
  const safe = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlapMins(startA, endA, startB, endB) {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return Math.max(0, end - start);
}

export function calcLunchDeductionMins(timeIn, timeOut, lunchCfg) {
  if (!lunchCfg?.enabled) return 0;
  if (!timeIn || !timeOut || timeIn === '--' || timeOut === '--') return 0;
  if (!lunchCfg.start || !lunchCfg.end) return 0;

  const workStart = timeToMins(timeIn);
  const workEnd = timeToMins(timeOut);
  const lunchStart = timeToMins(lunchCfg.start);
  const lunchEnd = timeToMins(lunchCfg.end);

  if (workEnd <= workStart || lunchEnd <= lunchStart) return 0;
  return overlapMins(workStart, workEnd, lunchStart, lunchEnd);
}

/**
 * Calculate hours between two "HH:MM" strings.
 * Returns { totalMins, hours, overtime, overtimeMins }
 * @param {string} timeIn   - "HH:MM"
 * @param {string} timeOut  - "HH:MM"
 * @param {number} dailyStd - standard daily hours (default 8)
 */
export function calcHours(timeIn, timeOut, dailyStd = 8, lunchCfg = null) {
  const rawMins = timeToMins(timeOut) - timeToMins(timeIn);
  const lunchMins = calcLunchDeductionMins(timeIn, timeOut, lunchCfg);
  const totalMins = Math.max(0, rawMins - lunchMins);
  const hours       = totalMins / 60;
  const stdMins     = dailyStd * 60;
  const overtimeMins = Math.max(0, totalMins - stdMins);
  const overtime    = overtimeMins / 60;
  return { totalMins, hours, overtime, overtimeMins, rawMins, lunchMins };
}

/** Aggregate session stats for a user */
export function calcStats(sessions, goal, dailyHours = 8) {
  let totalMins = 0;
  let overtimeMins = 0;
  let todayMins = 0;
  const today = todayStr();

  sessions.forEach(s => {
    const mins = Math.round(s.hours * 60);
    totalMins += mins;
    overtimeMins += Math.round((s.overtime || 0) * 60);
    if (s.date === today) todayMins += mins;
  });

  const goalMins     = goal * 60;
  const remainMins   = Math.max(0, goalMins - totalMins);
  const pct          = Math.min(100, Math.round((totalMins / goalMins) * 100));
  const totalHours   = totalMins / 60;

  return { totalMins, totalHours, overtimeMins, todayMins, remainMins, pct };
}

/** Format the live clock string */
export function fmtClock(d = new Date()) {
  const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh   = ((h % 12) || 12).toString().padStart(2, '0');
  const mm   = m.toString().padStart(2, '0');
  const ss   = s.toString().padStart(2, '0');
  return `${hh}:${mm}:${ss} ${ampm}`;
}

/** Clamp a number between min and max */
export function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

/** Get first name from full name */
export function firstName(name) { return (name || '').split(' ')[0]; }

/** Build initial letter for avatar */
export function avatarLetter(name) { return (name || '?')[0].toUpperCase(); }

export function nextWeekday(date) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

export function predictCompletionDate(sessions, goalHours, options = {}) {
  const isNonWorkingDate = options.isNonWorkingDate || (dateStr => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
  });
  const logged = sessions.reduce((sum, s) => sum + (s.hours || 0), 0);
  const remaining = Math.max(0, goalHours - logged);
  if (remaining <= 0) return { label: 'Completed', sub: 'Goal already reached', date: todayStr(), avgPerDay: 0 };

  const workedDays = sessions.filter(s => !s.absent && (s.hours || 0) > 0);
  const uniqueDays = [...new Set(workedDays.map(s => s.date))];
  if (!uniqueDays.length) return { label: '—', sub: 'Need at least one worked day', date: null, avgPerDay: 0 };

  const avgPerDay = workedDays.reduce((sum, s) => sum + (s.hours || 0), 0) / uniqueDays.length;
  if (avgPerDay <= 0) return { label: '—', sub: 'Average hours unavailable', date: null, avgPerDay: 0 };

  const neededDays = Math.ceil(remaining / avgPerDay);
  let cursor = new Date(todayStr() + 'T00:00:00');
  let counted = 0;
  while (counted < neededDays) {
    cursor.setDate(cursor.getDate() + 1);
    const ds = cursor.toISOString().slice(0, 10);
    if (!isNonWorkingDate(ds)) counted++;
  }

  const dateStr = cursor.toISOString().slice(0, 10);
  return {
    label: fmtDate(dateStr),
    sub: `~${neededDays} work day${neededDays > 1 ? 's' : ''} at ${avgPerDay.toFixed(2)}h/day`,
    date: dateStr,
    avgPerDay,
  };
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function shiftDate(baseDateUtc, days) {
  const d = new Date(baseDateUtc);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const FIXED_PH_HOLIDAYS = [
  ['01-01', 'New Year\'s Day'],
  ['04-09', 'Araw ng Kagitingan'],
  ['05-01', 'Labor Day'],
  ['06-12', 'Independence Day'],
  ['08-21', 'Ninoy Aquino Day'],
  ['11-01', 'All Saints\' Day'],
  ['11-30', 'Bonifacio Day'],
  ['12-08', 'Feast of the Immaculate Conception'],
  ['12-25', 'Christmas Day'],
  ['12-30', 'Rizal Day'],
];

function lastMondayOfAugust(year) {
  const d = new Date(Date.UTC(year, 7, 31)); // Aug 31
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getPhilippineHolidays(year) {
  const map = new Map();
  FIXED_PH_HOLIDAYS.forEach(([md, name]) => map.set(`${year}-${md}`, name));
  map.set(lastMondayOfAugust(year), 'National Heroes Day');

  const easter = easterSunday(year);
  map.set(shiftDate(easter, -3), 'Maundy Thursday');
  map.set(shiftDate(easter, -2), 'Good Friday');
  map.set(shiftDate(easter, -1), 'Black Saturday');

  return map;
}

export function getHolidayLabel(dateStr, overrides = null) {
  if (!dateStr) return '';
  const addSet = new Set((overrides?.add || []).filter(Boolean));
  const removeSet = new Set((overrides?.remove || []).filter(Boolean));
  if (addSet.has(dateStr)) return 'Manual Holiday';
  if (removeSet.has(dateStr)) return '';
  const year = Number(dateStr.slice(0, 4));
  if (!year) return '';
  const holidays = getPhilippineHolidays(year);
  return holidays.get(dateStr) || '';
}

export function parseFlexibleTime(raw) {
  if (!raw) return null;
  const value = raw.trim().toUpperCase().replace(/\./g, '');
  const m = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = Number(m[2] || '0');
  const ap = m[3] || null;
  if (mm < 0 || mm > 59) return null;

  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'AM' && h === 12) h = 0;
    if (ap === 'PM' && h !== 12) h += 12;
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function parseFlexibleDate(raw) {
  if (!raw) return null;
  const src = raw.trim();
  const iso = src.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const mdy = src.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (mdy) {
    const y = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${y}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }

  const d = new Date(src);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
