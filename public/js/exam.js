/* global EmdmsApi, EmdmsUI, io, window, document */
(function () {
  const { toast, escapeHtml, qsa } = EmdmsUI;
  const root = document.getElementById('root');
  const user = JSON.parse(localStorage.getItem('emdms_user') || '{}');

  if (!EmdmsApi.getToken()) { window.location.href = '/student/login.html'; return; }

  const params = new URLSearchParams(window.location.search);
  const examId = params.get('exam');
  if (!examId) { root.innerHTML = '<div class="error-banner">No exam specified.</div>'; return; }

  const TAB_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Deliberately low-resolution / low-framerate: this is surveillance
  // footage for spot-checking, not a video call. Keeping the source stream
  // small is what lets a full exam hall record and (optionally) live-stream
  // simultaneously without choking student laptops or the server.
  const CAMERA_CONSTRAINTS = {
    video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 8, max: 10 } },
  };
  const RECORDING_BITS_PER_SECOND = 150000; // ~150kbps
  const RECORDING_CHUNK_MS = 15000; // upload a new chunk every 15s

  /**
   * Requests camera + microphone together (needed for local AI noise
   * monitoring), falling back to camera-only if the combined request is
   * denied — some browsers reject the whole call if either permission is
   * refused. The microphone audio itself is never recorded or transmitted;
   * see ai-proctor.js — only a local volume-level check runs against it.
   */
  async function acquireMedia() {
    try {
      return await navigator.mediaDevices.getUserMedia({ ...CAMERA_CONSTRAINTS, audio: true });
    } catch (err) {
      try {
        return await navigator.mediaDevices.getUserMedia({ ...CAMERA_CONSTRAINTS, audio: false });
      } catch (err2) {
        return null;
      }
    }
  }

  /** Returns a video-only clone of a stream, used for recording/live-streaming so audio is never captured or transmitted. */
  function videoOnly(stream) {
    return new MediaStream(stream.getVideoTracks());
  }

  const state = {
    submissionId: null,
    exam: null,
    questions: [],
    answers: {}, // question_id -> { option_id, marked }
    order: [],
    currentIndex: 0,
    secondsRemaining: 0,
    timerHandle: null,
    heartbeatHandle: null,
    socket: null,
    localStream: null,
    videoOnlyStream: null,
    submitted: false,
    mediaRecorder: null,
    chunkQueue: [],
    uploadingChunk: false,
    chunkSeq: 0,
  };

  window.addEventListener('emdms:unauthorized', () => window.location.href = '/student/login.html');

  // ============ Entry point: decide instructions vs. direct resume ============
  async function init() {
    try {
      const { data: exams } = await EmdmsApi.get('/api/student/exams');
      const examMeta = exams.find((e) => String(e.id) === String(examId));
      if (!examMeta) { root.innerHTML = '<div class="error-banner">This exam is not available to you.</div>'; return; }
      if (examMeta.submission_status === 'in_progress') {
        await beginExam(); // resume directly, timer already running server-side
      } else if (examMeta.submission_status === 'not_started') {
        renderInstructions(examMeta);
      } else {
        root.innerHTML = `<div class="center-screen"><div class="card auth-card"><h1>Already submitted</h1><p>You have already completed this examination. Duplicate submissions are not allowed.</p><a class="btn btn-primary btn-block" href="/student/dashboard.html">Back to dashboard</a></div></div>`;
      }
    } catch (err) {
      root.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderInstructions(examMeta) {
    root.innerHTML = `
      <div class="center-screen">
        <div class="card" style="max-width:560px;width:100%;">
          <h1>${escapeHtml(examMeta.title)}</h1>
          <p>Duration: <b>${examMeta.duration_minutes} minutes</b> &middot; Pass mark: <b>${examMeta.pass_mark}%</b></p>
          <div class="section" style="background:var(--paper-alt);">
            <h3 style="font-size:14px;">Instructions</h3>
            <ul style="margin:0;padding-left:18px;color:var(--ink-soft);font-size:13.5px;line-height:1.7;">
              <li>This exam must be taken in full-screen mode. Exiting full screen will be logged.</li>
              <li>Copy, paste, right-click and text selection are disabled during the exam.</li>
              <li>Opening the exam in a second tab or window is not allowed.</li>
              <li>Your webcam will be shared with your invigilator and recorded for the duration of the exam.</li>
              <li>Your camera and microphone are monitored locally in your browser for face visibility and unusual noise — audio itself is never recorded or transmitted, only alert flags are sent if something looks off.</li>
              <li>The exam auto-submits when the timer reaches zero. Answers are saved automatically as you go.</li>
              <li>Once submitted, you cannot re-enter this examination.</li>
            </ul>
          </div>
          <div id="camera-status" style="margin:14px 0;font-size:13px;color:var(--ink-faint);">Camera &amp; microphone permission has not been granted yet.</div>
          <div id="instr-error"></div>
          <button class="btn btn-outline btn-block" id="camera-btn" style="margin-bottom:10px;">Accept Camera &amp; Microphone Permission</button>
          <button class="btn btn-primary btn-block" id="begin-btn" disabled>Begin Exam</button>
        </div>
      </div>`;

    document.getElementById('camera-btn').addEventListener('click', async () => {
      state.localStream = await acquireMedia();
      if (state.localStream) {
        document.getElementById('local-webcam').srcObject = state.localStream;
        const hasAudio = state.localStream.getAudioTracks().length > 0;
        document.getElementById('camera-status').innerHTML = hasAudio
          ? '<span style="color:var(--green);">&#10003; Camera and microphone connected.</span>'
          : '<span style="color:var(--green);">&#10003; Camera connected</span> <span style="color:var(--ink-faint);">(microphone unavailable — noise monitoring disabled)</span>';
        document.getElementById('begin-btn').disabled = false;
      } else {
        document.getElementById('instr-error').innerHTML = `<div class="error-banner">Camera permission was denied. Your invigilator will be notified that no webcam feed is available. You may still proceed.</div>`;
        document.getElementById('begin-btn').disabled = false;
      }
    });
    document.getElementById('begin-btn').addEventListener('click', beginExam);
  }

  // ============ Start / resume the exam ============
  async function beginExam() {
    if (localStorage.getItem(`emdms_lock_${examId}`)) {
      const lock = JSON.parse(localStorage.getItem(`emdms_lock_${examId}`));
      if (lock.tabId !== TAB_ID && Date.now() - lock.ts < 8000) {
        root.innerHTML = `<div class="center-screen"><div class="card auth-card"><h1>Already open</h1><p>This exam is already open in another tab or window. Please close it before continuing here.</p></div></div>`;
        return;
      }
    }
    startTabLock();

    root.innerHTML = '<div class="loading">Starting your examination&hellip;</div>';
    let res;
    try {
      res = await EmdmsApi.post(`/api/exam-session/${examId}/start`);
    } catch (err) {
      root.innerHTML = `<div class="center-screen"><div class="card auth-card"><h1>Cannot start exam</h1><p>${escapeHtml(err.message)}</p><a class="btn btn-primary btn-block" href="/student/dashboard.html">Back to dashboard</a></div></div>`;
      return;
    }
    const d = res.data;
    state.submissionId = d.submission_id;
    state.exam = d.exam;
    state.questions = d.questions;
    state.order = d.questions.map((q) => q.id);
    state.answers = d.answers || {};
    state.secondsRemaining = d.seconds_remaining;

    document.body.classList.add('exam-active');
    enterFullscreen();
    connectSocket();
    renderExamShell();
    startTimer();
    startHeartbeat();
    attachAntiCheatListeners();
    if (!state.localStream) {
      state.localStream = await acquireMedia();
    }
    if (state.localStream) {
      state.videoOnlyStream = videoOnly(state.localStream);
      document.getElementById('local-webcam').srcObject = state.videoOnlyStream;
    }
    initWebRTC();
    startRecording();
    startAIProctoring();
  }

  function startTabLock() {
    const write = () => localStorage.setItem(`emdms_lock_${examId}`, JSON.stringify({ tabId: TAB_ID, ts: Date.now() }));
    write();
    setInterval(write, 3000);
    window.addEventListener('storage', (e) => {
      if (e.key === `emdms_lock_${examId}` && e.newValue) {
        const lock = JSON.parse(e.newValue);
        if (lock.tabId !== TAB_ID && Date.now() - lock.ts < 3500) {
          toast('This exam was opened in another tab. Please use only one tab.', 'danger', 8000);
        }
      }
    });
  }

  // ============ Rendering ============
  function renderExamShell() {
    root.innerHTML = `
      <div class="exam-shell">
        <div class="exam-topbar">
          <div class="exam-topbar-row">
            <div class="exam-title-block"><b>${escapeHtml(state.exam.title)}</b><span> &middot; ${escapeHtml(user.reg_number || '')}</span></div>
            <div style="display:flex;align-items:center;gap:14px;">
              <button class="btn btn-outline btn-sm" id="mark-btn"><i class="fa-regular fa-flag"></i> Mark for Review</button>
              <div class="exam-timer" id="timer"><i class="fa-regular fa-clock"></i> --:--</div>
            </div>
          </div>
          <div class="exam-progress-pct" id="progress-pct">0%</div>
          <div class="exam-progress-track"><span id="progress-fill" style="width:0%;"></span></div>
        </div>
        <div class="exam-body">
          <div class="question-panel" id="question-panel"></div>
          <div class="nav-panel">
            <button class="btn btn-primary btn-block" id="submit-btn"><i class="fa-solid fa-paper-plane"></i> Submit Exam</button>
            <div class="legend">
              <span><i style="background:var(--green);"></i>Answered</span>
              <span><i style="background:var(--amber);"></i>Marked for review</span>
              <span><i style="background:#fff;border:1px solid var(--border);"></i>Not answered</span>
            </div>
            <div class="qgrid" id="qgrid"></div>
          </div>
        </div>
        <div class="exam-footer">
          <button class="btn btn-outline" id="prev-btn"><i class="fa-solid fa-arrow-left"></i> Previous</button>
          <button class="btn btn-gold" id="next-btn">Next <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>`;
    document.getElementById('prev-btn').addEventListener('click', () => goTo(state.currentIndex - 1));
    document.getElementById('next-btn').addEventListener('click', () => goTo(state.currentIndex + 1));
    document.getElementById('mark-btn').addEventListener('click', toggleMark);
    document.getElementById('submit-btn').addEventListener('click', confirmSubmit);
    renderQuestion();
    renderGrid();
  }

  function renderQuestion() {
    const q = state.questions[state.currentIndex];
    const answer = state.answers[q.id] || {};
    document.getElementById('question-panel').innerHTML = `
      <div class="question-card">
        <div class="qnum">Question ${state.currentIndex + 1} of ${state.questions.length} &middot; ${q.marks} mark(s)</div>
        <div class="qtext">${escapeHtml(q.question_text)}</div>
        <div id="options">${q.options.map((o) => `
          <label class="option-item ${answer.option_id === o.id ? 'selected' : ''}" data-opt="${o.id}">
            <input type="radio" name="opt" value="${o.id}" ${answer.option_id === o.id ? 'checked' : ''}/>
            <span>${escapeHtml(o.option_text)}</span>
          </label>`).join('')}</div>
      </div>`;
    qsa('.option-item').forEach((label) => label.addEventListener('click', () => selectOption(q.id, Number(label.dataset.opt))));
    document.getElementById('prev-btn').disabled = state.currentIndex === 0;
    document.getElementById('next-btn').disabled = state.currentIndex === state.questions.length - 1;
    const markBtn = document.getElementById('mark-btn');
    markBtn.innerHTML = answer.marked ? '<i class="fa-solid fa-flag"></i> Unmark Review' : '<i class="fa-regular fa-flag"></i> Mark for Review';
    const pct = Math.round(((state.currentIndex + 1) / state.questions.length) * 100);
    const pctEl = document.getElementById('progress-pct');
    const fillEl = document.getElementById('progress-fill');
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (fillEl) fillEl.style.width = `${pct}%`;
  }

  function renderGrid() {
    const grid = document.getElementById('qgrid');
    grid.innerHTML = state.questions.map((q, i) => {
      const a = state.answers[q.id] || {};
      let cls = '';
      if (a.marked) cls = 'review';
      else if (a.option_id) cls = 'answered';
      if (i === state.currentIndex) cls += ' current';
      return `<button class="${cls.trim()}" data-goto="${i}">${i + 1}</button>`;
    }).join('');
    qsa('[data-goto]', grid).forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.goto))));
  }

  function goTo(index) {
    if (index < 0 || index >= state.questions.length) return;
    state.currentIndex = index;
    renderQuestion();
    renderGrid();
  }

  // ============ Answering ============
  async function selectOption(questionId, optionId) {
    const prev = state.answers[questionId] || {};
    state.answers[questionId] = { option_id: optionId, marked: prev.marked || false };
    renderQuestion();
    renderGrid();
    await persistAnswer(questionId);
  }

  async function toggleMark() {
    const q = state.questions[state.currentIndex];
    const prev = state.answers[q.id] || {};
    state.answers[q.id] = { option_id: prev.option_id || null, marked: !prev.marked };
    renderQuestion();
    renderGrid();
    await persistAnswer(q.id);
  }

  async function persistAnswer(questionId) {
    const a = state.answers[questionId];
    try {
      const res = await EmdmsApi.post(`/api/exam-session/${state.submissionId}/answer`, {
        question_id: questionId, option_id: a.option_id, marked_for_review: !!a.marked,
      });
      state.secondsRemaining = res.seconds_remaining;
      if (state.socket) {
        state.socket.emit('student:progress', {
          exam_id: state.exam.id, submission_id: state.submissionId,
          answered_count: res.answered_count, seconds_remaining: res.seconds_remaining,
        });
      }
    } catch (err) {
      if (err.status === 409) handleForcedEnd(err.message);
      else toast(`Could not save answer: ${err.message}. Retrying...`, 'warn');
    }
  }

  // ============ Timer & heartbeat (handles disconnect/reconnect) ============
  function startTimer() {
    updateTimerDisplay();
    state.timerHandle = setInterval(() => {
      state.secondsRemaining = Math.max(0, state.secondsRemaining - 1);
      updateTimerDisplay();
      if (state.secondsRemaining <= 0) autoSubmit();
    }, 1000);
  }

  function updateTimerDisplay() {
    const el = document.getElementById('timer');
    if (!el) return;
    const m = Math.floor(state.secondsRemaining / 60).toString().padStart(2, '0');
    const s = Math.floor(state.secondsRemaining % 60).toString().padStart(2, '0');
    el.innerHTML = `<i class="fa-regular fa-clock"></i> ${m}:${s}`;
    el.classList.toggle('low', state.secondsRemaining <= 60);
  }

  function startHeartbeat() {
    let offlineNotified = false;
    state.heartbeatHandle = setInterval(async () => {
      try {
        const res = await EmdmsApi.post(`/api/exam-session/${state.submissionId}/heartbeat`, {}, { silent401: true });
        if (offlineNotified) { toast('Connection restored. Resuming exam.'); offlineNotified = false; }
        state.secondsRemaining = res.seconds_remaining;
        if (res.status !== 'in_progress') handleForcedEnd('This exam has been submitted.');
      } catch (err) {
        if (!offlineNotified) {
          toast('Connection to the server was lost. Attempting to reconnect...', 'warn', 8000);
          offlineNotified = true;
        }
      }
    }, 10000);
  }

  async function autoSubmit() {
    if (state.submitted) return;
    state.submitted = true;
    clearInterval(state.timerHandle);
    try { await EmdmsApi.post(`/api/exam-session/${state.submissionId}/submit`); } catch (e) { /* server may have already auto-submitted */ }
    finish('Time is up - your exam has been submitted automatically.');
  }

  function confirmSubmit() {
    const unanswered = state.questions.filter((q) => !(state.answers[q.id] || {}).option_id).length;
    const msg = unanswered > 0
      ? `You have ${unanswered} unanswered question(s). Are you sure you want to submit your exam? This cannot be undone.`
      : 'Are you sure you want to submit your exam? This cannot be undone.';
    if (confirm(msg)) doSubmit();
  }

  async function doSubmit() {
    if (state.submitted) return;
    state.submitted = true;
    clearInterval(state.timerHandle);
    try {
      const res = await EmdmsApi.post(`/api/exam-session/${state.submissionId}/submit`);
      finish('Your exam has been submitted successfully.', res.data);
    } catch (err) {
      state.submitted = false;
      toast(err.message, 'danger');
    }
  }

  function handleForcedEnd(message) {
    if (state.submitted) return;
    state.submitted = true;
    clearInterval(state.timerHandle);
    finish(message);
  }

  function finish(message, result) {
    clearInterval(state.heartbeatHandle);
    clearInterval(state.timerHandle);
    document.body.classList.remove('exam-active');
    localStorage.removeItem(`emdms_lock_${examId}`);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

    // Tell the invigilator dashboard this student is done BEFORE tearing down
    // the connection, so it can clean up its peer connection and video tile
    // instead of being left with a frozen last frame.
    if (state.socket && state.socket.connected) {
      state.socket.emit('student:finished', { exam_id: state.exam.id, submission_id: state.submissionId });
    }
    // Close the WebRTC connection explicitly so the invigilator's peer
    // connection sees a clean close/track-ended event rather than just
    // going silent (which is what caused the frozen video).
    if (state.pc) {
      try { state.pc.close(); } catch (e) { /* already closed */ }
      state.pc = null;
    }
    // Stop the recorder/stream/socket in the correct order in the
    // background — this doesn't need to block the "Exam Complete" screen
    // from appearing immediately below.
    finalizeRecordingAndStream();

    root.innerHTML = `
      <div class="center-screen"><div class="card auth-card">
        <h1>Exam Complete</h1>
        <p>${escapeHtml(message)}</p>
        ${result ? `<div class="section" style="background:var(--paper-alt);"><p><b>Score:</b> ${result.score}/${result.total_marks} (${Number(result.percentage).toFixed(1)}%)</p><p><b>Result:</b> ${result.passed ? '<span style="color:var(--green);">PASS</span>' : '<span style="color:var(--stamp);">FAIL</span>'}</p></div>` : ''}
        <a class="btn btn-primary btn-block" href="/student/dashboard.html">Back to dashboard</a>
      </div></div>`;
  }

  // ============ Anti-cheating ============
  function attachAntiCheatListeners() {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('copy', (e) => { e.preventDefault(); logSuspiciousThrottled('copy_attempt'); });
    document.addEventListener('cut', (e) => { e.preventDefault(); logSuspiciousThrottled('cut_attempt'); });
    document.addEventListener('paste', (e) => { e.preventDefault(); logSuspiciousThrottled('paste_attempt'); });
    document.addEventListener('selectstart', (e) => e.preventDefault());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !state.submitted) logSuspicious('tab_switch');
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && !state.submitted) {
        logSuspicious('fullscreen_exit');
        toast('Please return to full-screen mode to continue your exam.', 'danger', 6000);
      }
    });

    window.addEventListener('beforeunload', (e) => {
      if (state.submitted) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  function enterFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }

  const lastLoggedAt = {};
  function logSuspiciousThrottled(eventType, minGapMs = 3000) {
    const now = Date.now();
    if (lastLoggedAt[eventType] && now - lastLoggedAt[eventType] < minGapMs) return;
    lastLoggedAt[eventType] = now;
    logSuspicious(eventType);
  }

  function logSuspicious(eventType, details) {
    if (state.socket) {
      state.socket.emit('student:suspicious_event', {
        exam_id: state.exam.id, submission_id: state.submissionId, event_type: eventType, details,
      });
    }
    EmdmsApi.post(`/api/exam-session/${state.submissionId}/log`, { event_type: eventType, details }).catch(() => {});
  }

  // ============ Socket + WebRTC ============
  function connectSocket() {
    state.socket = io({ auth: { token: EmdmsApi.getToken() } });
    state.socket.on('connect', () => {
      state.socket.emit('student:join_exam', { exam_id: state.exam.id, submission_id: state.submissionId });
    });
    state.socket.on('student:warning', ({ message }) => toast(`Invigilator: ${message}`, 'warn', 8000));
    state.socket.on('student:locked_by_invigilator', () => {
      toast('Your account has been locked by your invigilator.', 'danger', 8000);
    });
    state.socket.on('student:force_submitted', () => {
      if (!state.submitted) { handleForcedEnd('Your invigilator has ended your exam.'); }
    });
    state.socket.on('webrtc:stream_requested', () => sendOffer());
    state.socket.on('webrtc:signal_from_invigilator', async ({ signal }) => {
      if (!state.pc) return;
      if (signal.type === 'answer') {
        await state.pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.type === 'candidate' && signal.candidate) {
        try { await state.pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch (e) { /* ignore */ }
      }
    });
  }

  function initWebRTC() {
    if (state.socket) {
      state.socket.emit('student:webcam_status', {
        exam_id: state.exam.id, submission_id: state.submissionId, connected: !!state.localStream,
      });
    }
    // NOTE: no eager sendOffer() here — the live WebRTC view is now only
    // negotiated on-demand when an invigilator actually opens it (see
    // 'webrtc:stream_requested' above). With a large cohort, creating a
    // peer connection for every single student at login regardless of
    // whether anyone is watching was wasted overhead; the recording below
    // is what guarantees every student is captured regardless.
  }

  // ============ Surveillance recording (independent of live WebRTC view) ============
  // Runs for every student automatically, whether or not an invigilator is
  // watching live. Chunks are small (~15s of low-bitrate video, no audio)
  // and uploaded over plain HTTP as they're produced — never buffered as a
  // single large file in the browser — so long exams don't bloat the tab's
  // memory, and a crash/close mid-exam only loses the last few seconds.
  const MAX_QUEUED_CHUNKS = 3; // if uploads fall behind, drop the oldest rather than growing unbounded

  function startRecording() {
    if (!state.videoOnlyStream || !window.MediaRecorder) return;
    const candidates = ['video/webm;codecs=vp8', 'video/webm'];
    const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    try {
      state.mediaRecorder = new MediaRecorder(state.videoOnlyStream, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: RECORDING_BITS_PER_SECOND,
      });
    } catch (err) {
      console.warn('Recording unavailable on this browser:', err.message);
      return;
    }
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) enqueueChunk(event.data);
    };
    state.mediaRecorder.start(RECORDING_CHUNK_MS);
  }

  function enqueueChunk(blob) {
    state.chunkQueue.push(blob);
    if (state.chunkQueue.length > MAX_QUEUED_CHUNKS) {
      state.chunkQueue.splice(0, state.chunkQueue.length - MAX_QUEUED_CHUNKS); // drop oldest, keep most recent
    }
    processChunkQueue();
  }

  async function processChunkQueue() {
    if (state.uploadingChunk || !state.chunkQueue.length) return;
    state.uploadingChunk = true;
    const blob = state.chunkQueue.shift();
    const seq = state.chunkSeq++;
    try {
      const fd = new FormData();
      fd.append('chunk', blob, `chunk-${seq}.webm`);
      await EmdmsApi.post(`/api/exam-session/${state.submissionId}/recording-chunk`, fd, { silent401: true });
    } catch (err) {
      // A dropped chunk is an acceptable trade-off here — this is
      // spot-check surveillance, not a legal evidentiary recording — and
      // retrying indefinitely under poor network conditions is exactly the
      // kind of unbounded work that could bog down a student's tab.
    } finally {
      state.uploadingChunk = false;
      processChunkQueue();
    }
  }

  async function finalizeRecordingAndStream() {
    // Stop the recorder first and give it a moment to flush its final
    // chunk — stopping the camera track immediately after calling
    // mediaRecorder.stop() can cut the last chunk off in some browsers, so
    // we deliberately wait before tearing the track down.
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      try { state.mediaRecorder.stop(); } catch (e) { /* already stopped */ }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await processChunkQueue();
    if (state.submissionId) {
      EmdmsApi.post(`/api/exam-session/${state.submissionId}/recording-finish`, {}, { silent401: true }).catch(() => {});
    }
    if (window.EmdmsAIProctor) EmdmsAIProctor.stop();
    if (state.videoOnlyStream) {
      state.videoOnlyStream.getTracks().forEach((t) => t.stop());
      state.videoOnlyStream = null;
    }
    if (state.localStream) {
      state.localStream.getTracks().forEach((t) => t.stop());
      state.localStream = null;
    }
    if (state.socket) state.socket.disconnect();
  }

  async function sendOffer() {
    if (!state.videoOnlyStream) return;
    state.pc = new RTCPeerConnection({ iceServers: [] });
    // Only the video track is sent live — audio is never streamed to the
    // invigilator, only analyzed locally for the AI noise-detection signal.
    state.videoOnlyStream.getTracks().forEach((track) => state.pc.addTrack(track, state.videoOnlyStream));
    state.pc.onicecandidate = (event) => {
      if (event.candidate) {
        state.socket.emit('webrtc:signal', {
          exam_id: state.exam.id, submission_id: state.submissionId,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };
    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);
    state.socket.emit('webrtc:signal', { exam_id: state.exam.id, submission_id: state.submissionId, signal: state.pc.localDescription });
  }

  // ============ AI proctoring integration ============
  const AI_EVENT_MESSAGES = {
    no_face: "We can't see your face — please stay in view of the camera.",
    multiple_faces: 'Multiple faces detected — only you should be visible during the exam.',
    head_turned_away: 'Please keep facing your screen during the exam.',
    unusual_noise: 'Unusual noise detected — please keep your environment quiet.',
    identity_mismatch: 'We could not verify your identity against your enrollment photo.',
    suspicious_object: 'An unauthorized object (e.g. phone or book) was detected in view.',
  };

  function startAIProctoring() {
    if (!window.EmdmsAIProctor || !state.localStream) return;
    const videoEl = document.getElementById('local-webcam');
    let referencePhotoUrl = null;
    try {
      const user = JSON.parse(localStorage.getItem('emdms_user') || 'null');
      referencePhotoUrl = user && user.passport_path;
    } catch (e) { /* no enrollment photo on file — identity check simply won't run */ }
    EmdmsAIProctor.start({
      videoElement: videoEl,
      stream: state.localStream, // includes audio track (if granted) for local noise monitoring only
      referencePhotoUrl,
      onEvent: (eventType, details) => {
        const message = AI_EVENT_MESSAGES[eventType] || 'Unusual activity detected.';
        toast(message, 'warn', 6000);
        logSuspicious(eventType, details);
      },
    }).catch(() => {});
  }

  init();
})();
