import * as THREE from 'three';

const STEPS = 96;
export const BAND_RADIUS = 19;
const TILT = .26;

export function bandPoint(angle: number, target: THREE.Vector3) {
  const z = BAND_RADIUS * Math.cos(angle);
  return target.set(BAND_RADIUS * Math.sin(angle), -z * Math.sin(TILT), z * Math.cos(TILT));
}

/** Equal angular spacing collapses at the silhouette of a circle. Space the
 * billboards along its projected arc instead, keeping both copies on the same
 * world-space band. Rebuild only when the camera/viewport changes. */
export class BandLayout {
  private matrix = new THREE.Matrix4();
  private aspect = 0;
  private start = 0;
  private lengths = new Float64Array(STEPS + 1);
  private point = new THREE.Vector3();

  update(camera: THREE.PerspectiveCamera) {
    if (this.aspect === camera.aspect && this.matrix.equals(camera.matrixWorldInverse)) return;
    this.aspect = camera.aspect;
    this.matrix.copy(camera.matrixWorldInverse);
    this.start = Math.atan2(camera.position.x, camera.position.z * Math.cos(TILT) - camera.position.y * Math.sin(TILT)) - Math.PI / 2;
    let x = 0, y = 0;
    for (let i = 0; i <= STEPS; i++) {
      const point = bandPoint(this.start + i / STEPS * Math.PI * 2, this.point).project(camera);
      this.lengths[i] = i ? this.lengths[i - 1] + Math.hypot((point.x - x) * camera.aspect, point.y - y) : 0;
      x = point.x; y = point.y;
    }
  }

  angle(turn: number) {
    const fraction = ((turn % 1) + 1) % 1;
    const half = STEPS / 2;
    const first = fraction < .5 ? 0 : half;
    const last = first + half;
    const along = (fraction * 2) % 1;
    const distance = this.lengths[first] + along * (this.lengths[last] - this.lengths[first]);
    let low = first, high = last;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (this.lengths[middle] < distance) low = middle;
      else high = middle;
    }
    const between = (distance - this.lengths[low]) / Math.max(1e-8, this.lengths[high] - this.lengths[low]);
    return this.start + (low + between) / STEPS * Math.PI * 2;
  }
}
