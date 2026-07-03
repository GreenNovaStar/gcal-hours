let tokenClient;
let accessToken = null;
let selectedYear;
let selectedMonth;
let lastWorkEvents = [];
let calendars = [];
let selectedCalendarId = null;
const resultsCache = {};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function init() {
  if (!CONFIG.CLIENT_ID || CONFIG.CLIENT_ID.includes('YOUR_CLIENT_ID_HERE')) {
    document.getElementById('setup-notice').classList.add('visible');
    document.getElementById('signin-btn').style.display = 'none';
    return;
  }

  const now = new Date();
  selectedYear = now.getFullYear();
  selectedMonth = now.getMonth();
  updateMonthLabel();

  loadGsiScript();

  restoreSession();

  document.getElementById('signin-btn').addEventListener('click', handleSignIn);
  document.getElementById('signout-btn').addEventListener('click', handleSignOut);
  document.getElementById('calculate-btn').addEventListener('click', calculateHours);
  document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
  document.getElementById('show-raw-times').addEventListener('change', () => {
    if (lastWorkEvents.length) displayResults(lastWorkEvents);
  });
  document.getElementById('show-calendar').addEventListener('change', () => {
    if (lastWorkEvents.length) displayResults(lastWorkEvents);
  });
  const weekStartEl = document.getElementById('week-start-monday');
  weekStartEl.checked = localStorage.getItem('gcal_week_start') === 'monday';
  weekStartEl.addEventListener('change', () => {
    localStorage.setItem('gcal_week_start', weekStartEl.checked ? 'monday' : 'sunday');
    if (lastWorkEvents.length) displayResults(lastWorkEvents);
  });

  setupCalendarDropdown();
}

function setupCalendarDropdown() {
  const dropdown = document.getElementById('calendar-dropdown');
  const trigger = document.getElementById('calendar-trigger');

  trigger.addEventListener('click', () => {
    if (!calendars.length) return;
    toggleCalendarMenu(!dropdown.classList.contains('open'));
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) toggleCalendarMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleCalendarMenu(false);
  });
}

function toggleCalendarMenu(open) {
  const dropdown = document.getElementById('calendar-dropdown');
  dropdown.classList.toggle('open', open);
  document.getElementById('calendar-trigger').setAttribute('aria-expanded', String(open));
}

function loadGsiScript() {
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.onload = initTokenClient;
  document.head.appendChild(script);
}

function initTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events.readonly',
    callback: handleTokenResponse,
  });
}

function restoreSession() {
  const saved = localStorage.getItem('gcal_token');
  if (!saved) return;
  const { token, expiry } = JSON.parse(saved);
  if (Date.now() > expiry) {
    localStorage.removeItem('gcal_token');
    return;
  }
  accessToken = token;
  onSignedIn();
}

function saveSession(token, expiresIn) {
  const expiry = Date.now() + expiresIn * 1000;
  localStorage.setItem('gcal_token', JSON.stringify({ token, expiry }));
}

function clearSession() {
  localStorage.removeItem('gcal_token');
}

function handleSignIn() {
  tokenClient.requestAccessToken();
}

function handleTokenResponse(response) {
  if (response.error) {
    showError('Sign in failed: ' + response.error);
    return;
  }

  accessToken = response.access_token;
  saveSession(response.access_token, response.expires_in);
  onSignedIn();
}

function onSignedIn() {
  fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken },
  })
    .then(r => r.json())
    .then(info => {
      document.getElementById('user-info').classList.add('visible');
    });

  document.getElementById('signin-btn').style.display = 'none';
  hideError();
  fetchCalendars();
}

async function fetchCalendars() {
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (!res.ok) throw new Error('Failed to load calendars');
    const data = await res.json();

    // Primary first, then alphabetical — the primary calendar is what most people want.
    calendars = (data.items || []).sort((a, b) => {
      if (a.primary) return -1;
      if (b.primary) return 1;
      return (a.summary || '').localeCompare(b.summary || '');
    });

    // Prefer the last calendar the user picked, then their primary, then the first.
    const remembered = localStorage.getItem('gcal_calendar_id');
    const preferred =
      calendars.find(c => c.id === remembered) ||
      calendars.find(c => c.primary) ||
      calendars[0];

    if (preferred) selectCalendar(preferred.id);
    renderCalendarMenu();
    document.getElementById('controls').classList.add('visible');
    document.getElementById('two-col').classList.add('visible');
    document.getElementById('empty-state').classList.add('visible');
  } catch (err) {
    showError('Failed to load calendars: ' + err.message);
  }
}

