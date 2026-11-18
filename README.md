# Music Room Booking

A web app for students to book music practice rooms and classrooms. It's built to run on **GitHub Pages** for demos and testing: no server and no build step, just plain HTML, CSS and JavaScript modules.

## Features

| | Students | Teachers | Admin |
|---|:-:|:-:|:-:|
| Book a room for yourself (auto-approved, confirmation email) | ✓ within the rules | ✓ no limits | ✓ no limits |
| Book a room for a student | | ✓ | ✓ |
| View & cancel own bookings | ✓ | ✓ | ✓ |
| Cancel any booking | | ✓ | ✓ |
| Room schedules (weekly view) | ✓ (booker names hidden) | ✓ full details | ✓ full details |
| Booking details list with print view | | ✓ | ✓ |
| Room info pages (image + description) | ✓ | ✓ | ✓ edit |
| Add users, CSV import, assign roles, reset passwords | | | ✓ |
| Email log, backup/restore, reset demo | | | ✓ |

**Rooms:** Practice Rooms 1–3, Large Classroom, Small Classroom

**Bookable slots**

| Slot | Mon | Tue–Fri |
|---|---|---|
| Before school | 07:30–07:45 | 07:30–07:45 |
| Break | 10:10–10:35 | 10:10–10:35 |
| Lunch | 12:45–13:35 | 12:45–13:35 |
| After school | 15:40–16:00 | 14:40–16:00 |

**Rules (students):** 1 booking per user per day · 2 per week (Mon–Sun) · up to 14 days ahead · no booking slots that have started · cancelled bookings free up the slot and the quota. Teachers and admins aren't bound by these limits but still can't double-book or book a slot that has started (set by `manageRoles` in `js/config.js`).

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@school.demo | admin123 |
| Teacher | teacher@school.demo | teacher123 |
| Student | student@school.demo | student123 |

Six more sample students (e.g. `mia.chen@school.demo`) use `student123`.

## Put it on GitHub Pages

1. Create a new repository on GitHub (e.g. `music-room-booking`).
2. Upload the contents of this folder to the repository root (drag and drop on github.com works), or:
   ```bash
   git init && git add . && git commit -m "Music room booking demo"
   git branch -M main
   git remote add origin https://github.com/<you>/music-room-booking.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, pick **main** and **/ (root)**, then save.
4. After about a minute the app is live at `https://<you>.github.io/music-room-booking/`.

To run it locally, use `npm start` (or `python3 -m http.server 8080`) and open http://localhost:8080. Opening `index.html` directly from disk won't work, because ES modules need a web server.

## Customise

Everything is in **`js/config.js`**:
- `SLOTS`: times and days
- `RULES`: daily/weekly limits, days ahead, which roles can book
- `ROOMS`: default names, capacity, equipment, descriptions
- `APP.demoMode`: set to `false` to hide the demo accounts on the sign-in page

Room images and descriptions can also be edited in the app (**Admin → Room info**). Uploaded photos are resized automatically. The images in `assets/rooms/` are placeholders.

## Emails

By default (`EMAIL.provider: 'demo'`), emails are **logged, not sent**. Users see theirs under *My emails*, and admins see all of them in the *Email log*.

To send real emails from the static site, use [EmailJS](https://www.emailjs.com) (free tier available):
1. Create an EmailJS account and add an email service (e.g. your school Google Workspace account).
2. Create a template with **To Email** = `{{to_email}}`, **Subject** = `{{subject}}` and **Content** = `{{message}}`.
3. In `js/config.js`, set `provider: 'emailjs'` and fill in `serviceId`, `templateId` and `publicKey`.

## ⚠️ Demo limitations: read before real use

This version stores all data in **each visitor's own browser** (localStorage). That means:
- **Bookings aren't shared between devices.** A booking made on one phone isn't visible on another, so it can't be used for real school-wide booking yet. It's good for demos, walkthroughs, UI testing and getting feedback from the Music Department.
- **Security is simulated.** Passwords are hashed, but the checks run in the browser, so a technical user could bypass them. Don't use real student passwords.

### Going live

The UI talks only to **`js/api.js`**, a set of async functions (`login`, `createBooking`, `listBookings`, `resetPassword`…). To go live, re-implement those functions against a shared backend. The UI stays the same. Good options:
- **Google Apps Script + Google Sheet:** free and uses the school's Google Workspace. Users and bookings live in a Sheet, and `MailApp` sends confirmations from a school address. You could also use Google sign-in instead of passwords.
- **Firebase** (Auth + Firestore + the "Trigger Email" extension) or **Supabase** (Auth + Postgres).

The booking rules in `js/rules.js` are pure functions. Run them on the server as well, so the limits can't be bypassed.

## Tests

```bash
npm test
```
This runs unit tests for the booking rules (slots per weekday, daily and weekly limits, the 14-day window, double-booking, past slots).

## Files

```
index.html          app shell
css/styles.css      styles (responsive, print view for schedules)
js/config.js        rooms, slots, rules, email settings  ← edit me
js/app.js           views and router (UI)
js/api.js           data/API layer  ← swap for a real backend
js/rules.js         booking rules (pure, tested)
js/store.js         localStorage persistence
js/seed.js          demo accounts and sample bookings
js/email.js         email log + optional EmailJS delivery
js/crypto.js, js/dates.js   helpers
assets/rooms/       placeholder room images
tests/              rule tests (node --test)
```
