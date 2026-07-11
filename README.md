# EMDMS — Offline LAN-Based CBT Examination System

A complete Computer-Based Test (CBT) examination platform with live invigilation,
WebRTC webcam monitoring, and anti-cheating controls. **It runs entirely on your
local network** — no internet connection, cloud services, or third-party APIs
are used at any point.

Built with: **Node.js, Express.js, Socket.IO, SQLite (better-sqlite3), and
vanilla HTML/CSS/JavaScript** on the frontend, with WebRTC for direct
peer-to-peer webcam streaming between students and invigilators over the LAN.

---

## 1. How it works

- The Express server runs on one computer on your network — typically the
  invigilator's or exam officer's laptop. This is the **server PC**.
- Every student's laptop/desktop connects to the server PC over Wi-Fi or
  Ethernet, using the server PC's local IP address (shown in the terminal
  when the server starts).
- No device needs internet access. The server PC only needs internet the
  *first* time, to run `npm install`.

---

## 2. Requirements

- [Node.js](https://nodejs.org) version 18 or later, installed on the server PC.
- All devices (server + students + invigilators) connected to the **same**
  Wi-Fi network or Ethernet switch.
- A modern browser on every device (Chrome, Edge, or Firefox recommended —
  required for WebRTC webcam support).

---

## 3. Installation (on the server PC)

```bash
# 1. Extract/copy this project folder onto the server PC
cd emdms

# 2. Install dependencies (needs internet access this one time)
npm install

# 3. Start the server
npm start
```

You should see output similar to:

```
====================================================
  EMDMS — Examination Malpractice Detection & CBT System
====================================================
  Local:   https://localhost:3000
  Network: https://192.168.1.42:3000  <-- share this with students
----------------------------------------------------
  NOTE: this uses a self-signed certificate. The first time
  each device opens the address above, the browser will show
  a "Your connection is not private" warning — click
  "Advanced" then "Proceed" (one time per device/browser).
  This is required for webcam access to work over the network.
====================================================
```

### Why HTTPS?

Browsers only allow webcam/microphone access on a "secure context" —
`https://`, or `http://localhost`. A plain `http://` address on a LAN IP
(e.g. `http://192.168.1.42:3000`) is **not** secure, so the browser silently
blocks the camera before the student ever sees a permission prompt. To make
webcam proctoring work for every student (not just on the server PC itself),
EMDMS automatically generates a self-signed HTTPS certificate on first run,
covering `localhost` and every LAN IP address currently assigned to the
server PC.

Because the certificate is self-signed (not issued by a trusted authority),
**every device will show a one-time browser warning** the first time it
opens the address — this is expected and safe on a private exam-hall
network:

- **Chrome / Edge:** click **Advanced** → **Proceed to \<address\> (unsafe)**
- **Firefox:** click **Advanced** → **Accept the Risk and Continue**

After accepting once, the browser remembers the choice for that device.

If you ever need to disable HTTPS (e.g. for troubleshooting on a network
where camera access isn't needed), set `DISABLE_HTTPS=true` in `.env` and
restart the server — but note this will break webcam proctoring for
students connecting over anything other than `localhost`.

The database (`database/emdms.db`) is created automatically the first time
you run the server, along with a default administrator account:

- **Username:** `admin`
- **Password:** `Admin@12345`

> ⚠️ Change the default admin password and the `JWT_SECRET` value in `.env`
> before running a real examination. You can also change the default
> credentials in `.env` (`DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`)
> **before** the first run — they only take effect when the database is
> first created.

---

## 4. Connecting other devices

1. On the server PC, find the "Network" address printed in the terminal
   (e.g. `http://192.168.1.42:3000`).
2. On every student and invigilator device, open a browser and go to that
   same address.
3. Each portal is reachable from the home page, or directly:
   - Administrator: `/admin/login.html`
   - Invigilator: `/invigilator/login.html`
   - Student: `/student/login.html`

The home page also includes public **About**, **Features**, and **Contact**
pages (`/about.html`, `/features.html`, `/contact.html`) — a normal
institutional website alongside the portals, so this can be the front door
to your exam system rather than just a login screen.

### Customizing the site for your institution

Before deploying, open `public/js/site-chrome.js` and change the
`INSTITUTION_NAME` constant at the top — it's used in the navbar, footer,
and About page across every public page automatically. In
`public/contact.html`, update the `RECIPIENT_EMAIL` constant and the
contact cards with your institution's real exam-office contact details.

---

## 5. Typical exam-day workflow

1. **Administrator** logs in and sets up (once per session):
   - Faculties → Departments → Classes → Subjects → Sessions/Semesters
   - Registers students (passport photo optional) and invigilators —
     generated login credentials are shown once, so note them down or print
     them for distribution.
2. **Administrator** creates an examination, adds questions (manually or by
   importing a CSV — see format below), assigns an invigilator, and clicks
   **Publish**.
3. **Invigilator** logs in, selects the exam from the sidebar, and watches
   the live monitoring grid as students log in and start their webcams.
4. **Students** log in with their registration number, read the instructions,
   grant camera access, and begin. Answers auto-save as they go; the exam
   auto-submits when the timer reaches zero.
5. After the exam, the **Administrator** views/filters/exports results
   (CSV or printable PDF) from the Results section.

### CSV question import format

```csv
question_text,marks,option_a,option_b,option_c,option_d,correct_option
What does CPU stand for?,2,Central Processing Unit,Computer Personal Unit,Central Print Unit,None,A
```

`correct_option` is the letter (A–E) of the correct option column.

---

## 6. Anti-cheating features

**Behavior-based (browser events):** right-click, copy, cut, paste and text
selection are disabled; the page is locked to full-screen (exiting is
logged); switching browser tabs is logged; opening the exam in a second tab
is blocked; and the student's webcam is streamed live to their assigned
invigilator on request via WebRTC.

**AI-based (runs locally in the student's browser):**
- **No face detected** — the student has left the camera's view
- **Multiple faces detected** — someone else is in frame
- **Head turned away** — sustained looking away from the screen (a
  heuristic based on facial landmark symmetry, not true 3D head-pose
  estimation — it deliberately requires several seconds of sustained
  turning before it fires, to avoid flagging a normal quick glance away)
- **Unusual/loud noise** — sustained loud volume picked up by the
  microphone (a local volume-level check only; **no audio is ever
  recorded, stored, or transmitted** — only the resulting event flag is
  sent, the same as any other proctoring signal)

Face detection runs entirely offline using a small bundled model
(TinyFaceDetector + a lightweight facial-landmark model, both shipped in
`public/models/` and loaded from the local server — no cloud AI API is
ever contacted). It's honest to say up front: reliable gaze/eye-direction
tracking is a genuinely hard problem even for well-funded commercial
proctoring tools, so this heuristic favors fewer false positives over
catching every possible instance of "not quite looking at the screen."

When any signal (behavioral or AI) triggers, three things happen at once:
the student sees a warning toast, the assigned invigilator is notified
live on their dashboard, and the event is written to the `activity_logs`
table for the Incident Report described below.

---

## 7. Incident Reports

The **Incident Reports** page (admin sidebar, and an **⚠ Incidents**
button on the invigilator's monitoring screen for exams assigned to them)
turns the raw activity log into something reviewable: a per-student
summary (total flagged events + a breakdown by type) followed by the full
chronological timeline for the exam. Export to **CSV** or a printable
**PDF** directly from that page.

---

## 8. Surveillance recordings (review after the exam)

Every student's webcam is **recorded automatically** for the whole exam —
independent of whether an invigilator was watching live — so nothing is
missed if an invigilator doesn't catch something in the moment.

- **Where it happens:** recording runs entirely in the student's own
  browser (low resolution, ~150kbps, no audio) and uploads small ~15-second
  chunks to the server as the exam progresses over plain HTTP — not through
  the live WebRTC connection, and not buffered as one giant file in the
  browser. This is what keeps it lightweight even with a full exam hall
  recording at once: the server does zero video processing, it just
  appends each chunk straight to a file on disk.
- **Where it's stored:** on the **server PC** (the computer running
  `npm start`), under `storage/recordings/<exam_id>/<submission_id>.webm`.
  It is **not** saved to anyone's browser Downloads folder automatically —
  browsers can't write arbitrary files like that. If you want a personal
  copy, use the **Download** button in the review screen described below.
- **Reviewing recordings:** Administrators go to **Recordings** in the
  sidebar, pick an exam, and can **Play**, **Download**, or **Delete** any
  student's recording. Invigilators see a **🎥 Recordings** button on the
  monitoring screen for exams assigned to them (view/play only, no delete).
- **If a chunk fails to upload** (e.g. brief network hiccup), it's dropped
  rather than retried indefinitely — this is spot-check surveillance, not a
  legal evidentiary recording, so losing a few seconds occasionally is an
  acceptable trade-off for not letting a struggling connection pile up work
  and slow down the student's exam.

### Managing disk space

Recordings are **not** included in database backups (they're plain files,
not database rows) and can add up over many exams. Rough sizing at the
default settings: roughly **1MB per student per minute** of exam time — so
a 100-student, 60-minute exam is on the order of a few GB. The Recordings
page shows total storage used, and you can delete old recordings from
there once they're no longer needed. If you need more headroom, either
free up disk space on the server PC or move the `storage/recordings`
folder to a larger drive and point `RECORDINGS_DIR` in `.env` at it.

---

## 9. Backups

From **Admin → Backup & Restore** you can create a full database snapshot at
any time, download previous backups, or restore from a backup file. Because
SQLite needs an exclusive file handle, a **restore requires restarting the
server** (`npm start` again) — the app will tell you when this is needed.

---

## 10. Project structure

```
emdms/
├── server.js              # Entry point (Express + Socket.IO)
├── database/               # SQLite schema, connection, and backups
├── models/                 # Data-access layer (one file per entity)
├── controllers/             # Request handlers / business logic
├── routes/                  # Express route definitions
├── middleware/               # Auth, file upload, error handling
├── services/                 # CSV, PDF, backup, credential helpers
├── sockets/                  # Socket.IO real-time + WebRTC signaling
├── public/                   # Frontend (HTML/CSS/vanilla JS)
│   ├── admin/                 # Administrator portal
│   ├── invigilator/            # Invigilator portal
│   ├── student/                 # Student portal + exam-taking page
│   ├── css/  js/  uploads/
│   └── models/                 # Locally-hosted face detection models (offline AI proctoring)
└── storage/recordings/        # Per-student surveillance video (not under public/)
```

---

## 11. Notes for production use

- This system is intended for LAN use in a controlled exam venue. The
  `.env` file contains a `JWT_SECRET` — replace it with a long random value
  before real deployment.
- WebRTC here uses no STUN/TURN server, by design — it relies on all
  devices being on the same local network segment. If your network uses
  client isolation (common on guest Wi-Fi), peer-to-peer video may not
  connect; use a dedicated exam-hall network instead.
