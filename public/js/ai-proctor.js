/* global faceapi, window */
(function () {
  const MODEL_BASE = '/models';
  const WASM_BASE = '/js/mediapipe-wasm';
  const FACE_LANDMARKER_MODEL = `${MODEL_BASE}/mediapipe/face_landmarker.task`;
  const OBJECT_DETECTOR_MODEL = `${MODEL_BASE}/mediapipe/efficientdet_lite0.tflite`;

  // === SPEED: Check much more frequently ===
  const DETECT_INTERVAL_MS = 100;        // was 400 — now 10 checks/sec
  const OBJECT_CHECK_INTERVAL_MS = 500;  // was 1000
  const IDENTITY_CHECK_INTERVAL_MS = 5000; // was 10000
  const AUDIO_CHECK_INTERVAL_MS = 200;   // was 500

  // === SENSITIVITY: Lower persistence requirements ===
  const PERSIST_CHECKS_REQUIRED = {
    no_face: 2,           // was 3 — 200ms to alert
    multiple_faces: 1,    // was 2 — immediate alert
    head_turned_away: 2,  // was 4 — 200ms to alert
    eyes_away: 3,         // NEW — 300ms to alert
    identity_mismatch: 2, // unchanged
  };

  const COOLDOWN_MS = {
    no_face: 10000,        // was 20000
    multiple_faces: 10000, // was 20000
    head_turned_away: 15000, // was 25000
    eyes_away: 10000,      // NEW
    unusual_noise: 10000,  // was 15000
    identity_mismatch: 20000, // was 30000
    suspicious_object: 10000, // was 15000
  };

  // === STRICTER head pose thresholds ===
  const YAW_THRESHOLD_DEG = 15;   // was 28 — much tighter
  const PITCH_THRESHOLD_DEG = 12; // was 22 — much tighter

  // === NEW: Eye gaze / attention thresholds ===
  const EYE_GAZE_THRESHOLD = 0.15; // blendshape threshold for "looking away"
  const EYE_CLOSED_THRESHOLD = 0.6; // for detecting closed/squinted eyes

  const LOUD_NOISE_RMS_THRESHOLD = 0.22; // was 0.28 — more sensitive
  const LOUD_NOISE_STREAK_REQUIRED = 3;  // was 4
  const FACE_MATCH_DISTANCE_THRESHOLD = 0.55;
  const IDENTITY_MISMATCH_STREAK_REQUIRED = 2;
  const OBJECT_SCORE_THRESHOLD = 0.40; // was 0.45 — more sensitive

  const SUSPICIOUS_OBJECT_CLASSES = new Set(['cell phone', 'book', 'remote']);

  let running = false;
  let videoEl = null;
  let onEvent = null;

  let faceLandmarker = null;
  let objectDetector = null;
  let faceDetectTimer = null;
  let objectDetectTimer = null;
  let identityTimer = null;
  let audioTimer = null;
  let audioCtx = null;
  let analyser = null;
  let audioData = null;
  let referenceDescriptor = null;
  let recognitionModelLoaded = false;

  const consecutive = {
    no_face: 0,
    multiple_faces: 0,
    head_turned_away: 0,
    eyes_away: 0,      // NEW
    identity_mismatch: 0,
  };
  const lastFired = {};

  function canFire(type) {
    const now = Date.now();
    return !lastFired[type] || (now - lastFired[type]) > COOLDOWN_MS[type];
  }

  function fire(type, details) {
    lastFired[type] = Date.now();
    if (onEvent) onEvent(type, details);
  }

  // ---------------- MediaPipe: face count + head-pose + eye-gaze ----------------
  async function loadMediaPipeModels() {
    const { FaceLandmarker, ObjectDetector, FilesetResolver } = await import(`${WASM_BASE}/vision_bundle.mjs`);
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE);

    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 5,        // was 3 — detect more faces in frame
      outputFaceBlendshapes: true,  // was false — ENABLE eye/gaze tracking
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.4, // was 0.5 — more sensitive
    }).catch(async () => {
      console.warn('[AI Proctor] GPU delegate failed, falling back to CPU');
      return await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 5,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.4,
      });
    });
    console.log('[AI Proctor] MediaPipe face landmarker loaded.');

    try {
      objectDetector = await ObjectDetector.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: OBJECT_DETECTOR_MODEL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        scoreThreshold: OBJECT_SCORE_THRESHOLD,
        maxResults: 8, // was 5
      });
      console.log('[AI Proctor] MediaPipe object detector loaded.');
    } catch (err) {
      console.warn('[AI Proctor] object detector unavailable:', err.message);
      objectDetector = null;
    }
  }

  function yawPitchFromMatrix(matrix) {
    const m = matrix.data;
    const zx = m[2];
    const zy = m[6];
    const zz = m[10];
    const yaw = Math.atan2(zx, zz) * (180 / Math.PI);
    const pitch = Math.atan2(-zy, zz) * (180 / Math.PI);
    return { yaw, pitch };
  }

  // NEW: Extract eye gaze direction from blendshapes
  function getEyeGazeInfo(blendshapes) {
    if (!blendshapes || !blendshapes.categories) return null;
    const cats = blendshapes.categories;
    const getScore = (name) => {
      const cat = cats.find(c => c.categoryName === name);
      return cat ? cat.score : 0;
    };

    // MediaPipe blendshape names for eye gaze
    const lookLeft = getScore('eyeLookInLeft') + getScore('eyeLookOutRight');
    const lookRight = getScore('eyeLookInRight') + getScore('eyeLookOutLeft');
    const lookUp = getScore('eyeLookUpLeft') + getScore('eyeLookUpRight');
    const lookDown = getScore('eyeLookDownLeft') + getScore('eyeLookDownRight');
    const eyeBlinkLeft = getScore('eyeBlinkLeft');
    const eyeBlinkRight = getScore('eyeBlinkRight');

    const maxGaze = Math.max(lookLeft, lookRight, lookUp, lookDown);
    const eyesClosed = (eyeBlinkLeft + eyeBlinkRight) / 2 > EYE_CLOSED_THRESHOLD;

    return {
      lookingAway: maxGaze > EYE_GAZE_THRESHOLD,
      gazeDirection: maxGaze > EYE_GAZE_THRESHOLD
        ? (lookLeft > lookRight ? 'left' : lookRight > lookLeft ? 'right' : lookUp > lookDown ? 'up' : 'down')
        : 'center',
      eyesClosed,
      maxGaze,
    };
  }

  function faceDetectTick() {
    if (!running || !faceLandmarker || !videoEl || videoEl.readyState < 2) return;

    try {
      const result = faceLandmarker.detectForVideo(videoEl, performance.now());
      const count = result.faceLandmarks.length;

      if (count === 0) {
        consecutive.no_face += 1;
        consecutive.multiple_faces = 0;
        consecutive.head_turned_away = 0;
        consecutive.eyes_away = 0;
        if (consecutive.no_face >= PERSIST_CHECKS_REQUIRED.no_face && canFire('no_face')) {
          fire('no_face', { message: 'No face detected in camera frame' });
        }
      } else if (count > 1) {
        consecutive.multiple_faces += 1;
        consecutive.no_face = 0;
        consecutive.head_turned_away = 0;
        consecutive.eyes_away = 0;
        if (consecutive.multiple_faces >= PERSIST_CHECKS_REQUIRED.multiple_faces && canFire('multiple_faces')) {
          fire('multiple_faces', { message: `${count} faces detected in camera frame`, count });
        }
      } else {
        consecutive.no_face = 0;
        consecutive.multiple_faces = 0;

        // --- Head pose check ---
        const matrix = result.facialTransformationMatrixes[0];
        let headTurned = false;
        let yaw = 0, pitch = 0;

        if (matrix) {
          ({ yaw, pitch } = yawPitchFromMatrix(matrix));
          headTurned = Math.abs(yaw) > YAW_THRESHOLD_DEG || Math.abs(pitch) > PITCH_THRESHOLD_DEG;
        }

        // --- Eye gaze check (NEW) ---
        const blendshapes = result.faceBlendshapes[0];
        const gazeInfo = getEyeGazeInfo(blendshapes);
        const eyesNotFocused = gazeInfo ? (gazeInfo.lookingAway || gazeInfo.eyesClosed) : false;

        if (headTurned) {
          consecutive.head_turned_away += 1;
          if (consecutive.head_turned_away >= PERSIST_CHECKS_REQUIRED.head_turned_away && canFire('head_turned_away')) {
            fire('head_turned_away', {
              message: 'Head turned away from screen',
              yaw: Number(yaw.toFixed(1)),
              pitch: Number(pitch.toFixed(1)),
            });
          }
        } else {
          consecutive.head_turned_away = 0;
        }

        if (eyesNotFocused) {
          consecutive.eyes_away += 1;
          if (consecutive.eyes_away >= PERSIST_CHECKS_REQUIRED.eyes_away && canFire('eyes_away')) {
            fire('eyes_away', {
              message: gazeInfo.eyesClosed ? 'Eyes closed or looking down' : 'Eyes looking away from screen',
              gazeDirection: gazeInfo.gazeDirection,
              eyesClosed: gazeInfo.eyesClosed,
              confidence: Number(gazeInfo.maxGaze.toFixed(3)),
            });
          }
        } else {
          consecutive.eyes_away = 0;
        }
      }
    } catch (err) {
      console.warn('[AI Proctor] face detection tick failed:', err.message);
    }
  }

  function objectDetectTick() {
    if (!running || !objectDetector || !videoEl || videoEl.readyState < 2) return;
    try {
      const result = objectDetector.detectForVideo(videoEl, performance.now());
      const hits = result.detections.filter((d) => {
        const top = d.categories[0];
        return top && SUSPICIOUS_OBJECT_CLASSES.has(top.categoryName) && top.score >= OBJECT_SCORE_THRESHOLD;
      });
      // Fire for ALL detections, not just first
      hits.forEach((hit) => {
        if (canFire('suspicious_object')) {
          const top = hit.categories[0];
          fire('suspicious_object', {
            message: `A ${top.categoryName} was detected`,
            object: top.categoryName,
            confidence: Number(top.score.toFixed(3)),
          });
        }
      });
    } catch (err) {
      console.warn('[AI Proctor] object detection tick failed:', err.message);
    }
  }

  // ---------------- face-api.js: identity verification ----------------
  async function loadRecognitionModel() {
    if (recognitionModelLoaded) return;
    await faceapi.nets.tinyFaceDetector.loadFromUri(`${MODEL_BASE}/tiny_face_detector`);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(`${MODEL_BASE}/face_landmark_68_tiny`);
    await faceapi.nets.faceRecognitionNet.loadFromUri(`${MODEL_BASE}/face_recognition`);
    recognitionModelLoaded = true;
    console.log('[AI Proctor] identity verification model loaded.');
  }

  function identityDetectorOptions() {
    return new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
  }

  async function computeReferenceDescriptor(imageUrl) {
    if (!imageUrl) return null;
    try {
      const img = await faceapi.fetchImage(imageUrl);
      const result = await faceapi
        .detectSingleFace(img, identityDetectorOptions())
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      return result ? result.descriptor : null;
    } catch (err) {
      console.warn('[AI Proctor] could not compute reference descriptor:', err.message);
      return null;
    }
  }

  async function identityTick() {
    if (!running || !referenceDescriptor || !videoEl || videoEl.readyState < 2) return;
    try {
      const result = await faceapi
        .detectSingleFace(videoEl, identityDetectorOptions())
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      if (!result) return;
      const distance = faceapi.euclideanDistance(referenceDescriptor, result.descriptor);
      if (distance > FACE_MATCH_DISTANCE_THRESHOLD) {
        consecutive.identity_mismatch += 1;
        if (consecutive.identity_mismatch >= IDENTITY_MISMATCH_STREAK_REQUIRED && canFire('identity_mismatch')) {
          fire('identity_mismatch', {
            message: 'Person on camera does not match enrollment photo',
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

  // ---------------- Audio monitoring ----------------
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
      try { audioCtx.close(); } catch (e) { /* ignore */ }
    }
    audioCtx = null;
    analyser = null;
  }

  async function start({ videoElement, stream, referencePhotoUrl, onEvent: cb }) {
    videoEl = videoElement;
    onEvent = cb;
    running = true;

    try {
      await loadMediaPipeModels();
    } catch (err) {
      console.error('[AI Proctor] FATAL: MediaPipe models failed to load:', err.message);
      running = false;
      return false;
    }

    if (faceLandmarker) faceDetectTimer = setInterval(faceDetectTick, DETECT_INTERVAL_MS);
    if (objectDetector) objectDetectTimer = setInterval(objectDetectTick, OBJECT_CHECK_INTERVAL_MS);

    if (stream) startAudioMonitoring(stream);

    if (referencePhotoUrl) {
      loadRecognitionModel()
        .then(() => computeReferenceDescriptor(referencePhotoUrl))
        .then((descriptor) => {
          referenceDescriptor = descriptor;
          if (descriptor && running) identityTimer = setInterval(identityTick, IDENTITY_CHECK_INTERVAL_MS);
        })
        .catch((err) => console.warn('[AI Proctor] identity verification unavailable:', err.message));
    }

    return true;
  }

  function stop() {
    running = false;
    if (faceDetectTimer) clearInterval(faceDetectTimer);
    if (objectDetectTimer) clearInterval(objectDetectTimer);
    if (identityTimer) clearInterval(identityTimer);
    faceDetectTimer = null;
    objectDetectTimer = null;
    identityTimer = null;
    referenceDescriptor = null;

    // Reset ALL consecutive counters
    consecutive.no_face = 0;
    consecutive.multiple_faces = 0;
    consecutive.head_turned_away = 0;
    consecutive.eyes_away = 0;
    consecutive.identity_mismatch = 0;

    stopAudioMonitoring();
    if (faceLandmarker) { try { faceLandmarker.close(); } catch (e) { /* ignore */ } faceLandmarker = null; }
    if (objectDetector) { try { objectDetector.close(); } catch (e) { /* ignore */ } objectDetector = null; }

    videoEl = null;
    onEvent = null;
  }

  window.EmdmsAIProctor = { start, stop };
})();