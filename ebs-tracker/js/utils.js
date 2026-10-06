// ============================================================
// EBS Tracker — Utility Functions (v2)
// ============================================================

/* ── Date helpers ─────────────────────────────────────────── */
// Week-of-month scheme: every month has exactly 4 weeks.
//   Day 1-7   → Week 1
//   Day 8-14  → Week 2
//   Day 15-21 → Week 3
//   Day 22+   → Week 4 (captures the tail of 28–31 day months)
function getWeekNumber(date) {
  const d = new Date(date);
  return Math.min(Math.ceil(d.getDate() / 7), 4);
}

function getMonthName(date) {
  return new Date(date).toLocaleString('default', { month: 'long' });
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function getTodayInfo() {
  const t = new Date();
  const pad = n => String(n).padStart(2, '0');
  return {
    date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`,
    month: getMonthName(t),
    week: getWeekNumber(t),
    year: t.getFullYear()
  };
}

function toDateStr(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ── Kuwait Working Time Helpers ──────────────────────────── */

/** True if date falls within Ramadan 2026 window */
function isRamadanDay(date) {
  const d = toDateStr(date);
  return d >= RAMADAN_2026_START && d <= RAMADAN_2026_END;
}

/** True if date is an official Kuwait public holiday (working day) */
function isKuwaitHoliday(date) {
  return KUWAIT_HOLIDAYS_2026.includes(toDateStr(date));
}

/** True if Friday or Saturday */
function isWeekendDay(date) {
  const dow = new Date(date).getDay();
  return dow === 5 || dow === 6;
}

/** Daily working hours for a given date (6 Ramadan, 8 otherwise) */
function getDailyHours(date) {
  return isRamadanDay(date) ? RAMADAN_DAILY_HOURS : NORMAL_DAILY_HOURS;
}

/**
 * Calculate working days and expected hours from TRACKER_START_DATE to today.
 * Excludes: Fri/Sat weekends, Kuwait public holidays, war days (global),
 * and per-user approved leave date ranges.
 *
 * @param {number} warDaysOff   - Global war days deduction
 * @param {Array}  userLeaves   - Array of {start_date, end_date} for this user
 * @returns {object}
 */
function getWorkingDaysInfo(warDaysOff = 0, userLeaves = [], warDayRanges = [], startDateOverride = null) {
  const startDateStr = startDateOverride || TRACKER_START_DATE;
  const start = new Date(startDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build a set of leave dates for fast lookup
  const leaveDateSet = new Set();
  (userLeaves || []).forEach(lv => {
    const s = new Date(lv.start_date); s.setHours(0,0,0,0);
    const e = new Date(lv.end_date);   e.setHours(0,0,0,0);
    const c = new Date(s);
    while (c <= e) {
      leaveDateSet.add(toDateStr(c));
      c.setDate(c.getDate() + 1);
    }
  });

  let rawWorkingDays     = 0;
  let rawExpectedHours   = 0;
  let ramadanWorkingDays = 0;
  let normalWorkingDays  = 0;
  let holidayCount       = 0;
  let leaveDays          = 0;
  let leaveHours         = 0;

  const cur = new Date(start);
  while (cur <= today) {
    const ds = toDateStr(cur);
    if (!isWeekendDay(cur)) {
      if (isKuwaitHoliday(cur)) {
        holidayCount++;
      } else if (leaveDateSet.has(ds)) {
        leaveDays++;
        leaveHours += getDailyHours(cur);
      } else {
        rawWorkingDays++;
        rawExpectedHours += getDailyHours(cur);
        if (isRamadanDay(cur)) ramadanWorkingDays++;
        else normalWorkingDays++;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  // Build war day set from ranges
  const warDateSet = new Set();
  (warDayRanges || []).forEach(wr => {
    const s = new Date(wr.start_date); s.setHours(0,0,0,0);
    const e = new Date(wr.end_date);   e.setHours(0,0,0,0);
    const cc = new Date(s);
    while (cc <= e) {
      // Only count as war day if it would have been a working day
      if (!isWeekendDay(cc) && !isKuwaitHoliday(cc) && !leaveDateSet.has(toDateStr(cc))) {
        warDateSet.add(toDateStr(cc));
      }
      cc.setDate(cc.getDate() + 1);
    }
  });

  // Also support legacy warDaysOff number if no ranges provided
  const effectiveWarDays = warDayRanges.length > 0 ? warDateSet.size
    : Math.min(Math.max(0, parseInt(warDaysOff) || 0), rawWorkingDays);

  let warHours = 0;
  if (warDayRanges.length > 0) {
    // Calculate actual hours lost (Ramadan vs normal)
    warDateSet.forEach(ds => { warHours += getDailyHours(ds); });
  } else {
    warHours = effectiveWarDays * NORMAL_DAILY_HOURS;
  }

  const workingDays   = rawWorkingDays - effectiveWarDays;
  const expectedHours = Math.max(0, rawExpectedHours - warHours);

  return {
    workingDays,
    rawWorkingDays,
    expectedHours:    Math.round(expectedHours * 10) / 10,
    rawExpectedHours: Math.round(rawExpectedHours * 10) / 10,
    warDaysOff:       effectiveWarDays,
    warHours:         Math.round(warHours * 10) / 10,
    leaveDays,
    leaveHours:       Math.round(leaveHours * 10) / 10,
    ramadanWorkingDays,
    normalWorkingDays,
    holidayCount,
    periodLabel: `${formatDate(startDateStr)} → ${formatDate(toDateStr(today))}`,
  };
}

/**
 * Convert logged hours to day-equivalent with per-log precision.
 * Ramadan logs divide by 6, normal logs divide by 8.
 * @param {Array} logs
 * @returns {number}
 */
function convertHoursToDays(logs) {
  if (!logs || !logs.length) return 0;
  let days = 0;
  logs.forEach(l => {
    const dailyHrs = isRamadanDay(l.log_date) ? RAMADAN_DAILY_HOURS : NORMAL_DAILY_HOURS;
    days += parseFloat(l.hours_spent || 0) / dailyHrs;
  });
  return Math.round(days * 100) / 100;
}

/* ── Level helpers ────────────────────────────────────────── */
function getUserLevel(totalHours) {
  let cur = LEVELS[0];
  for (const lvl of LEVELS) { if (totalHours >= lvl.minHours) cur = lvl; }
  return cur;
}

function getXPProgress(totalHours) {
  const cur  = getUserLevel(totalHours);
  const next = LEVELS.find(l => l.level === cur.level + 1);
  if (!next) return 100;
  return Math.min(Math.round(((totalHours - cur.minHours) / (next.minHours - cur.minHours)) * 100), 100);
}

/* ── Stats calculation ────────────────────────────────────── */
function calculateStats(logs) {
  if (!logs || logs.length === 0) return {
    totalHours: 0, totalTasks: 0, supportCount: 0, testingCount: 0,
    projectCount: 0, maxStreak: 0, currentStreak: 0, maxDayHours: 0,
    uniqueDays: 0, hasAllRounder: false, accomplishmentRate: 0, accomplishmentCount: 0,
    supportHours: 0, testingHours: 0, projectHours: 0
  };

  const totalHours   = logs.reduce((s, l) => s + parseFloat(l.hours_spent || 0), 0);
  const totalTasks   = logs.length;
  const supportLogs  = logs.filter(l => l.category === 'Support');
  const testingLogs  = logs.filter(l => l.category === 'Testing');
  const projectLogs  = logs.filter(l => l.category === 'Project');
  const supportHours = supportLogs.reduce((s, l) => s + parseFloat(l.hours_spent || 0), 0);
  const testingHours = testingLogs.reduce((s, l) => s + parseFloat(l.hours_spent || 0), 0);
  const projectHours = projectLogs.reduce((s, l) => s + parseFloat(l.hours_spent || 0), 0);

  const byDate = {};
  logs.forEach(l => {
    if (!byDate[l.log_date]) byDate[l.log_date] = { hours: 0, cats: new Set() };
    byDate[l.log_date].hours += parseFloat(l.hours_spent || 0);
    byDate[l.log_date].cats.add(l.category);
  });

  const uniqueDays  = Object.keys(byDate).length;
  const maxDayHours = Math.max(...Object.values(byDate).map(d => d.hours), 0);

  const sorted = Object.keys(byDate).sort();
  let maxStreak = sorted.length > 0 ? 1 : 0, curStreak = sorted.length > 0 ? 1 : 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    // Count working days between prev and curr (skip Fri/Sat weekends)
    let workingDaysDiff = 0;
    const scan = new Date(prev); scan.setDate(scan.getDate() + 1);
    while (scan <= curr) {
      const dow = scan.getDay();
      if (dow !== 5 && dow !== 6) workingDaysDiff++;
      scan.setDate(scan.getDate() + 1);
    }
    if (workingDaysDiff === 1) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
    else curStreak = 1;
  }
  if (sorted.length > 0) {
    const today = new Date(); today.setHours(0,0,0,0);
    const lastLog = new Date(sorted[sorted.length - 1]);
    // Count working days since last log
    let daysSince = 0;
    const scan = new Date(lastLog); scan.setDate(scan.getDate() + 1);
    while (scan <= today) {
      const dow = scan.getDay();
      if (dow !== 5 && dow !== 6) daysSince++;
      scan.setDate(scan.getDate() + 1);
    }
    if (daysSince > 1) curStreak = 0;
  }

  const byWeek = {};
  logs.forEach(l => {
    const d = new Date(l.log_date);
    // Disambiguate across months: Year-Month-Week
    const wk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-W${getWeekNumber(l.log_date)}`;
    if (!byWeek[wk]) byWeek[wk] = new Set();
    byWeek[wk].add(l.category);
  });
  const hasAllRounder = Object.values(byWeek).some(s => s.size === 3);

  // Count of entries where accomplishment was filled AND admin-approved.
  // Pending/rejected accomplishments don't count. Legacy rows without the
  // accomplishment_status column are treated as approved.
  const accomplishmentCount = logs.filter(l =>
    l.accomplishment && l.accomplishment.trim() &&
    (!l.accomplishment_status || l.accomplishment_status === 'approved')
  ).length;
  const accomplishmentRate = totalTasks > 0 ? Math.round((accomplishmentCount / totalTasks) * 100) : 0;

  // Generic per-category breakdown so admin-added categories beyond the
  // hardcoded three still surface in the dashboards. Keys are whatever
  // string lives in task_logs.category.
  const categoryHours = {};
  logs.forEach(l => {
    const k = l.category || '—';
    categoryHours[k] = (categoryHours[k] || 0) + parseFloat(l.hours_spent || 0);
  });
  Object.keys(categoryHours).forEach(k => { categoryHours[k] = Math.round(categoryHours[k] * 10) / 10; });

  return {
    totalHours: Math.round(totalHours * 10) / 10, totalTasks,
    supportCount: supportLogs.length, testingCount: testingLogs.length, projectCount: projectLogs.length,
    maxStreak, currentStreak: curStreak, maxDayHours, uniqueDays, hasAllRounder, accomplishmentRate, accomplishmentCount,
    supportHours: Math.round(supportHours * 10) / 10,
    testingHours: Math.round(testingHours * 10) / 10,
    projectHours: Math.round(projectHours * 10) / 10,
    categoryHours,
  };
}

