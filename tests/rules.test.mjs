// Run with:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBooking, slotsForDate, userQuota, bookableDays } from '../js/rules.js';
import { ROOMS } from '../js/config.js';

const student = { id: 's1', role: 'student' };
const teacher = { id: 't1', role: 'teacher' };
// Monday 16 Nov 2026, 07:00
const NOW = new Date(2026, 10, 16, 7, 0);
const base = { user: student, rooms: ROOMS, bookings: [], now: NOW };
const bk = (o) => ({ id: Math.random().toString(36), status: 'confirmed', userId: 's1', roomId: 'practice-1', ...o });

test('slots: Monday has 15:40 after-school, Tue–Fri have 14:40, weekends none', () => {
  assert.deepEqual(slotsForDate('2026-11-16').map((s) => s.start), ['07:30', '10:10', '12:45', '15:40']);
  assert.deepEqual(slotsForDate('2026-11-17').map((s) => s.start), ['07:30', '10:10', '12:45', '14:40']);
  assert.equal(slotsForDate('2026-11-21').length, 0);
  assert.equal(slotsForDate('2026-11-22').length, 0);
});

test('valid booking is accepted', () => {
  assert.equal(validateBooking({ ...base, roomId: 'practice-1', date: '2026-11-16', slotId: 'break' }).ok, true);
});

test('teachers cannot book', () => {
  assert.equal(validateBooking({ ...base, user: teacher, roomId: 'practice-1', date: '2026-11-16', slotId: 'break' }).ok, false);
});

test('wrong slot for weekday is rejected', () => {
  assert.equal(validateBooking({ ...base, roomId: 'practice-1', date: '2026-11-16', slotId: 'after' }).ok, false);
  assert.equal(validateBooking({ ...base, roomId: 'practice-1', date: '2026-11-17', slotId: 'after-mon' }).ok, false);
  assert.equal(validateBooking({ ...base, roomId: 'practice-1', date: '2026-11-21', slotId: 'break' }).ok, false);
});

test('past or started slots are rejected', () => {
  const now = new Date(2026, 10, 16, 7, 35);
  assert.equal(validateBooking({ ...base, now, roomId: 'practice-1', date: '2026-11-16', slotId: 'early' }).ok, false);
  assert.equal(validateBooking({ ...base, roomId: 'practice-1', date: '2026-11-13', slotId: 'break' }).ok, false);
});

test('no more than 14 days ahead', () => {
  assert.equal(validateBooking({ ...base, roomId: 'practice-1', date: '2026-11-30', slotId: 'break' }).ok, true);  // +14
  assert.equal(validateBooking({ ...base, roomId: 'practice-1', date: '2026-12-01', slotId: 'break' }).ok, false); // +15
});

test('double booking a room slot is rejected', () => {
  const bookings = [bk({ userId: 'other', date: '2026-11-16', slotId: 'break' })];
  assert.equal(validateBooking({ ...base, bookings, roomId: 'practice-1', date: '2026-11-16', slotId: 'break' }).ok, false);
  // a different room at the same time is fine
  assert.equal(validateBooking({ ...base, bookings, roomId: 'practice-2', date: '2026-11-16', slotId: 'break' }).ok, true);
});

test('1 booking per user per day', () => {
  const bookings = [bk({ date: '2026-11-16', slotId: 'early' })];
  const r = validateBooking({ ...base, bookings, roomId: 'practice-2', date: '2026-11-16', slotId: 'lunch' });
  assert.equal(r.ok, false);
  assert.match(r.error, /per day/);
});

test('2 bookings per user per week (Mon–Sun)', () => {
  const bookings = [bk({ date: '2026-11-16', slotId: 'break' }), bk({ date: '2026-11-17', slotId: 'break' })];
  const r = validateBooking({ ...base, bookings, roomId: 'practice-1', date: '2026-11-18', slotId: 'break' });
  assert.equal(r.ok, false);
  assert.match(r.error, /per week/);
  // next week is fine
  assert.equal(validateBooking({ ...base, bookings, roomId: 'practice-1', date: '2026-11-23', slotId: 'break' }).ok, true);
});

test('cancelled bookings do not count', () => {
  const bookings = [bk({ date: '2026-11-16', slotId: 'break', status: 'cancelled' })];
  assert.equal(validateBooking({ ...base, bookings, roomId: 'practice-1', date: '2026-11-16', slotId: 'break' }).ok, true);
  assert.deepEqual(userQuota('s1', '2026-11-16', bookings).week, 0);
});

test('bookable days = weekdays within 14 days', () => {
  const days = bookableDays(NOW);
  assert.equal(days[0], '2026-11-16');
  assert.equal(days.at(-1), '2026-11-30');
  assert.equal(days.length, 11);
});