function selectCalendar(id) {
  selectedCalendarId = id;
  localStorage.setItem('gcal_calendar_id', id);
  const cal = calendars.find(c => c.id === id);
  if (!cal) return;
  document.getElementById('calendar-trigger-color').style.background =
    cal.backgroundColor || '#4285f4';
  document.getElementById('calendar-trigger-name').textContent = cal.summary || cal.id;
  document.getElementById('results').classList.remove('visible');
}

function renderCalendarMenu() {
  const menu = document.getElementById('calendar-menu');
  menu.innerHTML = '';
  calendars.forEach(cal => {
    const li = document.createElement('li');
    li.className = 'calendar-option' + (cal.id === selectedCalendarId ? ' selected' : '');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(cal.id === selectedCalendarId));

    const dot = document.createElement('span');
    dot.className = 'cal-color';
    dot.style.background = cal.backgroundColor || '#4285f4';

    const name = document.createElement('span');
    name.className = 'cal-name';
    name.textContent = cal.summary || cal.id;

    li.appendChild(dot);
    li.appendChild(name);

    if (cal.primary) {
      const badge = document.createElement('span');
      badge.className = 'cal-badge';
      badge.textContent = 'Primary';
      li.appendChild(badge);
    }

    if (cal.id === selectedCalendarId) {
      const check = document.createElement('span');
      check.className = 'cal-check';
      check.textContent = '✓';
      li.appendChild(check);
    }

    li.addEventListener('click', () => {
      selectCalendar(cal.id);
      renderCalendarMenu();
      toggleCalendarMenu(false);
    });

    menu.appendChild(li);
  });
}

function handleSignOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  clearSession();
  document.getElementById('signin-btn').style.display = '';
  document.getElementById('user-info').classList.remove('visible');
  document.getElementById('controls').classList.remove('visible');
  document.getElementById('two-col').classList.remove('visible');
  document.getElementById('results').classList.remove('visible');
  document.getElementById('results-toggles').classList.remove('visible');
  document.getElementById('empty-state').classList.remove('visible');
  toggleCalendarMenu(false);
}

function updateMonthLabel() {
  document.getElementById('month-label').textContent =
    MONTHS[selectedMonth] + ' ' + selectedYear;
}

function changeMonth(delta) {
  selectedMonth += delta;
  if (selectedMonth > 11) { selectedMonth = 0; selectedYear++; }
  if (selectedMonth < 0) { selectedMonth = 11; selectedYear--; }
  updateMonthLabel();

  const cacheKey = getCacheKey();
  if (resultsCache[cacheKey]) {
    displayResults(resultsCache[cacheKey]);
  } else {
    document.getElementById('results').classList.remove('visible');
    document.getElementById('results-toggles').classList.remove('visible');
    document.getElementById('empty-state').classList.add('visible');
  }
}

function getCacheKey() {
  const keyword = (document.getElementById('work-keyword').value || CONFIG.WORK_KEYWORD).toLowerCase();
  return selectedCalendarId + '|' + selectedYear + '|' + selectedMonth + '|' + keyword;
}

async function calculateHours() {
  const cacheKey = getCacheKey();
  if (resultsCache[cacheKey]) {
    displayResults(resultsCache[cacheKey]);
    return;
  }

  const btn = document.getElementById('calculate-btn');
  const loading = document.getElementById('loading');

  btn.disabled = true;
  loading.classList.add('visible');
  document.getElementById('results').classList.remove('visible');
  hideError();

  const timeMin = new Date(selectedYear, selectedMonth, 1).toISOString();
  const timeMax = new Date(selectedYear, selectedMonth + 1, 1).toISOString();

  try {
    const events = await fetchAllEvents(timeMin, timeMax);
    const workEvents = filterWorkEvents(events);
    resultsCache[cacheKey] = workEvents;
    displayResults(workEvents);
  } catch (err) {
    showError('Failed to fetch events: ' + err.message);
  } finally {
    btn.disabled = false;
    loading.classList.remove('visible');
  }
}

