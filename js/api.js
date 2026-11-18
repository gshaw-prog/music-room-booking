// ─────────────────────────────────────────────────────────────
//  API layer. The UI only talks to these async functions.
//  This version is a "pretend server" that stores data in the
//  browser (localStorage) so the app runs on GitHub Pages.
//  To go live, re-implement these functions against a real
//  backend (Google Apps Script + Sheets, Firebase, Supabase…)
//  — the UI will not need to change.
// ─────────────────────────────────────────────────────────────
import * as store from './store.js';
import { ROLES } from './config.js';
import { validateBooking, userQuota, getSlot, canManage } from './rules.js';
import { atTime, toISO } from './dates.js';
import * as email from './email.js';
import { hashPassword, randomSalt, uid, tempPassword } from './crypto.js';

const SESSION_KEY = 'mrb.session';
let memSession = null;
const getSession = () => { try { return localStorage.getItem(SESSION_KEY); } catch { return memSession; } };
const setSession = (id) => { memSession = id; try { id ? localStorage.setItem(SESSION_KEY, id) : localStorage.removeItem(SESSION_KEY); } catch { /* memory only */ } };

const db = () => store.data();
const findUser = (id) => db().users.find((u) => u.id === id);
const me = () => findUser(getSession());
const isStaff = (u) => u.role === 'teacher' || u.role === 'admin';
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, salt, ...rest } = u;
  return rest;
}
function requireUser() {
  const u = me();
  if (!u) throw new Error('Please sign in.');
  return u;
}
function requireRole(...roles) {
  const u = requireUser();
  if (!roles.includes(u.role)) throw new Error('You do not have permission to do that.');
  return u;
}

function shapeBooking(b, viewer) {
  const mine = b.userId === viewer.id;
  const out = { id: b.id, roomId: b.roomId, date: b.date, slotId: b.slotId, status: b.status, mine, createdAt: b.createdAt };
  if (mine || isStaff(viewer)) {
    const owner = findUser(b.userId);
    out.purpose = b.purpose || '';
    out.cancelledAt = b.cancelledAt;
    out.user = owner ? { name: owner.name, group: owner.group || '', email: owner.email } : { name: 'Deleted user', group: '', email: '' };
    if (b.createdBy && b.createdBy !== b.userId) out.bookedBy = findUser(b.createdBy)?.name || 'Staff';
  }
  return out;
}

// ── Session ──────────────────────────────────────────────────
export async function init() { await store.init(); }
export async function currentUser() { return publicUser(me()); }

export async function login(emailAddr, password) {
  const u = db().users.find((x) => normEmail(x.email) === normEmail(emailAddr));
  if (!u || (await hashPassword(password, u.salt)) !== u.passwordHash) {
    return { ok: false, error: 'Email or password is incorrect.' };
  }
  setSession(u.id);
  return { ok: true, user: publicUser(u) };
}
export async function logout() { setSession(null); }

export async function changePassword(current, next) {
  const u = requireUser();
  if (!u.mustChangePassword && (await hashPassword(current, u.salt)) !== u.passwordHash) {
    return { ok: false, error: 'Your current password is incorrect.' };
  }
  if (!next || next.length < 6) return { ok: false, error: 'New password must be at least 6 characters.' };
  u.salt = randomSalt();
  u.passwordHash = await hashPassword(next, u.salt);
  u.mustChangePassword = false;
  store.save();
  return { ok: true };
}

// ── Rooms ────────────────────────────────────────────────────
export async function listRooms() {
  requireUser();
  return db().rooms.map((r) => ({ ...r, equipment: [...(r.equipment || [])] }));
}
export async function updateRoom(id, patch) {
  requireRole('admin');
  const r = db().rooms.find((x) => x.id === id);
  if (!r) return { ok: false, error: 'Room not found.' };
  const allowed = ['name', 'type', 'capacity', 'equipment', 'description', 'image'];
  for (const k of allowed) if (k in patch) r[k] = patch[k];
  store.save();
  return { ok: true };
}