/* ── Admin-managed categories ────────────────────────────────
 * Returns active primary categories with their active subcategories,
 * sorted by sort_order. Falls back to the legacy 3-table seed if the
 * `categories` table doesn't exist yet (migration not applied).
 */
async function loadCategories() {
  try {
    const { data: cats, error: e1 } = await db
      .from('categories')
      .select('id, name, icon, sort_order, is_active, is_system')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');
    if (e1) throw e1;
    const { data: subs, error: e2 } = await db
      .from('subcategories')
      .select('id, category_id, name, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');
    if (e2) throw e2;
    return (cats || []).map(c => ({
      ...c,
      subcategories: (subs || []).filter(s => s.category_id === c.id),
    }));
  } catch (err) {
    // Migration not applied yet — fall back to legacy hardcoded layout.
    const ICONS = { Support: '🛡️', Testing: '🧪', Project: '🚀' };
    const [s, t, p] = await Promise.all([
      db.from('support_subcategories').select('id, name, sort_order').order('sort_order'),
      db.from('testing_subcategories').select('id, name, sort_order').order('sort_order'),
      db.from('project_subcategories').select('id, name, sort_order').order('sort_order'),
    ]);
    return [
      { id: 'legacy-support', name: 'Support', icon: ICONS.Support, sort_order: 1, is_system: true, subcategories: s.data || [] },
      { id: 'legacy-testing', name: 'Testing', icon: ICONS.Testing, sort_order: 2, is_system: true, subcategories: t.data || [] },
      { id: 'legacy-project', name: 'Project', icon: ICONS.Project, sort_order: 3, is_system: true, subcategories: p.data || [] },
    ];
  }
}