async function fetchAllEvents(timeMin, timeMax) {
  let allEvents = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const calendarId = encodeURIComponent(selectedCalendarId);
    const url = 'https://www.googleapis.com/calendar/v3/calendars/' + calendarId + '/events?' + params;
    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken },
    });

    if (!res.ok) {
      if (res.status === 401) {
        clearSession();
        accessToken = null;
        handleSignOut();
        throw new Error('Session expired. Please sign in again.');
      }
      throw new Error('Google API error: ' + res.status);
    }

    const data = await res.json();
    allEvents = allEvents.concat(data.items || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return allEvents;
}

function filterWorkEvents(events) {
  const keyword = (document.getElementById('work-keyword').value || CONFIG.WORK_KEYWORD).toLowerCase();

  return events
    .filter(event => {
      if (!event.start?.dateTime || !event.end?.dateTime) return false;
      const title = (event.summary || '').toLowerCase();
      return title.includes(keyword);
    })
    .map(event => {
      const start = new Date(event.start.dateTime);
      const end = new Date(event.end.dateTime);
      const roundedStart = roundDown15(start);
      const roundedEnd = roundUp15(end);
      const hours = (roundedEnd - roundedStart) / (1000 * 60 * 60);
      return {
        title: event.summary,
        date: start,
        rawStart: start,
        rawEnd: end,
        start: roundedStart,
        end: roundedEnd,
        hours,
      };
    });
}

function displayResults(workEvents) {
  lastWorkEvents = workEvents;
  const totalHours = workEvents.reduce((sum, e) => sum + e.hours, 0);
  const resultsEl = document.getElementById('results');

  document.getElementById('total-hours').textContent = formatHours(totalHours);
  document.getElementById('total-label').textContent =
    workEvents.length + ' event' + (workEvents.length !== 1 ? 's' : '') +
    ' in ' + MONTHS[selectedMonth] + ' ' + selectedYear;

  const showCalendar = document.getElementById('show-calendar').checked;
  const miniCalEl = document.getElementById('mini-calendar');
  const weeklyEl = document.getElementById('weekly-summary');

  if (showCalendar && workEvents.length > 0) {
    renderMiniCalendar(workEvents);
    miniCalEl.classList.add('visible');
  } else {
    miniCalEl.classList.remove('visible');
  }

  renderWeeklySummary(workEvents);
  weeklyEl.classList.toggle('visible', workEvents.length > 0);

  const listEl = document.getElementById('event-list');
  listEl.innerHTML = '';

  if (workEvents.length === 0) {
    listEl.innerHTML = '<p style="color:#666;text-align:center;padding:16px;">No matching events found.</p>';
  } else {
    const header = document.createElement('div');
    header.className = 'event-list-header';
    header.innerHTML = '<h3>Events</h3>';
    listEl.appendChild(header);

    workEvents.forEach(event => {
      const div = document.createElement('div');
      div.className = 'event-item';
      const showRaw = document.getElementById('show-raw-times').checked;
      const startTime = showRaw ? event.rawStart : event.start;
      const endTime = showRaw ? event.rawEnd : event.end;
      div.innerHTML =
        '<div class="event-info">' +
          '<span class="event-title">' + escapeHtml(event.title) + '</span>' +
          '<span class="event-date">' + formatDate(event.date) + '</span>' +
          '<span class="event-time">' + formatTime(startTime) + ' – ' + formatTime(endTime) + '</span>' +
        '</div>' +
        '<span class="event-hours">' + formatHours(event.hours) + '</span>';
      listEl.appendChild(div);
    });
  }

  resultsEl.classList.add('visible');
  document.getElementById('results-toggles').classList.add('visible');
  document.getElementById('empty-state').classList.remove('visible');
}

function getWeekStartOffset() {
  return document.getElementById('week-start-monday').checked ? 1 : 0;
}

