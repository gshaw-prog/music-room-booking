// UI: hash router + views. All data access goes through api.js.
import { APP, RULES, SLOT_GROUPS, ROLES, EMAIL } from './config.js';
import * as api from './api.js';
import { DEMO_ACCOUNTS } from './seed.js';
import { slotsForDate, slotForGroup, getSlot, bookableDays, lastBookableDate, canManage as roleCanManage } from './rules.js';
import { toISO, addDays, weekStart, weekday, fmtShort, fmtLong, fmtStamp, atTime } from './dates.js';
import { heroStaff, authBanner, successNotes, footerArt } from './art.js';

const $app = document.getElementById('app');
const $top = document.getElementById('topbar');
let me = null;
let roomsCache = null;

// ── Utilities ────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isStaff = () => me && (me.role === 'teacher' || me.role === 'admin');
const canBook = () => me && RULES.bookingRoles.includes(me.role);   // books for self, under the rules
const canManage = () => roleCanManage(me);                           // books for anyone, cancels any booking
const today = () => toISO(new Date());
const go = (path) => { const h = '#' + path; if (location.hash === h) render(); else location.hash = h; };
const timeLabel = (s) => `${s.start}–${s.end}`;
const firstName = (n) => { const p = String(n || '').split(' '); return /^(mr|mrs|ms|miss|mx|dr)\.?$/i.test(p[0]) ? n : p[0]; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const roleBadge = (r) => `<span class="badge role-${r}">${esc(r[0].toUpperCase() + r.slice(1))}</span>`;
const notes = (used, max) => Array.from({ length: max }, (_, i) => `<span class="note ${i < used ? 'used' : ''}"></span>`).join('');

async function rooms(force = false) {
  if (!roomsCache || force) roomsCache = await api.listRooms();
  return roomsCache;
}

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3800);
}

function modal(html, { wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  wrap.close = close;
  setTimeout(() => wrap.querySelector('input:not([type=hidden]),textarea,.btn.primary')?.focus(), 30);
  return wrap;
}

function confirmDialog(title, body, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    const m = modal(`<h2>${esc(title)}</h2><p>${body}</p>
      <div class="modal-actions"><button class="btn ghost" data-no>Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button></div>`);
    m.querySelector('[data-yes]').onclick = () => { m.close(); resolve(true); };
    m.querySelector('[data-no]').onclick = () => { m.close(); resolve(false); };
  });
}

function emailModal(e) {
  modal(`<h2>Email</h2>
    <dl class="summary"><dt>To</dt><dd>${esc(e.toName)} &lt;${esc(e.to)}&gt;</dd>
    <dt>Subject</dt><dd>${esc(e.subject)}</dd><dt>Sent</dt><dd>${fmtStamp(e.sentAt)}, ${esc(e.status)}</dd></dl>
    <pre class="email-body">${esc(e.body)}</pre>
    <div class="modal-actions"><button class="btn primary" data-close>Close</button></div>`, { wide: true });
}

// ── Router ───────────────────────────────────────────────────
const routes = {
  'login':           { view: viewLogin, public: true },
  'change-password': { view: viewChangePassword },
  '':                { view: viewHome },
  'book':            { view: viewBook },
  'schedule':        { view: viewSchedule },
  'schedule/:id':    { view: viewSchedule },
  'rooms':           { view: viewRooms },
  'rooms/:id':       { view: viewRoom },
  'my':              { view: viewMy, roles: [...RULES.bookingRoles, ...RULES.manageRoles] },
  'emails':          { view: viewMyEmails },
  'admin/users':     { view: viewUsers, roles: ['admin'] },
  'admin/rooms':     { view: viewRoomEditor, roles: ['admin'] },
  'admin/emails':    { view: viewEmailLog, roles: ['admin'] },
  'admin/data':      { view: viewData, roles: ['admin'] },
};

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '').split('#')[0];
  const [path, qs] = h.split('?');
  const segs = path.split('/').filter(Boolean);
  let key = segs.join('/');
  let arg = null;
  if ((segs[0] === 'schedule' || segs[0] === 'rooms') && segs[1]) { key = `${segs[0]}/:id`; arg = decodeURIComponent(segs[1]); }
  return { key, arg, params: new URLSearchParams(qs || '') };
}

