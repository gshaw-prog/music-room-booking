// Email sending. Every message is logged in the app; if EMAIL.provider is
// 'emailjs' it is also delivered through EmailJS (works from a static site).
import { EMAIL, APP } from './config.js';
import * as store from './store.js';
import { uid } from './crypto.js';
import { fmtLong } from './dates.js';

async function deliver(msg) {
  const rec = { id: uid(), ...msg, sentAt: new Date().toISOString(), provider: EMAIL.provider, status: 'logged' };
  if (EMAIL.provider === 'emailjs') {
    try {
      const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: EMAIL.emailjs.serviceId,
          template_id: EMAIL.emailjs.templateId,
          user_id: EMAIL.emailjs.publicKey,
          template_params: { to_email: msg.to, to_name: msg.toName, subject: msg.subject, message: msg.body },
        }),
      });
      rec.status = r.ok ? 'sent' : 'failed';
      if (!r.ok) rec.error = await r.text();
    } catch (e) {
      rec.status = 'failed';
      rec.error = e.message;
    }
  }
  const d = store.data();
  d.emails.unshift(rec);
  d.emails = d.emails.slice(0, 500);
  store.save();
  return rec;
}

const first = (name) => (name || '').split(' ')[0];
const ref = (b) => b.id.slice(0, 8).toUpperCase();

export function sendBookingConfirmation({ user, booking, room, slot }) {
  const when = `${fmtLong(booking.date)}, ${slot.start}–${slot.end}`;
  return deliver({
    type: 'confirmation', bookingId: booking.id, to: user.email, toName: user.name,
    subject: `Booking confirmed: ${room.name} — ${when}`,
    body:
`Hi ${first(user.name)},

Your music room booking is confirmed.

Room:  ${room.name}
Date:  ${fmtLong(booking.date)}
Time:  ${slot.label}, ${slot.start}–${slot.end}${booking.purpose ? `\nNotes: ${booking.purpose}` : ''}
Ref:   ${ref(booking)}

Please arrive on time and leave the room tidy. If you can no longer use the room, cancel the booking in "My bookings" so someone else can use it.

${APP.school}`,
  });
}

export function sendBookingCancellation({ user, booking, room, slot, byAdmin }) {
  return deliver({
    type: 'cancellation', bookingId: booking.id, to: user.email, toName: user.name,
    subject: `Booking cancelled: ${room.name} — ${fmtLong(booking.date)}, ${slot.start}–${slot.end}`,
    body:
`Hi ${first(user.name)},

Your booking for ${room.name} on ${fmtLong(booking.date)} (${slot.start}–${slot.end}) has been cancelled${byAdmin ? ' by the Music Department' : ''}.

Ref: ${ref(booking)}

${APP.school}`,
  });
}
