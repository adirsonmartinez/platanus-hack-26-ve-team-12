// Zoom and rotate buttons (bottom left)
const ZOOM_STEP = 1.3;

// onReset: "center view" (the map goes back to its initial view; other views reset the camera)
export function createControlsView({ cameraViewModel: camera, onReset = () => camera.reset() }) {
  const on = (id, handler) => document.getElementById(id).addEventListener('click', handler);
  on('zoom-in', () => camera.zoomBy(ZOOM_STEP));
  on('zoom-out', () => camera.zoomBy(1 / ZOOM_STEP));
  on('rotate-left', () => camera.rotateQuarter(1));
  on('rotate-right', () => camera.rotateQuarter(-1));
  on('reset-view', () => onReset());
}
