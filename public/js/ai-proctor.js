/* global faceapi, tf, cocoSsd, window */
(function () {
  const MODEL_BASE = '/models';
  const DETECT_INTERVAL_MS = 2500;
  const IDENTITY_CHECK_INTERVAL_MS = 10000; // face recognition is heavier — check less often
  const OBJECT_CHECK_INTERVAL_MS = 4000;
  const AUDIO_CHECK_INTERVAL_MS = 500;

  const PERSIST_CHECKS_REQUIRED = { no_face: 2, multiple_faces: 1, head_turned_away: 3 };
  const COOLDOWN_MS = {
    no_face: 20000, multiple_faces: 20000, head_turned_away: 25000, unusual_noise: 15000,
    identity_mismatch: 30000, suspicious_object: 15000,
  };

  const HEAD_TURN_OFFSET_RATIO = 0.22;
  const LOUD_NOISE_RMS_THRESHOLD = 0.28;
  const LOUD_NOISE_STREAK_REQUIRED = 4;
  const FACE_MATCH_DISTANCE_THRESHOLD = 0.55;
  const IDENTITY_MISMATCH_STREAK_REQUIRED = 2;

  // TinyFaceDetector at a larger input size + lower confidence threshold.
  // The original bug wasn't the detector itself — it's fast and reliable —
  // it was that it ran at inputSize 160 with scoreThreshold 0.5, which is
  // too small/strict to reliably pick up a second, smaller, or off-center
  // face. Bumping these fixes multi-face detection without introducing a
  // heavier model.
  function detectorOptions() {
    return new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
  }

  // COCO-SSD class names that are legitimate reasons for concern during an
  // exam. "laptop"/"tv"/"keyboard"/"mouse" are deliberately excluded since
  // the student's own exam device would constantly trigger them.
  const SUSPICIOUS_OBJECT_CLASSES = new Set(['cell phone', 'book', 'remote']);
  const OBJECT_SCORE_THRESHOLD = 0.6;

  let modelsLoaded = false;
  let objectModel = null;
  let running = false;
  let videoEl = null;
  let onEvent = null;
  let detectTimer = null;
  let identityTimer = null;
  let objectTimer = null;
  let audioTimer = null;
  let audioCtx = null;
  let analyser = null;
  let audioData = null;
  let referenceDescriptor = null;

  const consecutive = { no_face: 0, multiple_faces: 0, head_turned_away: 0, identity_mismatch: 0 };
  const lastFired = {};

  async function loadModels() {
    if (modelsLoaded) return;
    await faceapi.nets.tinyFaceDetector.loadFromUri(`${MODEL_BASE}/tiny_face_detector`);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(`${MODEL_BASE}/face_landmark_68_tiny`);
    await faceapi.nets.faceRecognitionNet.loadFromUri(`${MODEL_BASE}/face_recognition`);
    modelsLoaded = true;
    console.log('[AI Proctor] face detection models loaded successfully.');
  }

  // Object detection model loads independently of the face models — if the
  // weight files described in scripts/download-coco-ssd-model.js haven't
  // been downloaded/committed yet, we simply skip object detection rather
  // than fail the whole proctoring session.
  async function loadObjectModel() {
    if (objectModel || typeof cocoSsd === 'undefined') return;
    try {
      objectModel = await cocoSsd.load({ modelUrl: `${MODEL_BASE}/coco-ssd/model.json` });
      console.log('[AI Proctor] object detection model loaded successfully.');
    } catch (err) {
      console.warn('[AI Proctor] object detection model unavailable (run scripts/download-coco-ssd-model.js):', err.message);
      objectModel = null;
    }
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
        .detectAllFaces(videoEl, detectorOptions())
        .withFaceLandmarks(true);

      const count = detections.length;
      console.debug(`[AI Proctor] tick: ${count} face(s) detected`);

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
      console.warn('[AI Proctor] detection tick failed:', err.message);
    }
  }

  // ---------------- Identity verification ----------------
  // Compares the live camera feed against the student's own enrollment
  // (passport) photo using face-api.js's recognition descriptors — a
  // 128-dimensional vector unique to a person's face geometry. This never
  // leaves the device: the comparison runs entirely in the browser.
  async function computeReferenceDescriptor(imageUrl) {
    if (!imageUrl) return null;
    try {
      const img = await faceapi.fetchImage(imageUrl);
      const result = await faceapi
        .detectSingleFace(img, detectorOptions())
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      return result ? result.descriptor : null;
    } catch (err) {
      console.warn('[AI Proctor] could not compute reference descriptor from enrollment photo:', err.message);
      return null;
    }
  }

  async function identityTick() {
    if (!running || !referenceDescriptor || !videoEl || videoEl.readyState < 2) return;
    try {
      const result = await faceapi
        .detectSingleFace(videoEl, detectorOptions())
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      if (!result) return; // no_face is already handled by detectTick — don't double-report here
      const distance = faceapi.euclideanDistance(referenceDescriptor, result.descriptor);
      if (distance > FACE_MATCH_DISTANCE_THRESHOLD) {
        consecutive.identity_mismatch += 1;
        if (consecutive.identity_mismatch >= IDENTITY_MISMATCH_STREAK_REQUIRED && canFire('identity_mismatch')) {
          fire('identity_mismatch', {
            message: 'The person on camera does not match the enrollment photo on file',
            distance: Number(distance.toFixed(3)),
          });
        }
      } else {
        consecutive.identity_mismatch = 0;
      }
    } catch (err) {
      console.warn('[AI Proctor] identity check failed:', err.message);
    }
  }

  // ---------------- Object detection (phones, books, etc.) ----------------
  async function objectTick() {
    if (!running || !objectModel || !videoEl || videoEl.readyState < 2) return;
    try {
      const predictions = await objectModel.detect(videoEl, 10, OBJECT_SCORE_THRESHOLD);
      const hit = predictions.find((p) => SUSPICIOUS_OBJECT_CLASSES.has(p.class));
      if (hit && canFire('suspicious_object')) {
        fire('suspicious_object', {
          message: `A ${hit.class} was detected in the camera frame`,
          object: hit.class,
          confidence: Number(hit.score.toFixed(3)),
        });
      }
    } catch (err) {
      console.warn('[AI Proctor] object detection tick failed:', err.message);
    }
  }

  // ---------------- Audio: local volume-level monitoring only ----------------
  function startAudioMonitoring(stream) {
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

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
   * student's camera feed.
   *  - `stream` should include the audio track (if available) for noise
   *    monitoring — video-only streams simply skip that part.
   *  - `referencePhotoUrl` (optional) is the student's enrollment/passport
   *    photo. If provided, a reference face descriptor is computed once at
   *    start-up and the live feed is periodically checked against it to
   *    catch a different person sitting the exam.
   * Returns true if face monitoring started, false if the models failed to
   * load — the exam should continue normally either way, just without AI
   * signals. Object detection and identity verification degrade
   * independently and never block the exam.
   */
  async function start({ videoElement, stream, referencePhotoUrl, onEvent: cb }) {
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

    if (referencePhotoUrl) {
      computeReferenceDescriptor(referencePhotoUrl).then((descriptor) => {
        referenceDescriptor = descriptor;
        if (descriptor && running) identityTimer = setInterval(identityTick, IDENTITY_CHECK_INTERVAL_MS);
      });
    }

    loadObjectModel().then(() => {
      if (objectModel && running) objectTimer = setInterval(objectTick, OBJECT_CHECK_INTERVAL_MS);
    });

    return true;
  }

  function stop() {
    running = false;
    if (detectTimer) clearInterval(detectTimer);
    if (identityTimer) clearInterval(identityTimer);
    if (objectTimer) clearInterval(objectTimer);
    detectTimer = null; identityTimer = null; objectTimer = null;
    referenceDescriptor = null;
    consecutive.identity_mismatch = 0;
    stopAudioMonitoring();
  }

  window.EmdmsAIProctor = { start, stop };
})();