async function render() {
  const { key, arg, params } = parseHash();
  me = await api.currentUser();
  const route = routes[key];
  if (!route) return go('/');
  if (!route.public && !me) return go('/login');
  if (key === 'login' && me) return go('/');
  if (me?.mustChangePassword && key !== 'change-password') return go('/change-password');
  if (route.roles && !route.roles.includes(me.role)) { toast("You don't have access to that page.", 'error'); return go('/'); }
  renderTopbar(key);
  try {
    await route.view({ arg, params });
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<div class="card notice error">Something went wrong: ${esc(e.message)}</div>`;
  }
}

function renderTopbar(key) {
  if (!me) { $top.innerHTML = `<div class="topbar-inner"><a class="brand" href="#/login">${brandMark()}<span>${esc(APP.name)}</span></a></div>`; return; }
  const links = [['', 'Home']];
  if (canBook() || canManage()) links.push(['book', 'Book a room'], ['my', 'My bookings']);
  else links.push(['book', 'Availability']);
  links.push(['schedule', 'Schedules'], ['rooms', 'Rooms']);
  if (me.role === 'admin') links.push(['admin/users', 'Users'], ['admin/rooms', 'Room info'], ['admin/emails', 'Email log'], ['admin/data', 'Data']);
  const active = (k) => key === k || key.startsWith(k + '/') || (k === 'schedule' && key === 'schedule/:id') || (k === 'rooms' && key === 'rooms/:id');
  $top.innerHTML = `<div class="topbar-inner">
    <a class="brand" href="#/">${brandMark()}<span>${esc(APP.name)}</span></a>
    <nav class="nav">${links.map(([k, l]) => `<a href="#/${k}" class="${active(k) ? 'active' : ''}">${l}</a>`).join('')}</nav>
    <div class="user-menu">
      <button class="user-btn" id="userBtn" aria-haspopup="true">${esc(me.name)} ${roleBadge(me.role)}</button>
      <div class="user-pop" id="userPop" hidden>
        <div class="muted small">${esc(me.email)}</div>
        <a href="#/emails">My emails</a>
        <a href="#/change-password">Change password</a>
        <button class="linklike" id="logoutBtn">Sign out</button>
      </div>
    </div></div>`;
  const pop = document.getElementById('userPop');
  document.getElementById('userBtn').onclick = (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; };
  document.getElementById('logoutBtn').onclick = async () => { await api.logout(); toast('Signed out.'); go('/login'); };
}

function brandMark() {
  return `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor" opacity=".14"/><path d="M12 22.5a3 3 0 1 1-2-2.83V9l12-2.5v12a3 3 0 1 1-2-2.83V10.9l-8 1.66z" fill="currentColor"/></svg>`;
}

// ── Login / password ─────────────────────────────────────────
async function viewLogin() {
  $app.innerHTML = `<div class="auth-wrap"><div class="card auth">
    ${authBanner()}
    <h1>Sign in</h1><p class="muted">${esc(APP.school)}</p>
    <form id="loginForm" class="form">
      <label>Email<input name="email" type="email" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <div class="form-error" id="err" hidden></div>
      <button class="btn primary block" type="submit">Sign in</button>
    </form>
    <p class="muted small">Forgotten your password? Ask a member of the Music Department to reset it.</p>
    ${APP.demoMode ? `<div class="demo-box"><div class="small strong">Demo accounts: click one to fill it in</div>
      ${DEMO_ACCOUNTS.map((a) => `<button class="demo-acct" data-email="${a.email}" data-pw="${a.password}">${roleBadge(a.role)} ${esc(a.email)} <span class="muted">/ ${a.password}</span></button>`).join('')}
    </div>` : ''}
  </div></div>`;
  const f = document.getElementById('loginForm');
  $app.querySelectorAll('.demo-acct').forEach((b) => b.onclick = () => { f.email.value = b.dataset.email; f.password.value = b.dataset.pw; });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const res = await api.login(f.email.value, f.password.value);
    if (!res.ok) { const err = document.getElementById('err'); err.textContent = res.error; err.hidden = false; return; }
    roomsCache = null;
    toast(`Welcome, ${firstName(res.user.name)}!`);
    go('/');
  };
}

async function viewChangePassword() {
  const forced = me.mustChangePassword;
  $app.innerHTML = `<div class="auth-wrap"><div class="card auth">
    <h1>${forced ? 'Choose a new password' : 'Change password'}</h1>
    ${forced ? '<p class="notice">Your password was set or reset by an administrator. Please choose your own password to continue.</p>' : ''}
    <form id="pwForm" class="form">
      ${forced ? '' : '<label>Current password<input name="current" type="password" autocomplete="current-password" required></label>'}
      <label>New password<input name="next" type="password" minlength="6" autocomplete="new-password" required></label>
      <label>Confirm new password<input name="confirm" type="password" minlength="6" autocomplete="new-password" required></label>
      <div class="form-error" id="err" hidden></div>
      <button class="btn primary block">Save password</button>
    </form></div></div>`;
  const f = document.getElementById('pwForm');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('err');
    if (f.next.value !== f.confirm.value) { err.textContent = 'The passwords do not match.'; err.hidden = false; return; }
    const res = await api.changePassword(f.current?.value || '', f.next.value);
    if (!res.ok) { err.textContent = res.error; err.hidden = false; return; }
    toast('Password updated.');
    go('/');
  };
}

// ── Home ─────────────────────────────────────────────────────
async function viewHome() {
  const rs = await rooms();
  const first = firstName(me.name);
  if (canBook()) {
    const [q, mine] = await Promise.all([api.getQuota(today()), api.listMyBookings()]);
    const now = new Date();
    const upcoming = mine.filter((b) => b.status === 'confirmed' && atTime(b.date, getSlot(b.slotId).end) > now)
      .sort(byWhen);
    $app.innerHTML = `
      <section class="hero">${heroStaff()}<div><h1>Hi ${esc(first)}</h1>
        <p class="muted">Book a practice room or classroom up to ${RULES.maxDaysAhead} days ahead. Bookings are confirmed instantly.</p></div>
        <a class="btn primary lg" href="#/book">Book a room</a></section>
      <div class="quota" aria-label="Your booking allowance">
        <div class="quota-item"><div class="notes" aria-hidden="true">${notes(q.week, q.maxWeek)}</div>
          <p><strong>${q.week >= q.maxWeek ? 'No bookings left' : plural(q.maxWeek - q.week, 'booking') + ' left'}</strong> this week</p></div>
        <div class="quota-item"><div class="notes" aria-hidden="true">${notes(q.day, q.maxDay)}</div>
          <p><strong>${q.day >= q.maxDay ? 'Already booked' : 'Free to book'}</strong> today</p></div>
      </div>
      <section class="card"><div class="card-head"><h2>Your upcoming bookings</h2><a href="#/my">All my bookings</a></div>
        ${upcoming.length ? bookingList(upcoming, rs, { cancel: true }) : '<p class="empty">You have no upcoming bookings.</p>'}
      </section>
      <section><h2 class="section-title">Rooms</h2>${roomCards(rs)}</section>`;
    bindCancel();
    return;
  }
  // Staff
  const days = bookableDays();
  const day = days[0] || today();
  const [bookings, s] = await Promise.all([api.listBookings({ from: day, to: day }), api.stats()]);
  $app.innerHTML = `
    <section class="hero">${heroStaff()}<div><h1>Hi ${esc(first)}</h1>
      <p class="muted">${me.role === 'admin' ? 'Manage users, room information and bookings.' : 'Book rooms for students, and view or cancel bookings.'}</p></div>
      <div class="actions">${canManage() ? '<a class="btn primary lg" href="#/book">Book a room</a>' : ''}<a class="btn ${canManage() ? 'ghost' : 'primary'} lg" href="#/schedule">View schedules</a></div></section>
    <p class="lede">${plural(s.upcoming, 'upcoming booking')} across ${rs.length} rooms. ${plural(s.students, 'student')} ${s.students === 1 ? 'has' : 'have'} an account.</p>
    <section class="card"><div class="card-head"><h2>${day === today() ? 'Today' : fmtLong(day)}</h2><a href="#/book?date=${day}">See all of that day</a></div>
      ${dayGrid(day, rs, bookings)}</section>`;
}

