// Camera state (no three.js here): where it looks, how it is rotated and zoomed.
// Actions set goals; step(dt) eases the current values toward them every frame.
import { clamp } from '../core/format.js';

export const CAMERA = {
  // The map's tree runs down-right from the integrations at the top left; the folders face the camera
  azimuth: 0,
  gitAzimuth: Math.PI / 4, // the git view keeps its diagonal lanes
  elevation: (44 * Math.PI) / 180, // low enough that the folders show their fronts
  distance: 60,
  viewHeight: 30,
  zoomMin: 0.4,
  zoomMax: 4,
  elevationMin: (22 * Math.PI) / 180, // low: almost from the street
  elevationMax: (82 * Math.PI) / 180, // high: almost a floor plan
};

const EASE_SPEED = 10;
const QUARTER_TURN = Math.PI / 2;

export class CameraViewModel {
  azimuth = CAMERA.azimuth;
  azimuthGoal = CAMERA.azimuth;
  elevation = CAMERA.elevation;
  zoom = 1;
  zoomGoal = 1;
  target = { x: 0, z: 0 };
  targetGoal = null; // only set while flying somewhere
  manual = 0;        // counts the person's own moves (pan, zoom, turn, tilt): who follows something stops then

  // Camera position relative to its target
  offset(azimuth = this.azimuth) {
    const { elevation } = this;
    const { distance } = CAMERA;
    return {
      x: Math.cos(elevation) * Math.sin(azimuth) * distance,
      y: Math.sin(elevation) * distance,
      z: Math.cos(elevation) * Math.cos(azimuth) * distance,
    };
  }

  // Ground point that appears behind (x, y, z) on screen: aiming there centers that 3D point
  groundBehind(x, y, z) {
    const o = this.offset();
    return { x: x - (o.x * y) / o.y, z: z - (o.z * y) / o.y };
  }

  rotateQuarter(direction) {
    this.manual++;
    this.azimuthGoal += direction * QUARTER_TURN;
  }

  // Eased rotation (hand gestures: smooths the jumps between camera frames)
  turnBy(radians) {
    this.manual++;
    this.azimuthGoal += radians;
  }

  // Free rotation while dragging: applied immediately
  rotateBy(radians) {
    this.manual++;
    this.azimuthGoal += radians;
    this.azimuth = this.azimuthGoal;
  }

  // Dragging up/down tilts the view (applied immediately)
  tiltBy(radians) {
    this.manual++;
    this.elevation = clamp(this.elevation + radians, CAMERA.elevationMin, CAMERA.elevationMax);
  }

  zoomBy(factor) {
    this.manual++;
    this.zoomGoal = clamp(this.zoomGoal * factor, CAMERA.zoomMin, CAMERA.zoomMax);
  }

  // Wheel zoom: applied immediately (the view keeps the point under the cursor fixed)
  setZoomNow(zoom) {
    this.manual++;
    this.zoom = this.zoomGoal = clamp(zoom, CAMERA.zoomMin, CAMERA.zoomMax);
    this.targetGoal = null;
  }

  panBy(dx, dz) {
    this.manual++;
    this.target = { x: this.target.x + dx, z: this.target.z + dz };
    this.targetGoal = null;
  }

  // Pan that eases in, like a short flight (hand gestures: smooths the jumps between camera frames)
  glideBy(dx, dz) {
    this.manual++;
    const from = this.targetGoal ?? this.target;
    this.targetGoal = { x: from.x + dx, z: from.z + dz };
  }

  cancelFlight() {
    this.targetGoal = null;
  }

  flyTo(point, zoom = this.zoomGoal) {
    this.targetGoal = { x: point.x, z: point.z };
    this.zoomGoal = clamp(zoom, CAMERA.zoomMin, CAMERA.zoomMax);
  }

  // Back to the initial angle (shortest way), zoom and center
  reset() {
    const turn = Math.PI * 2;
    this.azimuthGoal = CAMERA.azimuth + Math.round((this.azimuth - CAMERA.azimuth) / turn) * turn;
    this.elevation = CAMERA.elevation;
    this.flyTo({ x: 0, z: 0 }, 1);
  }

  saveView() {
    return { target: { ...this.target }, zoom: this.zoomGoal };
  }

  restoreView(view) {
    this.flyTo(view.target, view.zoom);
  }

  // Returns { moved, zoomed } so the view only updates what changed
  step(dt) {
    const k = 1 - Math.exp(-EASE_SPEED * dt);
    let moved = false, zoomed = false;
    if (Math.abs(this.azimuthGoal - this.azimuth) > 0.0005) {
      this.azimuth += (this.azimuthGoal - this.azimuth) * k;
      moved = true;
    }
    if (Math.abs(this.zoomGoal - this.zoom) > 0.0005) {
      this.zoom += (this.zoomGoal - this.zoom) * k;
      zoomed = true;
    }
    if (this.targetGoal) {
      const t = this.target, g = this.targetGoal;
      this.target = { x: t.x + (g.x - t.x) * k, z: t.z + (g.z - t.z) * k };
      if (Math.hypot(g.x - this.target.x, g.z - this.target.z) < 0.001) this.targetGoal = null;
      moved = true;
    }
    return { moved, zoomed };
  }
}
