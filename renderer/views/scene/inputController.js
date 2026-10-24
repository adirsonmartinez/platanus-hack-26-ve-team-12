// Mouse and keyboard on the map. Left drag: pan (the grabbed ground point stays under the cursor).
// Right or middle drag, or Shift + drag: orbit (sideways rotates, up/down tilts).
// Wheel / pinch: zoom toward the cursor. Arrows or WASD: pan. Q / E: quarter turns. Click: pick.
// G switches between the map and the git view; Esc closes whatever is open in the active view.
// grabber(): something of the scene that is dragged itself instead of the map (the robot):
//   { hit(x, y), hover(on), start(x, y), move(x, y), end(x, y) } in screen pixels, or null
const CLICK_TOLERANCE_PX = 6;
const ROTATE_SPEED = 0.008;
const TILT_SPEED = 0.005;
const KEY_PAN = 2.5;

// picker(): the active view's { targets: Object3D[], handle(pick) }, or null when nothing is clickable
export function createInputController({ sceneView, cameraViewModel: camera, picker, onEscape, onToggleView, onHover = () => {}, grabber = () => null }) {
  const canvas = sceneView.canvas;
  let grabPoint = null;
  let rotatingFrom = null; // { x, y }
  let downAt = null;
  let holding = null; // the grabber while the person drags it
  let over = null;    // the grabber under the cursor (hover)
  const setOver = (g) => { if (over !== g) { over?.hover(false); over = g; g?.hover(true); } };

  const pickAt = (x, y) => {
    const active = picker();
    return active ? sceneView.pickAt(x, y, active.targets) : null;
  };

  canvas.addEventListener('pointerdown', (e) => {
    const g = e.button === 0 && !e.shiftKey ? grabber() : null;
    if (g?.hit(e.clientX, e.clientY)) {
      holding = g;
      g.start(e.clientX, e.clientY);
      onHover(null);
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('grabbing');
      return;
    }
    downAt = { x: e.clientX, y: e.clientY, button: e.button };
    camera.cancelFlight(); // dragging cancels any animated camera flight
    if (e.button !== 0 || e.shiftKey) rotatingFrom = { x: e.clientX, y: e.clientY };
    else grabPoint = sceneView.groundPointAt(e.clientX, e.clientY);
    onHover(null);
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointermove', (e) => {
    if (holding) return void holding.move(e.clientX, e.clientY);
    if (rotatingFrom) {
      camera.rotateBy(-(e.clientX - rotatingFrom.x) * ROTATE_SPEED);
      camera.tiltBy((e.clientY - rotatingFrom.y) * TILT_SPEED);
      rotatingFrom = { x: e.clientX, y: e.clientY };
      sceneView.syncCamera();
      return;
    }
    if (!grabPoint) {
      const g = e.pointerType === 'mouse' ? grabber() : null;
      const onGrabber = Boolean(g?.hit(e.clientX, e.clientY));
      setOver(onGrabber ? g : null);
      const pick = !onGrabber && e.pointerType === 'mouse' ? pickAt(e.clientX, e.clientY) : null;
      canvas.style.cursor = onGrabber ? 'grab' : pick ? 'pointer' : '';
      onHover(pick, e.clientX, e.clientY);
      return;
    }
    const now = sceneView.groundPointAt(e.clientX, e.clientY);
    if (!now) return;
    camera.panBy(grabPoint.x - now.x, grabPoint.z - now.z);
    sceneView.syncCamera();
  });

  function endDrag(e) {
    grabPoint = null;
    rotatingFrom = null;
    canvas.classList.remove('dragging');
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  }

  canvas.addEventListener('pointerup', (e) => {
    if (holding) {
      holding.end(e.clientX, e.clientY);
      holding = null;
      canvas.classList.remove('grabbing');
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      return;
    }
    const wasClick = downAt && downAt.button === 0 && !e.shiftKey &&
      Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < CLICK_TOLERANCE_PX;
    downAt = null;
    endDrag(e);
    if (!wasClick) return;
    const pick = pickAt(e.clientX, e.clientY);
    if (pick) picker()?.handle(pick);
  });
  canvas.addEventListener('pointercancel', (e) => {
    if (holding) { const { x, y } = holding.last ?? { x: e.clientX, y: e.clientY }; holding.end(x, y); holding = null; canvas.classList.remove('grabbing'); }
    endDrag(e);
  });
  canvas.addEventListener('pointerleave', () => { onHover(null); setOver(null); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = sceneView.groundPointAt(e.clientX, e.clientY);
    camera.setZoomNow(camera.zoom * Math.exp(-e.deltaY * 0.001));
    sceneView.syncCamera();
    const after = sceneView.groundPointAt(e.clientX, e.clientY);
    if (before && after) camera.panBy(before.x - after.x, before.z - after.z);
    sceneView.syncCamera();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return onEscape();
    if (e.target.closest?.('input, textarea')) return; // no shortcuts while typing in the chat
    const key = e.key.toLowerCase();
    if (key === 'g') onToggleView();
    if (key === 'q') camera.rotateQuarter(1);
    if (key === 'e') camera.rotateQuarter(-1);
    // Pan relative to the screen: "up" moves away from the camera
    const move = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[key];
    if (move && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const az = camera.azimuth, [right, back] = move;
      const step = KEY_PAN / camera.zoom;
      camera.panBy((Math.cos(az) * right + Math.sin(az) * back) * step, (-Math.sin(az) * right + Math.cos(az) * back) * step);
      sceneView.syncCamera();
    }
  });
}