const byWhen = (a, b) => (a.date + getSlot(a.slotId).start).localeCompare(b.date + getSlot(b.slotId).start);

// ── Day grid (availability) ──────────────────────────────────
function dayGrid(date, rs, bookings, { limitReached = false } = {}) {
  const slots = slotsForDate(date);
  if (!slots.length) return '<p class="empty">No bookable slots on this day.</p>';
  const now = new Date();
  const outOfRange = date > lastBookableDate();
  const rows = slots.map((s) => {
    const started = atTime(date, s.start) <= now;
    const cells = rs.map((r) => dayCell(r, s, started, bookings.find((x) => x.roomId === r.id && x.date === date && x.slotId === s.id))
      .replace('<td ', `<td data-label="${esc(r.name)}" `)).join('');
    return `<tr><th class="slot"><span class="slot-label">${esc(s.label)}</span><span class="slot-time">${timeLabel(s)}</span></th>${cells}</tr>`;
  }).join('');
  function dayCell(r, s, started, b) {
    if (b) return bookedCell(b);
    if (started) return '<td class="cell past"><span>—</span></td>';
    if (canManage() || (canBook() && !limitReached && !outOfRange)) {
      return `<td class="cell free"><button class="btn-book" data-book data-room="${r.id}" data-slot="${s.id}" data-date="${date}">Book</button></td>`;
    }
    return '<td class="cell free"><span>Free</span></td>';
  }
  return `<div class="grid-wrap"><table class="grid day-grid">
    <thead><tr><th class="corner"></th>${rs.map((r) => `<th><a href="#/rooms/${r.id}">${esc(r.name)}</a></th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function bookedCell(b) {
  const cancelBtn = canManage() ? `<button class="mini danger" data-cancel="${b.id}" title="Cancel booking">Cancel</button>` : '';
  if (b.mine) return `<td class="cell mine"><strong>Your booking</strong>${b.purpose ? `<small>${esc(b.purpose)}</small>` : ''}${cancelBtn}</td>`;
  if (b.user) {
    return `<td class="cell booked" title="${esc(b.user.email)}${b.bookedBy ? ` (booked by ${esc(b.bookedBy)})` : ''}"><strong>${esc(b.user.name)}</strong><small>${esc(b.user.group)}</small>${b.purpose ? `<small>${esc(b.purpose)}</small>` : ''}
      ${cancelBtn}</td>`;
  }
  return '<td class="cell booked"><span>Booked</span></td>';
}

function bindBookButtons(rs) {
  $app.querySelectorAll('[data-book]').forEach((btn) => {
    btn.onclick = () => openBookModal({ roomId: btn.dataset.room, date: btn.dataset.date, slotId: btn.dataset.slot }, rs);
  });
}

function bindCancel() {
  $app.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.onclick = async () => {
      const ok = await confirmDialog('Cancel booking?', 'The room will become available for others and a cancellation email will be sent.', 'Cancel booking', true);
      if (!ok) return;
      const res = await api.cancelBooking(btn.dataset.cancel);
      if (!res.ok) return toast(res.error, 'error');
      toast('Booking cancelled.');
      render();
    };
  });
}

async function openBookModal({ roomId, date, slotId }, rs) {
  const room = rs.find((r) => r.id === roomId);
  const slot = getSlot(slotId);
  const staff = canManage();
  const owners = staff ? await api.listBookingOwners() : [];
  const ownerOpt = (u) => `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${esc(u.name)}${u.group ? ` (${esc(u.group)})` : ''}${u.id === me.id ? ' (me)' : ''}</option>`;
  const byRole = (r) => owners.filter((u) => u.role === r);
  const ownerField = staff ? `<label class="field">Book for
      <select name="forUser">
        <optgroup label="Staff">${[...byRole('teacher'), ...byRole('admin')].map(ownerOpt).join('')}</optgroup>
        <optgroup label="Students">${byRole('student').map(ownerOpt).join('')}</optgroup>
      </select><span class="muted small">Staff bookings aren't limited by the student booking rules.</span></label>` : '';
  const m = modal(`<h2>Confirm booking</h2>
    <div class="book-summary"><img src="${esc(room.image)}" alt="">
      <dl class="summary"><dt>Room</dt><dd>${esc(room.name)}</dd><dt>Date</dt><dd>${fmtLong(date)}</dd>
      <dt>Time</dt><dd>${esc(slot.label)}, ${timeLabel(slot)}</dd></dl></div>
    ${ownerField}
    <label class="field">${staff ? 'Notes' : 'What will you be practising?'} <span class="muted">(optional)</span>
      <input name="purpose" maxlength="80" placeholder="${staff ? 'e.g. Choir rehearsal' : 'e.g. Grade 5 piano pieces'}"></label>
    <div class="form-error" hidden></div>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-confirm>Confirm booking</button></div>`);
  const btn = m.querySelector('[data-confirm]');
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Booking…';
    const forUserId = m.querySelector('[name=forUser]')?.value;
    const owner = owners.find((u) => u.id === forUserId);
    const res = await api.createBooking({ roomId, date, slotId, purpose: m.querySelector('[name=purpose]').value, forUserId });
    if (!res.ok) {
      const err = m.querySelector('.form-error'); err.textContent = res.error; err.hidden = false;
      btn.disabled = false; btn.textContent = 'Confirm booking';
      return;
    }
    m.close();
    const mail = res.email;
    const forOther = owner && owner.id !== me.id;
    const done = modal(`<div class="success-icon">${successNotes()}</div><h2 class="center">${forOther ? `Booked for ${esc(owner.name)}` : "You're booked!"}</h2>
      <p class="center">${esc(room.name)}<br>${fmtLong(date)}, ${timeLabel(slot)}</p>
      <p class="center muted">${mail.status === 'failed' ? 'The booking is confirmed, but the confirmation email could not be sent.' : `A confirmation email has been sent to <strong>${esc(mail.to)}</strong>.`}</p>
      <div class="modal-actions center">${EMAIL.provider === 'demo' ? '<button class="btn ghost" data-view-email>View email</button>' : ''}<button class="btn primary" data-close>Done</button></div>`);
    done.querySelector('[data-view-email]')?.addEventListener('click', () => { done.close(); emailModal(mail); });
    done.querySelector('[data-close]').addEventListener('click', () => render());
    render();
  };
}