function getEarnedBadges(stats) {
  // Legacy shim — only used by code that hasn't migrated to fetchUserBadges yet.
  // Returns the static BADGES array (config.js) with `.earned` set. Will be
  // dropped once admin.html / performance.html no longer call it.
  if (typeof BADGES === 'undefined') return [];
  return BADGES.map(b => ({ ...b, earned: b.check(stats) }));
}

/* ── Admin-defined badges (Phase 6) ──────────────────────────
 * evaluateBadge: pure check, returns true/false for a single badge given a
 * user's stats and an optional context (assigned-task list for on_time_rate).
 * Unknown condition types return false — they're a future-proof slot.
 */
function evaluateBadge(badge, stats, ctx) {
  if (!badge || !badge.condition_type) return false;
  const cfg = badge.condition_config || {};
  switch (badge.condition_type) {
    case 'total_hours':
      return (stats?.totalHours || 0) >= (cfg.threshold || Infinity);
    case 'consecutive_days':
      return (stats?.maxStreak || 0) >= (cfg.threshold || Infinity);
    case 'category_count': {
      // category_id refers to categories.id but task_logs stores the *name*.
      // Resolve the name from the cached category list set by syncUserBadges.
      const name = (ctx?.categoryNameById && ctx.categoryNameById[cfg.category_id]) || null;
      if (!name) return false;
      const count = (ctx?.logs || []).filter(l => l.category === name).length;
      return count >= (cfg.threshold || Infinity);
    }
    case 'on_time_rate': {
      const closed = (ctx?.tasks || []).filter(t => (t.status === 'done' || t.status === 'logged') && t.due_date && t.done_at);
      if (closed.length < (cfg.min_tasks || 0)) return false;
      const onTime = closed.filter(t => new Date(t.done_at) <= new Date(t.due_date)).length;
      return Math.round((onTime / closed.length) * 100) >= (cfg.threshold_pct || 100);
    }
    case 'custom':
    default:
      return false;
  }
}

