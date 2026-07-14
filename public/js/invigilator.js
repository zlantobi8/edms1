/* global EmdmsApi, EmdmsUI, io, window, document */
(function () {
  const { toast, escapeHtml, fmtDateTime, qs, qsa } = EmdmsUI;
  const content = document.getElementById('content');
  const pageTitle = document.getElementById('page-title');
  const searchBox = document.getElementById('search-box');
  const user = JSON.parse(localStorage.getItem('emdms_user') || '{}');

  if (!EmdmsApi.getToken()) window.location.replace('/invigilator/login.html');
  document.getElementById('inv-name').textContent = user.full_name || 'Invigilator';
  window.addEventListener('emdms:unauthorized', () => window.location.replace('/invigilator/login.html'));
  async function doLogout() {
    await EmdmsApi.post('/api/auth/logout').catch(() => {});
    socket.disconnect();
    EmdmsApi.clearAll();
    window.location.replace('/');
  }
  document.getElementById('logout-btn').addEventListener('click', doLogout);
  document.getElementById('topbar-logout-btn').addEventListener('click', doLogout);

  const socket = io({ auth: { token: EmdmsApi.getToken() } });
  let currentExamId = null;
  const submissionRows = new Map(); // submission_id -> row data
  const peerConnections = new Map(); // submission_id -> RTCPeerConnection

  const RTC_CONFIG = { iceServers: [] }; // LAN-only: no STUN/TURN needed on the same network segment.

  socket.on('connect_error', (err) => toast(`Connection issue: ${err.message}`, 'warn'));

  // ---------------- Exam list ----------------
  async function loadExamList() {
    const { data: exams } = await EmdmsApi.get('/api/invigilator/exams');
    const nav = document.getElementById('exam-nav');
    if (!exams.length) {
      nav.innerHTML = '<div style="padding:14px;color:#9aa4b5;font-size:12.5px;">No examinations have been assigned to you yet.</div>';
      return;
    }
    nav.innerHTML = exams.map((e) => `<a href="#" data-exam="${e.id}"><i class="fa-solid fa-file-pen"></i><span class="nav-text"><b>${escapeHtml(e.title)}</b><small>${e.exam_date} · ${e.start_time}</small></span></a>`).join('');
    qsa('[data-exam]', nav).forEach((a) => a.addEventListener('click', (ev) => {
      ev.preventDefault();
      qsa('a', nav).forEach((x) => x.classList.remove('active'));
      a.classList.add('active');
      watchExam(Number(a.dataset.exam), exams.find((e) => e.id === Number(a.dataset.exam)));
    }));
  }

  const recordingsBtn = document.getElementById('recordings-btn');
  recordingsBtn.addEventListener('click', () => openRecordingsListModal());
  const incidentsBtn = document.getElementById('incidents-btn');
  incidentsBtn.addEventListener('click', () => openIncidentsModal());

  async function watchExam(examId, examMeta) {
    currentExamId = examId;
    pageTitle.textContent = examMeta ? examMeta.title : 'Monitoring';
    searchBox.style.display = 'block';
    searchBox.value = '';
    recordingsBtn.style.display = 'inline-flex';
    incidentsBtn.style.display = 'inline-flex';
    peerConnections.forEach((pc) => pc.close());
    peerConnections.clear();
    socket.emit('invigilator:watch_exam', { exam_id: examId });

    const { data: students } = await EmdmsApi.get(`/api/invigilator/exams/${examId}/monitor`);
    submissionRows.clear();
    students.forEach((s) => submissionRows.set(s.id, s));
    renderGrid();
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  }

  const HIGH_SEVERITY_EVENTS = new Set(['no_face', 'multiple_faces', 'unusual_noise', 'fullscreen_exit', 'identity_mismatch', 'suspicious_object']);

  async function openIncidentsModal() {
    if (!currentExamId) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal" style="max-width:720px;">
      <div class="toolbar" style="margin-bottom:10px;">
        <h3 style="margin:0;">Incident Report</h3>
        <div class="spacer"></div>
        <a class="btn btn-outline btn-sm" href="/api/incidents/exam/${currentExamId}/export/csv?token=${EmdmsApi.getToken()}" target="_blank">Export CSV</a>
        <a class="btn btn-outline btn-sm" href="/api/incidents/exam/${currentExamId}/export/pdf?token=${EmdmsApi.getToken()}" target="_blank">Export PDF</a>
      </div>
      <div id="inc-modal-body"><div class="loading">Loading…</div></div>
      <div class="modal-actions"><button class="btn btn-outline" id="close-inc-list">Close</button></div></div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#close-inc-list').addEventListener('click', () => backdrop.remove());

    try {
      const { data } = await EmdmsApi.get(`/api/incidents/exam/${currentExamId}`);
      const { summary, timeline, labels } = data;
      backdrop.querySelector('#inc-modal-body').innerHTML = `
        <div class="table-wrap" style="margin-bottom:14px;"><table><thead><tr><th>Student</th><th>Total</th><th>Breakdown</th></tr></thead><tbody>
          ${summary.map((s) => `<tr>
            <td>${escapeHtml(s.full_name || '(unknown)')} <span class="mono" style="color:var(--ink-faint);">(${escapeHtml(s.reg_number || '-')})</span></td>
            <td><span class="badge ${s.total_events >= 5 ? 'badge-red' : 'badge-amber'}">${s.total_events}</span></td>
            <td style="font-size:12px;">${Object.entries(s.by_type).map(([type, count]) => `<span class="badge ${HIGH_SEVERITY_EVENTS.has(type) ? 'badge-red' : 'badge-gray'}" style="margin:0 4px 4px 0;">${escapeHtml(labels[type] || type)} × ${count}</span>`).join('')}</td>
          </tr>`).join('') || '<tr><td colspan="3">No incidents flagged for this examination.</td></tr>'}
        </tbody></table></div>
        <div class="table-wrap"><table><thead><tr><th>Time</th><th>Student</th><th>Event</th></tr></thead><tbody>
          ${timeline.slice(0, 50).map((t) => `<tr>
            <td>${fmtDateTime(t.created_at)}</td><td>${escapeHtml(t.full_name || '(unknown)')}</td><td>${escapeHtml(labels[t.event_type] || t.event_type)}</td>
          </tr>`).join('') || '<tr><td colspan="3">No events recorded.</td></tr>'}
        </tbody></table></div>`;
    } catch (err) {
      backdrop.querySelector('#inc-modal-body').innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    }
  }

  async function openRecordingsListModal() {
    if (!currentExamId) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal" style="max-width:640px;"><h3>Recordings</h3><div id="rec-modal-body"><div class="loading">Loading…</div></div>
      <div class="modal-actions"><button class="btn btn-outline" id="close-rec-list">Close</button></div></div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#close-rec-list').addEventListener('click', () => backdrop.remove());

    try {
      const { data: recs } = await EmdmsApi.get(`/api/recordings/exam/${currentExamId}`);
      backdrop.querySelector('#rec-modal-body').innerHTML = `
        <div class="table-wrap"><table><thead><tr><th>Student</th><th>Status</th><th>Size</th><th></th></tr></thead><tbody>
          ${recs.map((r) => `<tr>
            <td>${escapeHtml(r.full_name)} <span class="mono" style="color:var(--ink-faint);">(${escapeHtml(r.reg_number)})</span></td>
            <td>${r.status === 'completed' ? '<span class="badge badge-green">Completed</span>' : '<span class="badge badge-amber">Recording…</span>'}</td>
            <td>${formatBytes(r.total_bytes)}</td>
            <td><button class="btn btn-outline btn-sm" data-play-rec="${r.id}" data-name="${escapeHtml(r.full_name)}">▶ Play</button></td>
          </tr>`).join('') || '<tr><td colspan="4">No recordings for this examination yet.</td></tr>'}
        </tbody></table></div>`;
      qsa('[data-play-rec]', backdrop).forEach((b) => b.addEventListener('click', () => openPlayerModal(b.dataset.playRec, b.dataset.name)));
    } catch (err) {
      backdrop.querySelector('#rec-modal-body').innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    }
  }

  function openPlayerModal(recordingId, studentName) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="max-width:640px;">
        <h3>${escapeHtml(studentName)} — Recording</h3>
        <video controls style="width:100%;border-radius:6px;background:#000;" src="/api/recordings/${recordingId}/stream?token=${EmdmsApi.getToken()}"></video>
        <div class="modal-actions"><button class="btn btn-primary" id="close-player">Close</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#close-player').addEventListener('click', () => backdrop.remove());
  }

  function renderGrid() {
    const term = searchBox.value.trim().toLowerCase();
    const rows = [...submissionRows.values()].filter((s) => !term || s.full_name.toLowerCase().includes(term) || s.reg_number.toLowerCase().includes(term));
    if (!rows.length) {
      content.innerHTML = '<div class="empty-state">No students match this exam yet. The grid will populate as students log in.</div>';
      return;
    }
    content.innerHTML = `<div class="monitor-grid">${rows.map(tileHtml).join('')}</div>`;
    rows.forEach((s) => {
      const video = document.getElementById(`video-${s.id}`);
      if (video && peerConnections.has(s.id)) {
        const pc = peerConnections.get(s.id);
        if (pc._stream) video.srcObject = pc._stream;
      }
    });
    qsa('[data-request-stream]').forEach((b) => b.addEventListener('click', () => requestStream(Number(b.dataset.requestStream))));
    qsa('[data-warn]').forEach((b) => b.addEventListener('click', () => sendWarning(Number(b.dataset.warn))));
    qsa('[data-lock]').forEach((b) => b.addEventListener('click', () => lockStudent(b.dataset.lock)));
    qsa('[data-force-submit]').forEach((b) => b.addEventListener('click', () => forceSubmit(Number(b.dataset.forceSubmit))));
    qsa('[data-fullscreen]').forEach((b) => b.addEventListener('click', () => {
      const v = document.getElementById(`video-${b.dataset.fullscreen}`);
      if (v && v.requestFullscreen) v.requestFullscreen();
    }));
  }

  function tileHtml(s) {
    const statusDot = s.is_online ? 'dot-online' : 'dot-offline';
    const finishedStatuses = ['submitted', 'auto_submitted', 'force_submitted'];
    const progressBadge = s.status === 'in_progress'
      ? `<span class="badge badge-green">In progress</span>`
      : finishedStatuses.includes(s.status)
        ? `<span class="badge badge-gray">${escapeHtml(s.status.replace(/_/g, ' '))}</span>`
        : `<span class="badge badge-amber">${escapeHtml(String(s.status || 'unknown').replace(/_/g, ' '))}</span>`;
    const isFinished = finishedStatuses.includes(s.status);
    return `<div class="monitor-tile" id="tile-${s.id}">
      <video id="video-${s.id}" autoplay playsinline muted></video>
      <div class="no-feed" id="nofeed-${s.id}">${isFinished ? 'Exam completed' : (s.webcam_connected ? 'Connecting…' : 'No camera feed')}</div>
      <div class="tile-actions">
        <button data-request-stream="${s.id}" title="Request stream" ${isFinished ? 'disabled' : ''}>Feed</button>
        <button data-fullscreen="${s.id}" title="Full screen">Expand</button>
      </div>
      <div class="overlay">
        <b><span class="status-dot ${statusDot}"></span>${escapeHtml(s.full_name)}</b>
        <span class="mono">${escapeHtml(s.reg_number)}</span> · ${progressBadge}
        <div class="toolbar" style="margin-top:6px;gap:4px;">
          <button class="btn btn-outline btn-sm" data-warn="${s.id}" style="color:#fff;border-color:#666;" ${isFinished ? 'disabled' : ''}>Warn</button>
          <button class="btn btn-outline btn-sm" data-lock="${s.student_id}" style="color:#fff;border-color:#666;">Lock</button>
          <button class="btn btn-danger btn-sm" data-force-submit="${s.id}" ${isFinished ? 'disabled' : ''}>End</button>
        </div>
      </div>
    </div>`;
  }

  function requestStream(submissionId) {
    socket.emit('invigilator:request_stream', { submission_id: submissionId });
    toast('Requested webcam stream…');
  }

  function sendWarning(submissionId) {
    const message = prompt('Warning message to send to the student:', 'Please remain focused on your screen.');
    if (!message) return;
    socket.emit('invigilator:send_warning', { exam_id: currentExamId, submission_id: submissionId, message });
    toast('Warning sent.');
  }

  async function lockStudent(studentId) {
    if (!confirm('Lock this student\'s account? They will be unable to log back in until unlocked by an administrator.')) return;
    await EmdmsApi.post(`/api/invigilator/students/${studentId}/lock`, { exam_id: currentExamId });
    toast('Student account locked.');
  }

  async function forceSubmit(submissionId) {
    if (!confirm('Force-submit this student\'s exam now? This cannot be undone.')) return;
    await EmdmsApi.post(`/api/invigilator/submissions/${submissionId}/force-submit`);
    toast('Exam force-submitted.');
    const row = submissionRows.get(submissionId);
    if (row) row.status = 'force_submitted';
    teardownPeerConnection(submissionId, true);
    renderGrid();
  }

  searchBox.addEventListener('input', renderGrid);

  function teardownPeerConnection(submissionId, finished) {
    const pc = peerConnections.get(submissionId);
    if (pc) {
      try { pc.close(); } catch (e) { /* already closed */ }
      peerConnections.delete(submissionId);
    }
    const video = document.getElementById(`video-${submissionId}`);
    if (video) video.srcObject = null;
    const nofeed = document.getElementById(`nofeed-${submissionId}`);
    if (nofeed) {
      nofeed.style.display = 'flex';
      nofeed.textContent = finished ? 'Exam completed' : 'No camera feed';
    }
  }

  async function refreshMonitorList() {
    if (!currentExamId) return;
    try {
      const { data: students } = await EmdmsApi.get(`/api/invigilator/exams/${currentExamId}/monitor`);
      students.forEach((s) => submissionRows.set(s.id, s));
      renderGrid();
    } catch (e) { /* transient — next poll or event will correct it */ }
  }

  // ---------------- Live socket updates ----------------
  socket.on('invigilator:student_status', ({ submission_id, is_online, event }) => {
    const row = submissionRows.get(submission_id);
    if (!row) {
      // A submission we don't have locally yet — most likely a student who just started
      // the exam after our last roster fetch. Pull the authoritative list instead of
      // silently dropping the event, so they show up immediately without a page refresh.
      refreshMonitorList();
      if (event === 'login') toast('A student has joined the exam.');
      return;
    }
    row.is_online = is_online;

    if (event === 'finished') {
      teardownPeerConnection(submission_id, true);
      toast(`${row.full_name} has finished their exam.`);
      refreshMonitorList(); // pull the authoritative status (submitted/auto/force) and final progress
    } else if (event === 'disconnected') {
      teardownPeerConnection(submission_id, false);
      toast(`${row.full_name} lost connection.`, 'warn');
      renderGrid();
    } else {
      renderGrid();
    }
  });
  socket.on('invigilator:progress_update', ({ submission_id, seconds_remaining }) => {
    const row = submissionRows.get(submission_id);
    if (row) row.time_remaining_seconds = seconds_remaining;
  });
  socket.on('invigilator:webcam_status', ({ submission_id, connected }) => {
    const el = document.getElementById(`nofeed-${submission_id}`);
    if (el) el.textContent = connected ? 'Connecting…' : 'No camera feed';
  });
  socket.on('invigilator:suspicious_event', ({ submission_id, event_type }) => {
    const row = submissionRows.get(submission_id);
    const name = row ? row.full_name : `Submission #${submission_id}`;
    toast(`${name}: ${event_type.replace(/_/g, ' ')}`, 'warn');
  });

  // ---------------- WebRTC (receive-only, one connection per student) ----------------
  socket.on('webrtc:signal_from_student', async ({ submission_id, signal }) => {
    let pc = peerConnections.get(submission_id);
    if (!pc) pc = createPeerConnection(submission_id);

    if (signal.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc:signal_to_student', { submission_id, signal: pc.localDescription });
    } else if (signal.type === 'candidate' && signal.candidate) {
      try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch (e) { /* ignore late candidates */ }
    }
  });

  function createPeerConnection(submissionId) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.ontrack = (event) => {
      pc._stream = event.streams[0];
      const video = document.getElementById(`video-${submissionId}`);
      const nofeed = document.getElementById(`nofeed-${submissionId}`);
      if (video) { video.srcObject = event.streams[0]; }
      if (nofeed) nofeed.style.display = 'none';
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:signal_to_student', { submission_id: submissionId, signal: { type: 'candidate', candidate: event.candidate } });
      }
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        const nofeed = document.getElementById(`nofeed-${submissionId}`);
        if (nofeed) { nofeed.style.display = 'flex'; nofeed.textContent = 'No camera feed'; }
      }
    };
    peerConnections.set(submissionId, pc);
    return pc;
  }

  loadExamList();
})();