// ── Book / availability ──────────────────────────────────────
async function viewBook({ params }) {
  const rs = await rooms();
  const days = bookableDays();
  let date = params.get('date');
  if (!date || !days.includes(date)) {
    const now = new Date();
    date = days.find((d) => slotsForDate(d).some((s) => atTime(d, s.start) > now)) || days[0];
  }
  const bookings = await api.listBookings({ from: date, to: date });
  let banner = '';
  let limitReached = false;
  if (canBook()) {
    const q = await api.getQuota(date);
    if (q.day >= q.maxDay) { limitReached = true; banner = `<div class="notice warn">You already have a booking on ${fmtShort(date)}. You can make ${q.maxDay} booking per day.</div>`; }
    else if (q.week >= q.maxWeek) { limitReached = true; banner = `<div class="notice warn">You've used both bookings for that week (limit ${q.maxWeek} per week).</div>`; }
    else banner = `<div class="notice">That week: <strong>${q.week} of ${q.maxWeek}</strong> bookings used. Limit ${q.maxDay} per day.</div>`;
  }
  // group strip by week
  // Day picker drawn as a keyboard: school days are white keys, each weekend a black key.
  const strip = days.map((d, i) => (i > 0 && weekday(d) === 1 ? '<span class="key black" aria-hidden="true" title="Weekend"></span>' : '') +
    `<a href="#/book?date=${d}" class="key white ${d === date ? 'active' : ''} ${d === today() ? 'today' : ''}" ${d === date ? 'aria-current="date"' : ''} aria-label="${fmtLong(d)}">
      <span class="key-dow">${fmtShort(d).split(' ')[0]}</span><span class="key-num">${d.slice(8).replace(/^0/, '')}</span><span class="key-mon">${fmtShort(d).split(' ')[2]}</span></a>`).join('');
  $app.innerHTML = `
    <div class="page-head"><h1>${canBook() || canManage() ? 'Book a room' : 'Availability'}</h1>
      <p class="muted">${canManage() ? 'Choose a day, then pick a free slot to book it for yourself or a student, or cancel an existing booking. To book further ahead, use the weekly room schedules.' : `Choose a day, then pick a free slot. Bookings open ${RULES.maxDaysAhead} days ahead.`}</p></div>
    <nav class="keyboard" aria-label="Choose a day">${strip}</nav>
    <section class="card"><div class="card-head"><h2>${fmtLong(date)}</h2>${legend()}</div>
      ${banner}${dayGrid(date, rs, bookings, { limitReached })}</section>`;
  bindBookButtons(rs);
  bindCancel();
}

const legend = () => `<div class="legend"><span><i class="sw free"></i>Free</span><span><i class="sw booked"></i>Booked</span>${canBook() || canManage() ? '<span><i class="sw mine"></i>Yours</span>' : ''}<span><i class="sw past"></i>Past</span></div>`;

