// ─────────────────────────────────────────────────────────────
//  Music Room Booking — configuration
//  Edit this file to change rooms, time slots, booking rules
//  and email settings. Room descriptions/images can also be
//  edited in the app by an admin (Admin → Room info).
// ─────────────────────────────────────────────────────────────

export const APP = {
  name: 'Music Room Booking',
  school: 'BISP Music Department',
  // Demo mode shows the sample accounts on the sign-in page.
  demoMode: true,
};

// Day numbers: 1 = Monday … 5 = Friday
export const SLOTS = [
  { id: 'early',     group: 'early', label: 'Before school', start: '07:30', end: '07:45', days: [1, 2, 3, 4, 5] },
  { id: 'break',     group: 'break', label: 'Break',         start: '10:10', end: '10:35', days: [1, 2, 3, 4, 5] },
  { id: 'lunch',     group: 'lunch', label: 'Lunch',         start: '12:45', end: '13:35', days: [1, 2, 3, 4, 5] },
  { id: 'after-mon', group: 'after', label: 'After school',  start: '15:40', end: '16:00', days: [1] },
  { id: 'after',     group: 'after', label: 'After school',  start: '14:40', end: '16:00', days: [2, 3, 4, 5] },
];

// Rows used in the weekly schedule view (slots sharing a group sit in one row)
export const SLOT_GROUPS = [
  { id: 'early', label: 'Before school' },
  { id: 'break', label: 'Break' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'after', label: 'After school' },
];

export const RULES = {
  maxPerDay: 1,          // bookings per user per day
  maxPerWeek: 2,         // bookings per user per week (Mon–Sun)
  maxDaysAhead: 14,      // cannot book more than 2 weeks ahead
  bookingRoles: ['student'], // roles allowed to make bookings
  autoApprove: true,     // bookings are confirmed immediately
};

export const ROLES = ['student', 'teacher', 'admin'];

// Default room info — placeholders for the Music Department to replace.
export const ROOMS = [
  {
    id: 'practice-1', name: 'Practice Room 1', type: 'Practice room', capacity: 2,
    equipment: ['Upright piano', '2 music stands', 'Chairs'],
    description: 'A quiet, sound-treated practice room with an upright piano. Ideal for individual piano, vocal or instrumental practice.\n\nPlease close the piano lid and leave the room tidy when you finish.',
  },
  {
    id: 'practice-2', name: 'Practice Room 2', type: 'Practice room', capacity: 2,
    equipment: ['Digital piano with headphones', 'Music stand', 'Chairs'],
    description: 'A compact practice room with a digital piano and headphones — good for quiet practice and composition work.',
  },
  {
    id: 'practice-3', name: 'Practice Room 3', type: 'Practice room', capacity: 3,
    equipment: ['Electronic drum kit', 'Guitar amplifier', 'Music stands'],
    description: 'Our band-practice room with an electronic drum kit and amplifier. Suitable for drummers, guitarists and small groups of up to three.',
  },
  {
    id: 'classroom-large', name: 'Large Classroom', type: 'Classroom', capacity: 30,
    equipment: ['Acoustic piano', 'Projector & speakers', 'Whiteboard', 'Ensemble chairs and stands'],
    description: 'The main music classroom. Book it for ensemble rehearsals, choir or larger group practice.',
  },
  {
    id: 'classroom-small', name: 'Small Classroom', type: 'Classroom', capacity: 12,
    equipment: ['Keyboard', 'Whiteboard', 'Music stands'],
    description: 'A smaller teaching room for small ensembles, chamber groups and section rehearsals.',
  },
];

// Email delivery
//  'demo'    → emails are logged in the app (Admin → Email log, and each user's "My emails")
//  'emailjs' → emails are sent with EmailJS (https://www.emailjs.com) AND logged.
//              Fill in the three values below; see README for the template setup.
export const EMAIL = {
  provider: 'demo',
  emailjs: { serviceId: '', templateId: '', publicKey: '' },
};
