// Camera -> hand landmarks, on this computer (no logic: gestures live in models/handGesture.js).
// MediaPipe's hand landmarker (WASM + a local model in assets/hands/) is only loaded the first time it
// is turned on. The camera is opened for video only and released when it is turned off.
// Up to two hands (two-hand zoom, spec/003-hand-gestures.md); each frame also says when it was analysed
// and whether MediaPipe runs on the GPU or the CPU, so the view model can measure the frame rate.
const MODEL_URL = new URL('../assets/hands/hand_landmarker.task', import.meta.url).href;
const FRAME_MS = 33; // ~30 detections per second at most, whatever the camera's rate
const MAX_HANDS = 2;

let landmarkerPromise = null;
let currentHands = MAX_HANDS; // what the loaded landmarker looks for
function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    // The WASM files sit next to the bundle (node_modules in the app, vendor/ in the web build)
    const wasm = new URL('./wasm', import.meta.resolve('@mediapipe/tasks-vision')).href;
    const fileset = await FilesetResolver.forVisionTasks(wasm);
    const options = (delegate) => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: 'VIDEO', numHands: MAX_HANDS });
    return HandLandmarker.createFromOptions(fileset, options('GPU'))
      .then((landmarker) => ({ landmarker, delegate: 'GPU' }))
      .catch(() => HandLandmarker.createFromOptions(fileset, options('CPU')).then((landmarker) => ({ landmarker, delegate: 'CPU' })));
  })();
  landmarkerPromise.catch(() => { landmarkerPromise = null; }); // a failed load can be retried
  return landmarkerPromise;
}

export function createHandTrackingService() {
  // The camera image, for the small preview (the view mirrors it)
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  let stream = null;
  let run = 0;
  let frameRequest = null;

  function stopCamera() {
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
    frameRequest = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }

  return {
    video,

    // onHands([landmarks, …], { now, delegate }) for every analysed frame (an empty list: no hand). Rejects
    // with the camera's DOMException (NotAllowedError, NotFoundError…) or a loading error.
    async start(onHands) {
      const mine = ++run;
      const camera = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      if (mine !== run) { camera.getTracks().forEach((track) => track.stop()); return; }
      stream = camera;
      video.srcObject = camera;
      await video.play();
      const { landmarker, delegate } = await loadLandmarker();
      if (mine !== run) return;
      if (currentHands !== MAX_HANDS) { // a previous run lowered it (slow CPU): each run tries two hands again
        currentHands = MAX_HANDS;
        await landmarker.setOptions({ numHands: MAX_HANDS }).catch(() => {});
      }

      let last = 0;
      const tick = (now) => {
        if (mine !== run) return;
        frameRequest = requestAnimationFrame(tick);
        if (now - last < FRAME_MS || video.readyState < 2) return;
        last = now;
        const result = landmarker.detectForVideo(video, now);
        onHands(result.landmarks ?? [], { now, delegate });
      };
      frameRequest = requestAnimationFrame(tick);
    },

    stop() {
      run++;
      stopCamera();
    },

    // Fewer hands to look for (the CPU is too slow for two): less work per frame
    async setMaxHands(n) {
      const loaded = await landmarkerPromise?.catch(() => null);
      if (!loaded || currentHands === n) return;
      currentHands = n;
      await loaded.landmarker.setOptions({ numHands: n }).catch(() => {});
    },
  };
}