function renderMiniCalendar(workEvents) {
  const el = document.getElementById('mini-calendar');
  const weekStart = getWeekStartOffset();
  const firstDayRaw = new Date(selectedYear, selectedMonth, 1).getDay();
  const firstDay = (firstDayRaw - weekStart + 7) % 7;
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  const hoursByDay = {};
  workEvents.forEach(event => {
    const day = event.date.getDate();
    hoursByDay[day] = (hoursByDay[day] || 0) + event.hours;
  });

  const allDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const days = [];
  for (let i = 0; i < 7; i++) days.push(allDays[(i + weekStart) % 7]);

  let html = '<div class="mini-cal-grid">';
  days.forEach(d => { html += '<div class="mini-cal-header">' + d + '</div>'; });

  for (let i = 0; i < firstDay; i++) {
    html += '<div class="mini-cal-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const hasEvent = hoursByDay[d];
    html += '<div class="mini-cal-day' + (hasEvent ? ' has-event' : '') + '">';
    html += d;
    if (hasEvent) html += '<span class="day-hours">' + formatHours(hoursByDay[d]) + '</span>';
    html += '</div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

function getWeeksForMonth(workEvents) {
  const firstOfMonth = new Date(selectedYear, selectedMonth, 1);
  const lastOfMonth = new Date(selectedYear, selectedMonth + 1, 0);
  const weeks = [];
  const weekStartDay = getWeekStartOffset();

  let weekStart = new Date(firstOfMonth);
  const dayOffset = (weekStart.getDay() - weekStartDay + 7) % 7;
  weekStart.setDate(weekStart.getDate() - dayOffset);

  let weekNum = 1;
  while (weekStart <= lastOfMonth) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const hours = workEvents
      .filter(e => {
        const d = e.date;
        return d >= weekStart && d <= weekEnd;
      })
      .reduce((sum, e) => sum + e.hours, 0);

    const displayStart = weekStart < firstOfMonth ? firstOfMonth : weekStart;
    const displayEnd = weekEnd > lastOfMonth ? lastOfMonth : weekEnd;

    weeks.push({
      num: weekNum++,
      start: new Date(displayStart),
      end: new Date(displayEnd),
      hours
    });

    weekStart = new Date(weekStart);
    weekStart.setDate(weekStart.getDate() + 7);
  }

  return weeks;
}

function renderWeeklySummary(workEvents) {
  const el = document.getElementById('weekly-summary');
  const weeks = getWeeksForMonth(workEvents);

  let html = '<div class="weekly-summary-header">';
  html += '<h3>Weekly Breakdown</h3>';
  html += '<button class="copy-btn" id="copy-weeks-btn" title="Copy to clipboard">';
  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  html += 'Copy</button></div>';

  weeks.forEach(w => {
    const startStr = formatDateShort(w.start);
    const endStr = formatDateShort(w.end);
    html += '<div class="week-row">';
    html += '<span class="week-dates">' + startStr + ' – ' + endStr + '</span>';
    html += '<span class="week-hours">' + formatHours(w.hours) + '</span>';
    html += '</div>';
  });

  el.innerHTML = html;

  document.getElementById('copy-weeks-btn').addEventListener('click', () => copyWeeklySummary(weeks));
}

function copyWeeklySummary(weeks) {
  const lines = weeks.map(w => {
    const startStr = formatDateShort(w.start);
    const endStr = formatDateShort(w.end);
    return startStr + ' - ' + endStr + ': ' + formatHours(w.hours);
  });
  lines.push('Total: ' + formatHours(weeks.reduce((sum, w) => sum + w.hours, 0)));

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = document.getElementById('copy-weeks-btn');
    btn.classList.add('copied');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Copied!';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy';
    }, 2000);
  });
}

function formatDateShort(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function roundDown15(date) {
  const ms = 15 * 60 * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

function roundUp15(date) {
  const ms = 15 * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

function formatHours(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return m + 'm';
  if (m === 0) return h + 'h';
  return h + 'h ' + m + 'm';
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.classList.add('visible');
}

function hideError() {
  document.getElementById('error').classList.remove('visible');
}

init();