// ── Weekly room schedule ─────────────────────────────────────
async function viewSchedule({ arg, params }) {
  const rs = await rooms();
  const room = rs.find((r) => r.id === arg) || rs[0];
  const t = today();
  const ws = weekStart(params.get('week') || t);
  const days = [0, 1, 2, 3, 4].map((i) => addDays(ws, i));
  const bookings = await api.listBookings({ from: days[0], to: days[4], roomId: room.id });
  const now = new Date();
  const last = lastBookableDate();
  const nextWs = addDays(ws, 7);
  const canNext = canManage() || nextWs <= last;

  const rows = SLOT_GROUPS.map((g) => {
    const cells = days.map((d) => {
      const s = slotForGroup(d, g.id);
      if (!s) return '<td class="cell na"></td>';
      const b = bookings.find((x) => x.date === d && x.slotId === s.id);
      const time = `<span class="cell-time">${timeLabel(s)}</span>`;
      if (b) return bookedCell(b).replace(/^<td class="([^"]+)"([^>]*)>/, `<td class="$1"$2>${time}`);
      if (atTime(d, s.start) <= now) return `<td class="cell past">${time}<span>—</span></td>`;
      if (canManage() || (canBook() && d <= last)) return `<td class="cell free">${time}<button class="btn-book" data-book data-room="${room.id}" data-slot="${s.id}" data-date="${d}">Book</button></td>`;
      return `<td class="cell free">${time}<span>Free</span></td>`;
    }).join('');
    return `<tr><th class="slot"><span class="slot-label">${g.label}</span></th>${cells}</tr>`;
  }).join('');

  const listRows = [...bookings].sort(byWhen).map((b) => {
    const s = getSlot(b.slotId);
    return `<tr><td>${fmtShort(b.date)}</td><td>${timeLabel(s)}</td><td>${esc(b.user?.name)}</td><td>${esc(b.user?.group)}</td>
      <td>${esc(b.user?.email)}</td><td>${esc(b.purpose)}</td><td class="muted">${fmtStamp(b.createdAt)}${b.bookedBy ? `<br>by ${esc(b.bookedBy)}` : ''}</td>
      ${canManage() ? `<td><button class="mini danger" data-cancel="${b.id}">Cancel</button></td>` : ''}</tr>`;
  }).join('');

  $app.innerHTML = `
    <div class="page-head"><h1>Room schedules</h1></div>
    <div class="tabs">${rs.map((r) => `<a href="#/schedule/${r.id}?week=${ws}" class="${r.id === room.id ? 'active' : ''}">${esc(r.name)}</a>`).join('')}</div>
    <section class="card">
      <div class="card-head">
        <div class="room-title"><img src="${esc(room.image)}" alt=""><div><h2>${esc(room.name)}</h2><a class="small" href="#/rooms/${room.id}">Room info</a></div></div>
        <div class="week-nav">
          <a class="btn ghost sm" href="#/schedule/${room.id}?week=${addDays(ws, -7)}" aria-label="Previous week">Previous</a>
          <span class="week-label">${fmtShort(days[0])} – ${fmtShort(days[4])}</span>
          ${canNext ? `<a class="btn ghost sm" href="#/schedule/${room.id}?week=${nextWs}" aria-label="Next week">Next</a>` : '<span class="btn ghost sm disabled">Next</span>'}
          ${ws !== weekStart(t) ? `<a class="btn ghost sm" href="#/schedule/${room.id}">This week</a>` : ''}
        </div>
      </div>
      <div class="grid-wrap"><table class="grid week">
        <thead><tr><th class="corner"></th>${days.map((d) => `<th class="${d === t ? 'is-today' : ''}">${fmtShort(d)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table></div>
      ${legend()}
    </section>
    ${isStaff() ? `<section class="card">
      <div class="card-head"><h2>Who's booked ${esc(room.name)} this week</h2><button class="btn ghost sm" onclick="window.print()">Print</button></div>
      ${bookings.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Time</th><th>Booked for</th><th>Year / class</th><th>Email</th><th>Notes</th><th>Booked</th>${canManage() ? '<th></th>' : ''}</tr></thead><tbody>${listRows}</tbody></table></div>` : '<p class="empty">No bookings this week.</p>'}
    </section>` : ''}`;
  bindBookButtons(rs);
  bindCancel();
}

// ── Rooms ────────────────────────────────────────────────────
function roomCards(rs) {
  return `<div class="room-grid">${rs.map((r) => `<a class="room-card" href="#/rooms/${r.id}">
    <img src="${esc(r.image)}" alt="${esc(r.name)}" loading="lazy">
    <div class="room-card-body"><h3>${esc(r.name)}</h3><div class="small muted">${esc(r.type)} for up to ${esc(r.capacity)}</div>
    <p>${esc((r.description || '').split('\n')[0].slice(0, 110))}${(r.description || '').length > 110 ? '…' : ''}</p></div></a>`).join('')}</div>`;
}

async function viewRooms() {
  const rs = await rooms();
  $app.innerHTML = `<div class="page-head"><h1>Rooms</h1><p class="muted">Information from the Music Department about each bookable room.</p></div>${roomCards(rs)}`;
}

