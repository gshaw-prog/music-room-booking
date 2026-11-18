// Booking rules — pure functions (no DOM), unit-tested in tests/rules.test.mjs.
// When a real backend is added, run the same checks on the server.
import { SLOTS, RULES } from './config.js';
import { toISO, addDays, weekday, weekStart, atTime } from './dates.js';

export function slotsForDate(date) {
  const wd = weekday(date);
  return SLOTS.filter((s) => s.days.includes(wd));
}
export function slotForGroup(date, groupId) {
  return slotsForDate(date).find((s) => s.group === groupId) || null;
}
export function getSlot(id) { return SLOTS.find((s) => s.id === id) || null; }

export function isSchoolDay(date) { return slotsForDate(date).length > 0; }

/** Last date that can be booked from `now`. */
export function lastBookableDate(now = new Date()) {
  return addDays(toISO(now), RULES.maxDaysAhead);
}

/** Bookable school days from today to the advance limit. */
export function bookableDays(now = new Date()) {
  const today = toISO(now);
  const out = [];
  for (let i = 0; i <= RULES.maxDaysAhead; i++) {
    const d = addDays(today, i);
    if (isSchoolDay(d)) out.push(d);
  }
  return out;
}

export function userQuota(userId, date, bookings) {
  const mine = bookings.filter((b) => b.status === 'confirmed' && b.userId === userId);
  const ws = weekStart(date);
  const we = addDays(ws, 6);
  return {
    day: mine.filter((b) => b.date === date).length,
    week: mine.filter((b) => b.date >= ws && b.date <= we).length,
    maxDay: RULES.maxPerDay,
    maxWeek: RULES.maxPerWeek,
  };
}

/**
 * Validate a booking request. Returns { ok: true } or { ok: false, error }.
 */
export function validateBooking({ user, roomId, date, slotId, bookings, rooms, now = new Date() }) {
  const fail = (error) => ({ ok: false, error });
  if (!user) return fail('Please sign in to book.');
  if (!RULES.bookingRoles.includes(user.role)) return fail('Your account type cannot make bookings.');
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return fail('Unknown room.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return fail('Invalid date.');
  const slot = slotsForDate(date).find((s) => s.id === slotId);
  if (!slot) return fail('That time slot is not available on this day.');

  const today = toISO(now);
  if (date < today || atTime(date, slot.start) <= now) return fail('This time slot has already started or passed.');
  if (date > addDays(today, RULES.maxDaysAhead)) {
    return fail(`Bookings can only be made up to ${RULES.maxDaysAhead} days ahead.`);
  }
  const taken = bookings.some((b) => b.status === 'confirmed' && b.roomId === roomId && b.date === date && b.slotId === slotId);
  if (taken) return fail('Sorry — that room has just been booked for this slot.');

  const q = userQuota(user.id, date, bookings);
  if (q.day >= RULES.maxPerDay) return fail(`You can only make ${RULES.maxPerDay} booking per day.`);
  if (q.week >= RULES.maxPerWeek) return fail(`You can only make ${RULES.maxPerWeek} bookings per week.`);
  return { ok: true };
}
