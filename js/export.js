/**
 * DTR — Export Module
 * Handles CSV export and printable DTR view.
 */

import { fmt12, fmtDate, calcStats, getHolidayLabel } from './utils.js';

/* ─── CSV EXPORT ─── */
export function exportCSV(user, sessions) {
  const overrides = {
    add: Array.isArray(user?.manualHolidaysAdd) ? user.manualHolidaysAdd : [],
    remove: Array.isArray(user?.manualHolidaysRemove) ? user.manualHolidaysRemove : [],
  };
  const rows = [
    ['DTR Export — ' + user.name],
    ['Username:', user.username, 'Goal:', user.goal + 'h', 'Daily Standard:', user.dailyHours + 'h'],
    ['Generated:', new Date().toLocaleString('en-PH')],
    [],
    ['#', 'Date', 'Time In', 'Time Out', 'Total Hours', 'Overtime Hours', 'Note'],
  ];

  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach((s, i) => {
    const holiday = getHolidayLabel(s.date, overrides);
    rows.push([
      i + 1,
      holiday ? `${fmtDate(s.date)} (${holiday})` : fmtDate(s.date),
      s.absent ? 'Absent' : fmt12(s.timeIn),
      s.absent ? '—' : fmt12(s.timeOut),
      parseFloat(s.hours).toFixed(2),
      parseFloat(s.overtime || 0).toFixed(2),
      s.note || '',
    ]);
  });

  const stats = calcStats(sessions, user.goal, user.dailyHours);
  rows.push([]);
  rows.push(['SUMMARY']);
  rows.push(['Total Hours Logged', (stats.totalMins / 60).toFixed(2)]);
  rows.push(['Total Overtime Hours', (stats.overtimeMins / 60).toFixed(2)]);
  rows.push(['Remaining Hours', (stats.remainMins / 60).toFixed(2)]);
  rows.push(['Progress', stats.pct + '%']);

  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(csv, `DTR_${user.username}_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
}

/* ─── PRINT / PDF ─── */
export function exportPrint(user, sessions, options = {}) {
  const overrides = {
    add: Array.isArray(user?.manualHolidaysAdd) ? user.manualHolidaysAdd : [],
    remove: Array.isArray(user?.manualHolidaysRemove) ? user.manualHolidaysRemove : [],
  };
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const stats  = calcStats(sessions, user.goal, user.dailyHours);
  const templateType = options.templateType || 'quick';
  const meta = options.meta || {};

  const rows = sorted.map((s, i) => {
    const otHrs = (s.overtime || 0).toFixed(2);
    const isOT  = (s.overtime || 0) > 0;
    const holiday = getHolidayLabel(s.date, overrides);
    return `
      <tr ${isOT ? 'class="ot-row"' : ''}>
        <td>${i + 1}</td>
        <td>${fmtDate(s.date)}${holiday ? ` <small style="color:#946200">(${holiday})</small>` : ''}</td>
        <td>${s.absent ? 'Absent' : fmt12(s.timeIn)}</td>
        <td>${s.absent ? '—' : fmt12(s.timeOut)}</td>
        <td>${parseFloat(s.hours).toFixed(2)}</td>
        <td>${isOT ? `<span class="ot-badge">${otHrs} hrs OT</span>` : '—'}</td>
        <td>${s.note || '—'}</td>
      </tr>`;
  }).join('');

  const defaultTitle = templateType === 'university'
    ? 'University OJT Daily Time Record'
    : 'Daily Time Record';

  const titleText = (meta.title || '').trim() || defaultTitle;
  const studentName = (meta.studentName || '').trim() || user.name;
  const orgText = (meta.organization || '').trim();
  const additionalInfo = Array.isArray(meta.additionalInfo) ? meta.additionalInfo : [];
  const detailsText = (meta.details || '').trim();
  const logoUrl = (meta.logoUrl || '').trim();
  const logoBlock = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="height:56px;object-fit:contain;">` : '';
  const additionalSegments = additionalInfo
    .map(it => ({ title: (it?.title || '').trim(), value: (it?.value || '').trim() }))
    .filter(it => it.title && it.value)
    .map(it => `<span><strong>${escapeHtml(it.title)}:</strong> ${escapeHtml(it.value)}</span>`);
  const profileLine = [
    orgText ? `<span><strong>Organization:</strong> ${escapeHtml(orgText)}</span>` : '',
    (meta.studentId || '').trim() ? `<span><strong>Student ID:</strong> ${escapeHtml(meta.studentId)}</span>` : '',
    (meta.program || '').trim() ? `<span><strong>Program:</strong> ${escapeHtml(meta.program)}</span>` : '',
    ...additionalSegments,
    detailsText ? `<span><strong>Details:</strong> ${escapeHtml(detailsText)}</span>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const defaultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DTR — ${escapeHtml(studentName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', sans-serif; font-size: 11pt; color: #111; background: #fff; padding: 24px; }
  h1  { font-size: 18pt; margin-bottom: 2px; }
  .sub { font-size: 9pt; color: #555; margin-bottom: 16px; }
  .meta { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
  .meta-item .label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 2px; }
  .meta-item .value { font-size: 13pt; font-weight: 700; color: #222; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f4f6f8; padding: 7px 9px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #555; border: 1px solid #e0e0e0; text-align: left; }
  td { padding: 6px 9px; font-size: 9.5pt; border: 1px solid #e8e8e8; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  .ot-row td { background: #fdf4ff !important; }
  .ot-badge { background: #e9d5ff; color: #6b21a8; font-size: 8pt; font-weight: 600; padding: 2px 6px; border-radius: 99px; }
  .summary { background: #f4f6f8; border: 1px solid #ddd; border-radius: 6px; padding: 14px; display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
  .sum-item .slabel { font-size: 7.5pt; text-transform: uppercase; color: #888; margin-bottom: 3px; letter-spacing: 0.07em; }
  .sum-item .svalue { font-size: 13pt; font-weight: 700; }
  @media print { body { padding: 10px; } }
</style>
</head>
<body>
${logoBlock ? `<div style="margin-bottom:10px;">${logoBlock}</div>` : ''}
<h1>${escapeHtml(titleText)}</h1>
<div class="sub"><strong>Name:</strong> ${escapeHtml(studentName)} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>
${profileLine ? `<div class="sub" style="margin-top:-8px">${profileLine}</div>` : ''}
<div class="meta">
  <div class="meta-item"><div class="label">Required Hours</div><div class="value">${user.goal}h</div></div>
  <div class="meta-item"><div class="label">Hours Logged</div><div class="value">${(stats.totalMins/60).toFixed(1)}h</div></div>
  <div class="meta-item"><div class="label">Progress</div><div class="value">${stats.pct}%</div></div>
  <div class="meta-item"><div class="label">Total Days</div><div class="value">${sessions.length}</div></div>
</div>
<table>
  <thead><tr><th>#</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>Overtime</th><th>Note</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:20px;">No records found.</td></tr>'}</tbody>
</table>
<div class="summary">
  <div class="sum-item"><div class="slabel">Total Logged</div><div class="svalue">${(stats.totalMins/60).toFixed(2)}h</div></div>
  <div class="sum-item"><div class="slabel">Overtime</div><div class="svalue">${(stats.overtimeMins/60).toFixed(2)}h</div></div>
  <div class="sum-item"><div class="slabel">Remaining</div><div class="svalue">${(stats.remainMins/60).toFixed(2)}h</div></div>
  <div class="sum-item"><div class="slabel">Completion</div><div class="svalue">${stats.pct}%</div></div>
</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;

  const customTpl = (options.customTemplate || '').trim();
  const html = customTpl
    ? applyCustomTemplate(customTpl, {
      title: titleText,
      student_name: studentName,
      organization: orgText,
      student_id: (meta.studentId || '').trim(),
      program: (meta.program || '').trim(),
      additional_info: additionalSegments.join(' · '),
      details: detailsText,
      logo_url: logoUrl,
      generated_at: new Date().toLocaleString('en-PH'),
      rows,
      summary_total_logged: (stats.totalMins/60).toFixed(2),
      summary_overtime: (stats.overtimeMins/60).toFixed(2),
      summary_remaining: (stats.remainMins/60).toFixed(2),
      summary_completion: `${stats.pct}%`,
      goal_hours: `${user.goal}h`,
      total_days: String(sessions.length),
    })
    : defaultHtml;

  const win = window.open('', '_blank');
  if (!win) { alert('Pop-up blocked. Please allow pop-ups and try again.'); return; }
  win.document.write(html);
  win.document.close();
}

/* ─── HELPER ─── */
function escapeHtml(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyCustomTemplate(template, data) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    if (key === 'rows') return data.rows || '';
    return escapeHtml(data[key] ?? '');
  });
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