async function viewRoom({ arg }) {
  const rs = await rooms();
  const r = rs.find((x) => x.id === arg);
  if (!r) return go('/rooms');
  const paras = (r.description || '').split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  $app.innerHTML = `
    <a class="back" href="#/rooms">All rooms</a>
    <article class="card room-detail">
      <img class="room-hero" src="${esc(r.image)}" alt="${esc(r.name)}">
      <div class="room-detail-body">
        <div class="small muted">${esc(r.type)}</div>
        <h1>${esc(r.name)}</h1>
        <p class="room-meta">Room for up to ${esc(r.capacity)} people</p>
        <div class="prose">${paras}</div>
        ${r.equipment?.length ? `<h3>Equipment</h3><ul class="equip">${r.equipment.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        <h3>Bookable times</h3>
        <table class="table compact"><tbody>
          <tr><td>Monday</td><td>${slotsForDate(nextWeekday(1)).map(timeLabel).join(', ')}</td></tr>
          <tr><td>Tuesday to Friday</td><td>${slotsForDate(nextWeekday(2)).map(timeLabel).join(', ')}</td></tr>
        </tbody></table>
        <div class="actions">
          <a class="btn primary" href="#/schedule/${r.id}">View schedule</a>
          ${canBook() || canManage() ? '<a class="btn ghost" href="#/book">Book a slot</a>' : ''}
          ${me.role === 'admin' ? `<a class="btn ghost" href="#/admin/rooms#${r.id}">Edit room info</a>` : ''}
        </div>
      </div>
    </article>`;
}

function nextWeekday(target) {
  let d = today();
  for (let i = 0; i < 7; i++) { if (new Date(d + 'T12:00').getDay() === target) return d; d = addDays(d, 1); }
  return d;
}

// ── My bookings ──────────────────────────────────────────────
function bookingList(list, rs, { cancel = false } = {}) {
  const now = new Date();
  return `<ul class="booking-list">${list.map((b) => {
    const s = getSlot(b.slotId);
    const r = rs.find((x) => x.id === b.roomId);
    const canCancel = cancel && b.status === 'confirmed' && atTime(b.date, s.start) > now;
    return `<li class="booking ${b.status}">
      <div class="when"><span class="dnum">${b.date.slice(8).replace(/^0/, '')}</span><span class="mon">${fmtShort(b.date).split(' ')[2]}</span></div>
      <div class="what"><strong>${esc(r?.name || b.roomId)}</strong>
        <span class="muted">${esc(s.label)}, ${timeLabel(s)}</span>
        ${b.purpose ? `<span class="small">${esc(b.purpose)}</span>` : ''}</div>
      <div class="status">${b.status === 'cancelled' ? '<span class="badge grey">Cancelled</span>' : '<span class="badge ok">Confirmed</span>'}
        ${canCancel ? `<button class="mini danger" data-cancel="${b.id}">Cancel</button>` : ''}</div></li>`;
  }).join('')}</ul>`;
}

async function viewMy() {
  const [rs, mine] = await Promise.all([rooms(), api.listMyBookings()]);
  const now = new Date();
  const upcoming = mine.filter((b) => b.status === 'confirmed' && atTime(b.date, getSlot(b.slotId).end) > now).sort(byWhen);
  const history = mine.filter((b) => !upcoming.includes(b)).sort(byWhen).reverse();
  $app.innerHTML = `
    <div class="page-head"><h1>My bookings</h1><p class="muted">${canBook() ? `Limits: ${RULES.maxPerDay} per day, ${RULES.maxPerWeek} per week. ` : ''}Cancel bookings you can't use so others can book the room.</p></div>
    <section class="card"><h2>Upcoming</h2>${upcoming.length ? bookingList(upcoming, rs, { cancel: true }) : '<p class="empty">No upcoming bookings. <a href="#/book">Book a room</a></p>'}</section>
    <section class="card"><h2>Past & cancelled</h2>${history.length ? bookingList(history, rs) : '<p class="empty">Nothing here yet.</p>'}</section>`;
  bindCancel();
}

// ── Emails ───────────────────────────────────────────────────
function emailTable(list, showTo) {
  if (!list.length) return '<p class="empty">No emails yet.</p>';
  return `<div class="table-wrap"><table class="table clickable"><thead><tr><th>Sent</th>${showTo ? '<th>To</th>' : ''}<th>Subject</th><th>Status</th></tr></thead><tbody>
    ${list.map((e, i) => `<tr data-i="${i}"><td class="muted nowrap">${fmtStamp(e.sentAt)}</td>${showTo ? `<td>${esc(e.toName)}<div class="small muted">${esc(e.to)}</div></td>` : ''}
      <td>${esc(e.subject)}</td><td><span class="badge ${e.status === 'failed' ? 'bad' : e.status === 'sent' ? 'ok' : 'grey'}">${esc(e.status)}</span></td></tr>`).join('')}
  </tbody></table></div>`;
}
function bindEmailRows(list) { $app.querySelectorAll('tr[data-i]').forEach((tr) => tr.onclick = () => emailModal(list[+tr.dataset.i])); }

async function viewMyEmails() {
  const list = await api.listEmails();
  $app.innerHTML = `<div class="page-head"><h1>My emails</h1>
    <p class="muted">${EMAIL.provider === 'demo' ? 'Demo mode: emails are shown here instead of being sent to your inbox.' : 'Copies of booking emails sent to you.'}</p></div>
    <section class="card">${emailTable(list, false)}</section>`;
  bindEmailRows(list);
}

async function viewEmailLog() {
  const list = await api.listEmails({ all: true });
  $app.innerHTML = `<div class="page-head"><h1>Email log</h1>
    <p class="muted">Every confirmation and cancellation email. Provider: <strong>${esc(EMAIL.provider)}</strong>${EMAIL.provider === 'demo' ? ' (logged only; set up EmailJS in js/config.js to send real emails)' : ''}.</p></div>
    <section class="card">${emailTable(list, true)}</section>`;
  bindEmailRows(list);
}

// ── Admin: users ─────────────────────────────────────────────
async function viewUsers({ params }) {
  const users = await api.listUsers();
  const q = (params.get('q') || '').toLowerCase();
  const roleF = params.get('role') || '';
  const shown = users
    .filter((u) => (!roleF || u.role === roleF) && (!q || `${u.name} ${u.email} ${u.group}`.toLowerCase().includes(q)))
    .sort((a, b) => ROLES.indexOf(b.role) - ROLES.indexOf(a.role) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(ROLES.map((r) => [r, users.filter((u) => u.role === r).length]));
  $app.innerHTML = `
    <div class="page-head row"><div><h1>Users</h1><p class="muted">${plural(counts.student, 'student')}, ${plural(counts.teacher, 'teacher')} and ${plural(counts.admin, 'admin')}</p></div>
      <div class="actions"><button class="btn ghost" id="importBtn">Import CSV</button><button class="btn primary" id="addBtn">Add user</button></div></div>
    <section class="card">
      <form class="toolbar" id="filterForm">
        <input name="q" type="search" placeholder="Search name, email or class" value="${esc(params.get('q') || '')}">
        <select name="role"><option value="">All roles</option>${ROLES.map((r) => `<option value="${r}" ${r === roleF ? 'selected' : ''}>${r}</option>`).join('')}</select>
      </form>
      <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Year / class</th><th>Role</th><th>Upcoming</th><th></th></tr></thead><tbody>
      ${shown.map((u) => `<tr data-id="${u.id}">
        <td><strong>${esc(u.name)}</strong>${u.mustChangePassword ? ' <span class="badge grey" title="Must set a new password at next sign-in">temp password</span>' : ''}</td>
        <td>${esc(u.email)}</td><td>${esc(u.group)}</td>
        <td><select class="role-select" ${u.id === me.id ? 'disabled title="You can\'t change your own role"' : ''}>${ROLES.map((r) => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
        <td>${u.upcoming}</td>
        <td class="nowrap right"><button class="mini" data-edit>Edit</button> <button class="mini" data-reset>Reset password</button>
          ${u.id !== me.id ? '<button class="mini danger" data-del>Delete</button>' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No users match.</td></tr>'}
      </tbody></table></div>
    </section>`;

  const ff = document.getElementById('filterForm');
  let t;
  const applyFilter = () => { const p = new URLSearchParams(); if (ff.q.value) p.set('q', ff.q.value); if (ff.role.value) p.set('role', ff.role.value); location.hash = '#/admin/users' + (p.toString() ? '?' + p : ''); };
  ff.q.oninput = () => { clearTimeout(t); t = setTimeout(applyFilter, 350); };
  ff.role.onchange = applyFilter;
  ff.onsubmit = (e) => { e.preventDefault(); applyFilter(); };
  if (params.get('q')) { ff.q.focus(); ff.q.setSelectionRange(ff.q.value.length, ff.q.value.length); }

  document.getElementById('addBtn').onclick = () => userForm();
  document.getElementById('importBtn').onclick = importDialog;
  const byId = (el) => users.find((u) => u.id === el.closest('tr').dataset.id);

  $app.querySelectorAll('.role-select').forEach((sel) => sel.onchange = async () => {
    const u = byId(sel);
    const res = await api.updateUser(u.id, { role: sel.value });
    if (!res.ok) { toast(res.error, 'error'); sel.value = u.role; return; }
    toast(`${u.name} is now ${sel.value === 'admin' ? 'an' : 'a'} ${sel.value}.`);
    render();
  });
  $app.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => userForm(byId(b)));
  $app.querySelectorAll('[data-reset]').forEach((b) => b.onclick = async () => {
    const u = byId(b);
    if (!(await confirmDialog('Reset password?', `A new temporary password will be created for <strong>${esc(u.name)}</strong>. They'll be asked to choose their own password when they next sign in.`, 'Reset password'))) return;
    const res = await api.resetPassword(u.id);
    if (!res.ok) return toast(res.error, 'error');
    passwordModal(u, res.tempPassword);
    render();
  });
  $app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    const u = byId(b);
    if (!(await confirmDialog('Delete user?', `Delete <strong>${esc(u.name)}</strong> (${esc(u.email)})? Their upcoming bookings will be cancelled. This can't be undone.`, 'Delete', true))) return;
    const res = await api.deleteUser(u.id);
    if (!res.ok) return toast(res.error, 'error');
    toast('User deleted.');
    render();
  });
}