/* fetchUserBadges: returns { badges: [], earned: Set<badge_id> } for one user.
 * Used by performance.html to render the badge wall. */
async function fetchUserBadges(userId) {
  try {
    const [bRes, ubRes] = await Promise.all([
      db.from('badges').select('*').eq('is_active', true).order('created_at'),
      db.from('user_badges').select('badge_id, earned_at').eq('user_id', userId),
    ]);
    if (bRes.error) throw bRes.error;
    const earned = new Set((ubRes.data || []).map(r => r.badge_id));
    return { badges: bRes.data || [], earned };
  } catch (e) {
    return { badges: [], earned: new Set(), error: e };
  }
}

/* syncUserBadges: evaluate every active badge against this user, INSERT any
 * newly-earned rows. Returns the up-to-date earned Set. */
async function syncUserBadges(userId, stats, ctxOverrides) {
  try {
    const [bRes, ubRes, catRes] = await Promise.all([
      db.from('badges').select('*').eq('is_active', true),
      db.from('user_badges').select('badge_id').eq('user_id', userId),
      db.from('categories').select('id, name'),
    ]);
    if (bRes.error) throw bRes.error;
    const badges = bRes.data || [];
    const earned = new Set((ubRes.data || []).map(r => r.badge_id));
    const categoryNameById = {};
    (catRes.data || []).forEach(c => { categoryNameById[c.id] = c.name; });

    let assignedTasks = ctxOverrides?.tasks;
    let userLogs      = ctxOverrides?.logs;
    if (badges.some(b => b.condition_type === 'on_time_rate') && !assignedTasks) {
      const { data } = await db.from('priority_tasks').select('status, due_date, done_at').eq('user_id', userId).not('assigned_by', 'is', null);
      assignedTasks = data || [];
    }
    if (badges.some(b => b.condition_type === 'category_count') && !userLogs) {
      const { data } = await db.from('task_logs').select('category').eq('user_id', userId);
      userLogs = data || [];
    }

    const ctx = { tasks: assignedTasks || [], logs: userLogs || [], categoryNameById };
    const newRows = [];
    badges.forEach(b => {
      if (!earned.has(b.id) && evaluateBadge(b, stats, ctx)) {
        newRows.push({ user_id: userId, badge_id: b.id });
        earned.add(b.id);
      }
    });
    if (newRows.length) {
      await db.from('user_badges').upsert(newRows, { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
    }
    return earned;
  } catch (e) {
    return new Set();
  }
}

/* ── Weekly aggregation ───────────────────────────────────── */
// Keys are Year-Month-Week so buckets across months don't collide when
// we now use month-based week numbering (W1–W4). Labels show a short
// "MonWn" (e.g. "Mar W2") on the X axis.
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function aggregateByWeek(logs, nWeeks = 8) {
  const weeks = {};
  for (let i = nWeeks - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i * 7);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-W${getWeekNumber(d)}`;
    const label = `${MONTH_SHORT[d.getMonth()]} W${getWeekNumber(d)}`;
    if (!weeks[key]) weeks[key] = { label, hours: 0, tasks: 0 };
  }
  logs.forEach(l => {
    const d = new Date(l.log_date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-W${getWeekNumber(l.log_date)}`;
    if (weeks[key]) { weeks[key].hours += parseFloat(l.hours_spent || 0); weeks[key].tasks++; }
  });
  return Object.values(weeks);
}

