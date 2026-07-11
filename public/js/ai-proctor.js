/* global faceapi, window */
(function () {
  const MODEL_BASE = '/models';
  const DETECT_INTERVAL_MS = 2500;
  const AUDIO_CHECK_INTERVAL_MS = 500;

  // How many consecutive detection ticks a condition must persist before we
  // treat it as a real event rather than a brief camera glitch or a normal
  // quick glance away. multiple_faces fires fast (it's unambiguous and
  // serious); head_turned_away requires sustained persistence since a quick
  // glance shouldn't be flagged.
  const PERSIST_CHECKS_REQUIRED = { no_face: 2, multiple_faces: 1, head_turned_away: 3 };
  // Minimum time between repeated firings of the same event type, so a
  // condition that persists for minutes doesn't flood the log/socket.
  const COOLDOWN_MS = { no_face: 20000, multiple_faces: 20000, head_turned_away: 25000, unusual_noise: 15000 };

  // Empirical thresholds — tuned conservatively to favor fewer false
  // positives over catching every possible edge case. These are heuristics,
  // not true 3D head-pose estimation or a trained audio classifier.
  const HEAD_TURN_OFFSET_RATIO = 0.22; // nose-tip horizontal offset vs. jaw width
  const LOUD_NOISE_RMS_THRESHOLD = 0.28;
  const LOUD_NOISE_STREAK_REQUIRED = 4; // ~2s sustained at 500ms interval

  let modelsLoaded = false;
  let running = false;
  let videoEl = null;
  let onEvent = null;
  let detectTimer = null;
  let audioTimer = null;
  let audioCtx = null;
  let analyser = null;
  let audioData = null;

  const consecutive = { no_face: 0, multiple_faces: 0, head_turned_away: 0 };
  const lastFired = {};

  async function loadModels() {
    if (modelsLoaded) return;
    await faceapi.nets.tinyFaceDetector.loadFromUri(`${MODEL_BASE}/tiny_face_detector`);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(`${MODEL_BASE}/face_landmark_68_tiny`);
    modelsLoaded = true;
  }

  function canFire(type) {
    const now = Date.now();
    return !lastFired[type] || (now - lastFired[type]) > COOLDOWN_MS[type];
  }

  function fire(type, details) {
    lastFired[type] = Date.now();
    if (onEvent) onEvent(type, details);
  }

  /**
   * Heuristic "looking away" check: compares the nose tip's horizontal
   * position against the midpoint of the jawline, normalized by face width.
   * A centered face gives a near-zero offset; a face turned well to one
   * side pushes the nose tip noticeably off-center. This is a proxy for
   * yaw, not a calibrated pose estimate — it deliberately requires several
   * consecutive detections before firing to avoid flagging brief glances.
   */
  function isHeadTurnedAway(landmarks) {
    const points = landmarks.positions;
    const jawLeft = points[0];
    const jawRight = points[16];
    const noseTip = points[30];
    const faceWidth = Math.hypot(jawRight.x - jawLeft.x, jawRight.y - jawLeft.y);
    if (faceWidth < 1) return false;
    const midX = (jawLeft.x + jawRight.x) / 2;
    const offset = Math.abs(noseTip.x - midX) / faceWidth;
    return offset > HEAD_TURN_OFFSET_RATIO;
  }

  async function detectTick() {
    if (!running || !videoEl || videoEl.readyState < 2) return;
    try {
      const detections = await faceapi
        .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true);

      const count = detections.length;

      if (count === 0) {
        consecutive.no_face += 1;
        consecutive.multiple_faces = 0;
        consecutive.head_turned_away = 0;
        if (consecutive.no_face >= PERSIST_CHECKS_REQUIRED.no_face && canFire('no_face')) {
          fire('no_face', { message: 'No face detected in camera frame' });
        }
      } else if (count > 1) {
        consecutive.multiple_faces += 1;
        consecutive.no_face = 0;
        consecutive.head_turned_away = 0;
        if (consecutive.multiple_faces >= PERSIST_CHECKS_REQUIRED.multiple_faces && canFire('multiple_faces')) {
          fire('multiple_faces', { message: `${count} faces detected in camera frame`, count });
        }
      } else {
        consecutive.no_face = 0;
        consecutive.multiple_faces = 0;
        const landmarks = detections[0].landmarks;
        if (landmarks && isHeadTurnedAway(landmarks)) {
          consecutive.head_turned_away += 1;
          if (consecutive.head_turned_away >= PERSIST_CHECKS_REQUIRED.head_turned_away && canFire('head_turned_away')) {
            fire('head_turned_away', { message: 'Head turned away from screen for an extended period' });
          }
        } else {
          consecutive.head_turned_away = 0;
        }
      }
    } catch (err) {
      // A failed inference tick should never take down exam monitoring.
      console.warn('[AI Proctor] detection tick failed:', err.message);
    }
  }

  // ---------------- Audio: local volume-level monitoring only ----------------
  // Audio is analyzed entirely in the browser (RMS volume level) purely to
  // detect sustained loud noise. The raw audio itself is never recorded,
  // stored, or transmitted anywhere — only the resulting "unusual_noise"
  // event flag is sent, same as any other proctoring signal.
  function startAudioMonitoring(stream) {
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return; // microphone permission wasn't granted — skip silently

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioData = new Uint8Array(analyser.frequencyBinCount);
    } catch (err) {
      console.warn('[AI Proctor] audio monitoring unavailable:', err.message);
      return;
    }

    let loudStreak = 0;
    audioTimer = setInterval(() => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(audioData);
      let sumSquares = 0;
      for (let i = 0; i < audioData.length; i += 1) {
        const v = (audioData[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / audioData.length);
      if (rms > LOUD_NOISE_RMS_THRESHOLD) {
        loudStreak += 1;
        if (loudStreak >= LOUD_NOISE_STREAK_REQUIRED && canFire('unusual_noise')) {
          fire('unusual_noise', { message: 'Unusual/loud noise detected', level: Number(rms.toFixed(3)) });
        }
      } else {
        loudStreak = 0;
      }
    }, AUDIO_CHECK_INTERVAL_MS);
  }

  function stopAudioMonitoring() {
    if (audioTimer) clearInterval(audioTimer);
    audioTimer = null;
    if (audioCtx) {
      try { audioCtx.close(); } catch (e) { /* already closed */ }
    }
    audioCtx = null;
    analyser = null;
  }

  /**
   * Starts AI proctoring against a live <video> element already showing the
   * student's camera feed. `stream` should include the audio track (if
   * available) for noise monitoring — video-only streams simply skip that
   * part. Returns true if monitoring started, false if the models failed
   * to load (e.g. unsupported browser) — the exam should continue normally
   * either way, just without AI signals.
   */
  async function start({ videoElement, stream, onEvent: cb }) {
    videoEl = videoElement;
    onEvent = cb;
    running = true;
    try {
      await loadModels();
    } catch (err) {
      console.warn('[AI Proctor] models failed to load — continuing without AI monitoring:', err.message);
      running = false;
      return false;
    }
    detectTimer = setInterval(detectTick, DETECT_INTERVAL_MS);
    if (stream) startAudioMonitoring(stream);
    return true;
  }

  function stop() {
    running = false;
    if (detectTimer) clearInterval(detectTimer);
    detectTimer = null;
    stopAudioMonitoring();
  }

  window.EmdmsAIProctor = { start, stop };
})();