// ── Bookings ─────────────────────────────────────────────────
export async function listBookings({ from, to, roomId } = {}) {
  const u = requireUser();
  return db().bookings
    .filter((b) => b.status === 'confirmed' && (!from || b.date >= from) && (!to || b.date <= to) && (!roomId || b.roomId === roomId))
    .map((b) => shapeBooking(b, u));
}

export async function listMyBookings() {
  const u = requireUser();
  return db().bookings.filter((b) => b.userId === u.id).map((b) => shapeBooking(b, u));
}

export async function getQuota(date) {
  const u = requireUser();
  return userQuota(u.id, date, db().bookings);
}

/** People staff can book for: everyone, students first. */
export async function listBookingOwners() {
  const u = requireUser();
  if (!canManage(u)) throw new Error('You do not have permission to do that.');
  const order = { student: 0, teacher: 1, admin: 2 };
  return db().users
    .map((x) => ({ id: x.id, name: x.name, group: x.group || '', role: x.role }))
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
}

export async function createBooking({ roomId, date, slotId, purpose, forUserId }) {
  const actor = requireUser();
  const d = db();
  const u = forUserId ? findUser(forUserId) : actor;
  if (!u) return { ok: false, error: 'Choose who the booking is for.' };
  const v = validateBooking({ user: u, actor, roomId, date, slotId, bookings: d.bookings, rooms: d.rooms });
  if (!v.ok) return v;
  const booking = {
    id: uid(), roomId, date, slotId, userId: u.id, createdBy: actor.id,
    purpose: String(purpose || '').trim().slice(0, 80),
    status: 'confirmed', // auto-approved
    createdAt: new Date().toISOString(),
  };
  d.bookings.push(booking);
  store.save();
  const room = d.rooms.find((r) => r.id === roomId);
  const mail = await email.sendBookingConfirmation({ user: u, booking, room, slot: getSlot(slotId), bookedBy: u.id !== actor.id ? actor : null });
  return { ok: true, booking: shapeBooking(booking, actor), email: mail };
}

export async function cancelBooking(id) {
  const u = requireUser();
  const d = db();
  const b = d.bookings.find((x) => x.id === id);
  if (!b || b.status !== 'confirmed') return { ok: false, error: 'Booking not found.' };
  const isOwner = b.userId === u.id;
  const staff = canManage(u);
  if (!isOwner && !staff) return { ok: false, error: 'You can only cancel your own bookings.' };
  const slot = getSlot(b.slotId);
  if (!staff && atTime(b.date, slot.start) <= new Date()) {
    return { ok: false, error: 'This booking has already started.' };
  }
  b.status = 'cancelled';
  b.cancelledAt = new Date().toISOString();
  b.cancelledBy = u.id;
  store.save();
  const owner = findUser(b.userId);
  if (owner) {
    await email.sendBookingCancellation({ user: owner, booking: b, room: d.rooms.find((r) => r.id === b.roomId), slot, byAdmin: !isOwner });
  }
  return { ok: true };
}

// ── Users (admin) ────────────────────────────────────────────
export async function listUsers() {
  requireRole('admin');
  const today = toISO(new Date());
  return db().users.map((u) => ({
    ...publicUser(u),
    upcoming: db().bookings.filter((b) => b.userId === u.id && b.status === 'confirmed' && b.date >= today).length,
  }));
}

export async function createUser({ name, email: addr, role, group, password }) {
  requireRole('admin');
  name = String(name || '').trim();
  addr = normEmail(addr);
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!validEmail(addr)) return { ok: false, error: `"${addr}" is not a valid email address.` };
  if (!ROLES.includes(role)) return { ok: false, error: 'Choose a valid role.' };
  if (db().users.some((u) => normEmail(u.email) === addr)) return { ok: false, error: `${addr} already has an account.` };
  const pw = password || tempPassword();
  const salt = randomSalt();
  const user = {
    id: uid(), name, email: addr, role, group: String(group || '').trim(), salt,
    passwordHash: await hashPassword(pw, salt),
    mustChangePassword: true, createdAt: new Date().toISOString(),
  };
  db().users.push(user);
  store.save();
  return { ok: true, user: publicUser(user), tempPassword: pw };
}