/* ── Monthly aggregation (last N months including current) ──── */
function aggregateByMonth(logs, nMonths = 6) {
  const months = {};
  const now = new Date();
  for (let i = nMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = `${MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    months[key] = { label, hours: 0, tasks: 0 };
  }
  logs.forEach(l => {
    const d = new Date(l.log_date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (months[key]) { months[key].hours += parseFloat(l.hours_spent || 0); months[key].tasks++; }
  });
  return Object.values(months);
}

/* ── Daily aggregation (last N days including today) ─────────── */
function aggregateByDay(logs, nDays = 14) {
  const days = {};
  const now = new Date(); now.setHours(0,0,0,0);
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = toDateStr(d);
    const label = `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
    days[key] = { label, hours: 0, tasks: 0 };
  }
  logs.forEach(l => {
    if (days[l.log_date]) { days[l.log_date].hours += parseFloat(l.hours_spent || 0); days[l.log_date].tasks++; }
  });
  return Object.values(days);
}

/* ── CSV Export ───────────────────────────────────────────── */
function exportToCSV(data, filename = 'export.csv') {
  if (!data || !data.length) { showToast('No data to export', 'info'); return; }
  const headers = Object.keys(data[0]);
  const rows = data.map(r =>
    headers.map(h => {
      const v = String(r[h] ?? '').replace(/"/g, '""');
      return (v.includes(',') || v.includes('"') || v.includes('\n')) ? `"${v}"` : v;
    }).join(',')
  );
  const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

/* ── Toast ─────────────────────────────────────────────────── */
function showToast(message, type = 'info') {
  document.querySelectorAll('.wt-toast').forEach(t => t.remove());
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const t = document.createElement('div');
  t.className = `wt-toast wt-toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 3200);
}

/* ── Sidebar ─────────────────────────────────────────────────*/
// Returns inner HTML for the avatar container given a session.
// Renders <img> when avatar_url is present, otherwise 2-char initials.
function avatarInnerHTML(session) {
  const initials = (session?.fullName || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  if (session?.avatar_url) {
    // Image fills the 40×40 avatar circle. If it fails to load, fall back to initials.
    return `<img src="${session.avatar_url}" alt="${session.fullName}"
      onerror="this.outerHTML='${initials}'"
      style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
  }
  return initials;
}

function renderSidebar(activePage) {
  const session = getSession();
  if (!session) return;
  const adminLink = session.role === 'admin'
    ? `<a href="admin.html" class="nav-link ${activePage === 'admin' ? 'active' : ''}"><span class="nav-icon">👑</span><span>Admin Panel</span></a>` : '';

  document.getElementById('app-sidebar').innerHTML = `
    <div class="sidebar-header"><div class="app-logo"><img src="logo.png" alt="EBS" class="logo-dark" style="height:28px;mix-blend-mode:screen;flex-shrink:0;" /><img src="logo-light.png" alt="EBS" class="logo-light" style="height:28px;flex-shrink:0;" /><span class="logo-text">EBS Tracker</span></div></div>
    <div class="sidebar-user">
      <div class="user-avatar lvl-1" id="sb-avatar" style="overflow:hidden;">${avatarInnerHTML(session)}</div>
      <div class="user-info"><div class="user-name">${session.fullName}</div><div class="user-level-tag" id="sb-level" style="font-size:11px;color:var(--text-3);">Loading...</div></div>
    </div>
    <nav class="sidebar-nav">
      <a href="dashboard.html" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}"><span class="nav-icon">📊</span><span>Dashboard</span></a>
      <a href="log.html" class="nav-link ${activePage === 'log' ? 'active' : ''}"><span class="nav-icon">➕</span><span>Log Task</span></a>
      <a href="performance.html" class="nav-link ${activePage === 'performance' ? 'active' : ''}"><span class="nav-icon">⚡</span><span>My Performance</span></a>
      <a href="tasks.html" class="nav-link ${activePage === 'tasks' ? 'active' : ''}"><span class="nav-icon">📌</span><span>My Tasks</span></a>
      ${adminLink}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
        <a href="../index.html#/dashboard" class="nav-link" style="opacity:0.7;"><span class="nav-icon">📊</span><span>Project Dashboard</span></a>
      </div>
    </nav>
    <div class="sidebar-footer"><button class="logout-btn" onclick="logout()"><span>🚪</span> Logout</button></div>
  `;
}

async function loadSidebarStats(userId) {
  try {
    // Pull latest profile (for fresh avatar_url) + hours in parallel
    const [hoursRes, profRes] = await Promise.all([
      db.from('task_logs').select('hours_spent').eq('user_id', userId),
      db.from('profiles').select('avatar_url, full_name').eq('id', userId).maybeSingle(),
    ]);

    const total = (hoursRes.data || []).reduce((s, l) => s + parseFloat(l.hours_spent || 0), 0);
    const taskCount = (hoursRes.data || []).length;
    const lvEl = document.getElementById('sb-level');
    if (lvEl) lvEl.textContent = `${total.toFixed(1)}h · ${taskCount} tasks`;

    // Keep avatar in sync — refresh localStorage session and all avatar/hero-avatar DOM nodes
    if (profRes.data) {
      const current = getSession();
      const fresh = {
        ...current,
        avatar_url: profRes.data.avatar_url || null,
        fullName:   profRes.data.full_name || current?.fullName,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(fresh));

      // Only update nodes that explicitly represent THIS user:
      //   - the sidebar avatar (fixed id #sb-avatar)
      //   - any element carrying a matching data-user-id (e.g. hero avatars)
      // Nodes without a data-user-id (e.g. rows in the admin Users grid) are
      // never touched — otherwise every user row in the list would be
      // overwritten with the signed-in admin's avatar.
      const selfAvatars = document.querySelectorAll(
        `#sb-avatar, [data-user-id="${userId}"]`
      );
      selfAvatars.forEach(el => {
        el.style.overflow = 'hidden';
        el.innerHTML = avatarInnerHTML(fresh);
      });
    }
  } catch(e) { console.warn('Sidebar stats error', e); }
}

/* ── Misc ─────────────────────────────────────────────────── */
/* ── Accomplishment display ─────────────────────────────────
 * Returns the text that should be shown for an accomplishment based on
 * its approval status. Pending → placeholder until admin approves.
 * Rejected → reason if provided. Approved (or legacy null) → text as-is.
 */
function displayAccomplishment(log) {
  if (!log) return '';
  const text = (log.accomplishment || '').trim();
  if (!text) return '';
  const status = log.accomplishment_status;
  if (status === 'pending')  return '🕒 Pending admin approval';
  if (status === 'rejected') return '⛔ Rejected' + (log.rejection_reason ? ` — ${log.rejection_reason}` : '');
  return text;
}

function categoryBadge(cat) {
  const c = CAT_COLORS[cat] || { border: '#64748b', text: '#94a3b8', bg: '#1e293b' };
  return `<span class="cat-badge" style="border-color:${c.border};color:${c.text};background:${c.bg}">${cat}</span>`;
}

function truncate(str, n = 50) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '—');
}