function passwordModal(u, pw) {
  const m = modal(`<h2>Temporary password</h2>
    <p>Give this password to <strong>${esc(u.name)}</strong>. It is shown only once.</p>
    <div class="temp-pw"><code>${esc(pw)}</code><button class="btn ghost sm" data-copy>Copy</button></div>
    <p class="small muted">Sign in: ${esc(u.email)}</p>
    <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`);
  m.querySelector('[data-copy]').onclick = async (e) => { try { await navigator.clipboard.writeText(pw); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Select & copy'; } };
}

function userForm(u = null) {
  const m = modal(`<h2>${u ? 'Edit user' : 'Add user'}</h2>
    <form class="form" id="uForm">
      <label>Full name<input name="name" required value="${esc(u?.name)}"></label>
      <label>Email<input name="email" type="email" required value="${esc(u?.email)}"></label>
      <div class="two"><label>Role<select name="role" ${u?.id === me.id ? 'disabled' : ''}>${ROLES.map((r) => `<option ${r === (u?.role || 'student') ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label>Year / class <span class="muted">(optional)</span><input name="group" value="${esc(u?.group)}" placeholder="e.g. Y10 / 10B"></label></div>
      ${u ? '' : '<p class="small muted">A temporary password will be generated. The user must change it at first sign-in.</p>'}
      <div class="form-error" hidden></div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${u ? 'Save' : 'Create user'}</button></div>
    </form>`);
  const f = m.querySelector('form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const vals = { name: f.name.value, email: f.email.value, group: f.group.value };
    if (!f.role.disabled) vals.role = f.role.value;
    const res = u ? await api.updateUser(u.id, vals) : await api.createUser(vals);
    if (!res.ok) { const err = m.querySelector('.form-error'); err.textContent = res.error; err.hidden = false; return; }
    m.close();
    if (!u) passwordModal(res.user, res.tempPassword); else toast('User updated.');
    render();
  };
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const split = (l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
  let rows = lines.map(split);
  if (rows[0] && rows[0].some((c) => /^(name|email|role)$/i.test(c))) {
    const head = rows.shift().map((h) => h.toLowerCase());
    const idx = (k) => head.findIndex((h) => h.startsWith(k));
    const [ni, ei, ri, gi] = [idx('name'), idx('email'), idx('role'), Math.max(idx('group'), idx('class'), idx('year'))];
    return rows.map((r) => ({ name: r[ni] || '', email: r[ei] || '', role: ri >= 0 ? r[ri] : 'student', group: gi >= 0 ? r[gi] : '' }));
  }
  return rows.map((r) => ({ name: r[0] || '', email: r[1] || '', role: r[2] || 'student', group: r[3] || '' }));
}

function importDialog() {
  const m = modal(`<h2>Import users from CSV</h2>
    <p class="small muted">Columns: <code>name, email, role, group</code> (role = student / teacher / admin; defaults to student). A header row is optional. Export from Google Sheets or Numbers as CSV, or paste below.</p>
    <input type="file" accept=".csv,text/csv" id="csvFile">
    <textarea id="csvText" rows="8" placeholder="name,email,role,group&#10;Jane Doe,jane.doe@school.ac.th,student,Y9 / 9B"></textarea>
    <div class="form-error" hidden></div>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-go>Import</button></div>`, { wide: true });
  m.querySelector('#csvFile').onchange = async (e) => { const f = e.target.files[0]; if (f) m.querySelector('#csvText').value = await f.text(); };
  m.querySelector('[data-go]').onclick = async () => {
    const rows = parseCSV(m.querySelector('#csvText').value);
    if (!rows.length) { const err = m.querySelector('.form-error'); err.textContent = 'Nothing to import.'; err.hidden = false; return; }
    const results = await api.importUsers(rows);
    m.close();
    const ok = results.filter((r) => r.ok);
    const csv = 'name,email,role,temporary_password\n' + ok.map((r) => [r.name, r.email, r.role || 'student', r.tempPassword].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const rm = modal(`<h2>Import complete</h2><p>${ok.length} created, ${results.length - ok.length} skipped.</p>
      <div class="table-wrap"><table class="table compact"><thead><tr><th>Name</th><th>Email</th><th>Result</th></tr></thead><tbody>
      ${results.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${r.ok ? `<code>${esc(r.tempPassword)}</code>` : `<span class="bad-text">${esc(r.error)}</span>`}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="modal-actions">${ok.length ? '<button class="btn ghost" data-dl>Download passwords CSV</button>' : ''}<button class="btn primary" data-close>Done</button></div>`, { wide: true });
    rm.querySelector('[data-dl]')?.addEventListener('click', () => download('new-user-passwords.csv', csv, 'text/csv'));
    render();
  };
}

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── Admin: room info ─────────────────────────────────────────
function resizeImage(file, max = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = url;
  });
}

async function viewRoomEditor() {
  const rs = await rooms(true);
  $app.innerHTML = `<div class="page-head"><h1>Room info</h1><p class="muted">Edit the image and description shown on each room's info page.</p></div>
    ${rs.map((r) => `<section class="card room-edit" id="${r.id}"><form data-room="${r.id}" class="form">
      <div class="room-edit-grid">
        <div class="img-col"><img src="${esc(r.image)}" alt="" class="preview">
          <label class="btn ghost sm file-btn">Upload image<input type="file" accept="image/*" hidden></label>
          <button type="button" class="linklike small" data-default>Use default image</button>
          <input type="hidden" name="image" value="${esc(r.image)}"></div>
        <div>
          <div class="two"><label>Room name<input name="name" value="${esc(r.name)}" required></label>
            <label>Type<input name="type" value="${esc(r.type)}"></label></div>
          <label>Capacity<input name="capacity" type="number" min="1" value="${esc(r.capacity)}"></label>
          <label>Description<textarea name="description" rows="5">${esc(r.description)}</textarea></label>
          <label>Equipment <span class="muted">(one per line)</span><textarea name="equipment" rows="3">${esc((r.equipment || []).join('\n'))}</textarea></label>
          <div class="actions"><button class="btn primary">Save ${esc(r.name)}</button><a class="btn ghost" href="#/rooms/${r.id}">View page</a></div>
        </div></div></form></section>`).join('')}`;
  $app.querySelectorAll('form[data-room]').forEach((f) => {
    const preview = f.querySelector('.preview');
    f.querySelector('input[type=file]').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { const url = await resizeImage(file); f.image.value = url; preview.src = url; toast('Image added. Press Save to keep it.'); }
      catch (err) { toast(err.message, 'error'); }
    };
    f.querySelector('[data-default]').onclick = () => { const r = rs.find((x) => x.id === f.dataset.room); f.image.value = r.defaultImage; preview.src = r.defaultImage; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await api.updateRoom(f.dataset.room, {
          name: f.name.value.trim(), type: f.type.value.trim(), capacity: Number(f.capacity.value) || 1,
          description: f.description.value.trim(), image: f.image.value,
          equipment: f.equipment.value.split('\n').map((s) => s.trim()).filter(Boolean),
        });
        if (!res.ok) return toast(res.error, 'error');
        roomsCache = null;
        toast('Room info saved.');
      } catch (err) { toast(err.message, 'error'); }
    };
  });
  const target = location.hash.split('#')[2];
  if (target) document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
}

// ── Admin: data ──────────────────────────────────────────────
async function viewData() {
  $app.innerHTML = `<div class="page-head"><h1>Data</h1></div>
    <section class="card"><h2>Where is the data stored?</h2>
      <p>This demo stores everything in <strong>this browser</strong> (localStorage). Other people using the GitHub Pages link have their own separate copy. That's fine for demos and testing on one device. For real use across the school, connect a shared backend (see the README).</p></section>
    <section class="card"><h2>Backup & restore</h2>
      <p class="muted">Export all users, bookings, room info and the email log as a JSON file, or restore from one.</p>
      <div class="actions"><button class="btn primary" id="exportBtn">Export JSON</button>
      <label class="btn ghost file-btn">Import JSON<input type="file" accept=".json,application/json" id="importFile" hidden></label></div></section>
    <section class="card danger-zone"><h2>Reset demo</h2>
      <p class="muted">Delete everything in this browser and reload the sample accounts, rooms and bookings.</p>
      <button class="btn danger" id="resetBtn">Reset demo data</button></section>`;
  document.getElementById('exportBtn').onclick = async () => download(`music-room-booking-${today()}.json`, await api.exportData(), 'application/json');
  document.getElementById('importFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await confirmDialog('Replace all data?', 'Everything currently stored in this browser will be replaced by the file.', 'Replace', true))) return;
    const res = await api.importData(await f.text());
    if (!res.ok) return toast(res.error, 'error');
    roomsCache = null; toast('Data imported.'); render();
  };
  document.getElementById('resetBtn').onclick = async () => {
    if (!(await confirmDialog('Reset demo data?', 'All users, bookings and changes in this browser will be deleted.', 'Reset', true))) return;
    await api.resetDemo(); roomsCache = null; toast('Demo data reset.'); go('/login');
  };
}

// ── Start ────────────────────────────────────────────────────
// Footer is decorative: create it if the page doesn't have one, and never let it stop the app starting.
try {
  let $foot = document.getElementById('footer');
  if (!$foot) { $foot = document.createElement('footer'); $foot.id = 'footer'; $foot.className = 'footer'; $app.after($foot); }
  $foot.innerHTML = `<div class="footer-inner">${footerArt()}<p>${esc(APP.school)} · ${esc(APP.name)}</p></div>`;
} catch (e) { console.warn('Footer not drawn:', e); }
window.addEventListener('hashchange', render);
document.addEventListener('click', (e) => { const pop = document.getElementById('userPop'); if (pop && !e.target.closest('.user-menu')) pop.hidden = true; });
api.init().then(render).catch((e) => {
  console.error(e);
  $app.innerHTML = `<div class="card notice error">Could not start the app: ${esc(e.message)}</div>`;
});
