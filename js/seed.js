// Demo data: sample accounts and a few bookings so the schedules aren't empty.
import { ROOMS } from './config.js';
import { hashPassword, randomSalt, uid } from './crypto.js';
import { bookableDays, slotsForDate } from './rules.js';
import { atTime } from './dates.js';

export const DEMO_ACCOUNTS = [
  { name: 'Music Admin',  email: 'admin@school.demo',   role: 'admin',   password: 'admin123' },
  { name: 'Ms Rivera',    email: 'teacher@school.demo', role: 'teacher', password: 'teacher123' },
  { name: 'Sam Patel',    email: 'student@school.demo', role: 'student', password: 'student123', group: 'Y9 / 9A' },
];
const EXTRA_STUDENTS = [
  ['Mia Chen', 'Y10 / 10B'], ['Leo Wright', 'Y11 / 11C'], ['Ava Nguyen', 'Y8 / 8A'],
  ['Noah Kim', 'Y12 / 12M'], ['Isla Brown', 'Y7 / 7D'], ['Kai Suzuki', 'Y10 / 10A'],
];
const PURPOSES = ['Grade 6 piano exam pieces', 'Drum practice', 'Singing — school show', 'Guitar duo rehearsal', 'Composition coursework', 'Violin scales'];

async function makeUser({ name, email, role, password, group = '' }) {
  const salt = randomSalt();
  return {
    id: uid(), name, email, role, group, salt,
    passwordHash: await hashPassword(password, salt),
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };
}

export async function seedData() {
  const users = [];
  for (const a of DEMO_ACCOUNTS) users.push(await makeUser(a));
  for (const [i, [name, group]] of EXTRA_STUDENTS.entries()) {
    const email = name.toLowerCase().replace(/\s+/g, '.') + '@school.demo';
    users.push(await makeUser({ name, email, role: 'student', password: 'student123', group }));
    void i;
  }

  const now = new Date();
  const days = bookableDays(now);
  const bookings = [];
  const students = users.filter((u) => u.role === 'student' && u.email !== 'student@school.demo');
  students.forEach((u, i) => {
    const date = days[i % Math.min(days.length, 5)];
    if (!date) return;
    const open = slotsForDate(date).filter((s) => atTime(date, s.start) > now);
    if (!open.length) return;
    const slot = open[i % open.length];
    const room = ROOMS[i % ROOMS.length];
    if (bookings.some((b) => b.roomId === room.id && b.date === date && b.slotId === slot.id)) return;
    bookings.push({
      id: uid(), roomId: room.id, date, slotId: slot.id, userId: u.id,
      purpose: PURPOSES[i % PURPOSES.length], status: 'confirmed', createdAt: now.toISOString(),
    });
  });

  const rooms = ROOMS.map((r) => {
    const image = `assets/rooms/${r.id}.svg`;
    return { ...r, equipment: [...r.equipment], image, defaultImage: image };
  });

  return { version: 1, users, bookings, rooms, emails: [] };
}