// ── safeNum: NaN-safe parseFloat → fixed-decimal display ────────
// Wraps parseFloat(x).toFixed(d) so a null/undefined/non-numeric value
// renders as '—' instead of "NaN" in the UI.
function safeNum(x, decimals = 1, fallback = '—') {
  const n = parseFloat(x);
  return Number.isFinite(n) ? n.toFixed(decimals) : fallback;
}

// ── Mobile sidebar close ───────────────────────────────────
function closeSidebar() {
  document.getElementById('app-sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
}

// ── Theme Management ───────────────────────────────────────
const THEME_KEY = 'ebs_theme';

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(saved);
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
  localStorage.setItem(THEME_KEY, theme);
  // Update toggle icon
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Defer chart-repaint event to the next animation frame so the
  // browser paints the new theme colors first. Without this, the
  // expensive renderComparison() (50+ Chart.js instances rebuild)
  // runs in the same task as the click → user perceives theme flip
  // as laggy. With rAF, the CSS theme switch shows instantly and
  // charts catch up a frame later.
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => document.dispatchEvent(new Event('ebs:theme-changed')));
  } else {
    setTimeout(() => document.dispatchEvent(new Event('ebs:theme-changed')), 0);
  }
}

function injectThemeToggle() {
  if (document.getElementById('themeToggle')) return;
  const btn = document.createElement('button');
  btn.id        = 'themeToggle';
  btn.className = 'theme-toggle';
  btn.title     = 'Toggle light/dark mode';
  btn.textContent = (localStorage.getItem(THEME_KEY) || 'light') === 'light' ? '🌙' : '☀️';
  btn.onclick   = toggleTheme;
  document.body.appendChild(btn);
}

// ── Stats with completed tasks ─────────────────────────────
function getCompletedCount(logs) {
  // Handles true, 1, or truthy — DB may return bool or null
  return (logs || []).filter(l => !!l.is_completed).length;
}
