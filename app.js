let tokenClient;
let accessToken = null;
let selectedYear;
let selectedMonth;
let lastWorkEvents = [];

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

  document.getElementById('signin-btn').addEventListener('click', handleSignIn);
  document.getElementById('signout-btn').addEventListener('click', handleSignOut);
  document.getElementById('calculate-btn').addEventListener('click', calculateHours);
  document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
  document.getElementById('show-raw-times').addEventListener('change', () => {
    if (lastWorkEvents.length) displayResults(lastWorkEvents);
  });
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

function handleSignIn() {
  tokenClient.requestAccessToken();
}

function handleTokenResponse(response) {
  if (response.error) {
    showError('Sign in failed: ' + response.error);
    return;
  }

  accessToken = response.access_token;

  fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken },
  })
    .then(r => r.json())
    .then(info => {
      document.getElementById('user-name').textContent = info.email || info.name || 'you';
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
    const select = document.getElementById('calendar-select');
    select.innerHTML = '';
    (data.items || [])
      .sort((a, b) => (a.summary || '').localeCompare(b.summary || ''))
      .forEach(cal => {
        const option = document.createElement('option');
        option.value = cal.id;
        option.textContent = cal.summary || cal.id;
        if (cal.primary) option.selected = true;
        select.appendChild(option);
      });
    document.getElementById('controls').classList.add('visible');
  } catch (err) {
    showError('Failed to load calendars: ' + err.message);
  }
}

function handleSignOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  document.getElementById('signin-btn').style.display = '';
  document.getElementById('user-info').classList.remove('visible');
  document.getElementById('controls').classList.remove('visible');
  document.getElementById('results').classList.remove('visible');
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
  document.getElementById('results').classList.remove('visible');
}

async function calculateHours() {
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

    const calendarId = encodeURIComponent(document.getElementById('calendar-select').value);
    const url = 'https://www.googleapis.com/calendar/v3/calendars/' + calendarId + '/events?' + params;
    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken },
    });

    if (!res.ok) {
      if (res.status === 401) {
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

  const listEl = document.getElementById('event-list');
  listEl.innerHTML = '';

  if (workEvents.length === 0) {
    listEl.innerHTML = '<p style="color:#666;text-align:center;padding:16px;">No matching events found.</p>';
  } else {
    workEvents.forEach(event => {
      const div = document.createElement('div');
      div.className = 'event-item';
      const showRaw = document.getElementById('show-raw-times').checked;
      const startTime = showRaw ? event.rawStart : event.start;
      const endTime = showRaw ? event.rawEnd : event.end;
      div.innerHTML =
        '<span><span class="event-date">' + formatDate(event.date) + '</span> — ' +
        escapeHtml(event.title) +
        ' <span class="event-time">' + formatTime(startTime) + ' – ' + formatTime(endTime) + '</span></span>' +
        '<span class="event-hours">' + formatHours(event.hours) + '</span>';
      listEl.appendChild(div);
    });
  }

  resultsEl.classList.add('visible');
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