export async function importUsers(rows) {
  requireRole('admin');
  const results = [];
  for (const r of rows) {
    const res = await createUser({ ...r, role: (r.role || 'student').toLowerCase() });
    results.push({ ...r, ok: res.ok, error: res.error, tempPassword: res.tempPassword });
  }
  return results;
}

export async function updateUser(id, patch) {
  const admin = requireRole('admin');
  const u = findUser(id);
  if (!u) return { ok: false, error: 'User not found.' };
  if ('role' in patch) {
    if (!ROLES.includes(patch.role)) return { ok: false, error: 'Invalid role.' };
    if (u.id === admin.id && patch.role !== 'admin') return { ok: false, error: "You can't remove your own admin role." };
    u.role = patch.role;
  }
  if ('email' in patch) {
    const addr = normEmail(patch.email);
    if (!validEmail(addr)) return { ok: false, error: 'Invalid email address.' };
    if (db().users.some((x) => x.id !== id && normEmail(x.email) === addr)) return { ok: false, error: 'That email is already in use.' };
    u.email = addr;
  }
  if ('name' in patch) { if (!String(patch.name).trim()) return { ok: false, error: 'Name is required.' }; u.name = String(patch.name).trim(); }
  if ('group' in patch) u.group = String(patch.group || '').trim();
  store.save();
  return { ok: true, user: publicUser(u) };
}

export async function resetPassword(id) {
  requireRole('admin');
  const u = findUser(id);
  if (!u) return { ok: false, error: 'User not found.' };
  const pw = tempPassword();
  u.salt = randomSalt();
  u.passwordHash = await hashPassword(pw, u.salt);
  u.mustChangePassword = true;
  store.save();
  return { ok: true, tempPassword: pw };
}

export async function deleteUser(id) {
  const admin = requireRole('admin');
  if (id === admin.id) return { ok: false, error: "You can't delete your own account." };
  const d = db();
  const today = toISO(new Date());
  d.bookings.forEach((b) => {
    if (b.userId === id && b.status === 'confirmed' && b.date >= today) {
      b.status = 'cancelled'; b.cancelledAt = new Date().toISOString(); b.cancelledBy = admin.id;
    }
  });
  d.users = d.users.filter((u) => u.id !== id);
  store.save();
  return { ok: true };
}

// ── Emails ───────────────────────────────────────────────────
export async function listEmails({ all = false } = {}) {
  const u = requireUser();
  if (all) { requireRole('admin'); return [...db().emails]; }
  return db().emails.filter((e) => normEmail(e.to) === normEmail(u.email));
}

// ── Data (admin) ─────────────────────────────────────────────
export async function stats() {
  requireRole('admin', 'teacher');
  const d = db();
  const today = toISO(new Date());
  return {
    users: d.users.length,
    students: d.users.filter((u) => u.role === 'student').length,
    upcoming: d.bookings.filter((b) => b.status === 'confirmed' && b.date >= today).length,
  };
}
export async function exportData() { requireRole('admin'); return JSON.stringify(db(), null, 2); }
export async function importData(json) {
  requireRole('admin');
  let next;
  try { next = JSON.parse(json); } catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  if (!Array.isArray(next.users) || !Array.isArray(next.bookings) || !Array.isArray(next.rooms)) {
    return { ok: false, error: 'That file does not look like a Music Room Booking export.' };
  }
  next.emails ||= [];
  store.replace(next);
  if (!me()) setSession(null);
  return { ok: true };
}
export async function resetDemo() { requireRole('admin'); await store.reset(); setSession(null); return { ok: true }; }
