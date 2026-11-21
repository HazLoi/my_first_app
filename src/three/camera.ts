import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/env';

/** Thông số camera dùng chung cho Canvas 3D và phép chiếu tọa độ thế giới → tọa độ thiết kế 1920×1080 (HUD DOM). */
export const CAMERA = {
  position: [0, 12.6, 8.6] as const,
  target: [0, 0, 0.5] as const,
  fov: 38,
  aspect: DESIGN_WIDTH / DESIGN_HEIGHT,
};

type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): Vec => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

const forward = norm(sub([...CAMERA.target], [...CAMERA.position]));
const right = norm(cross(forward, [0, 1, 0]));
const up = cross(right, forward);
const tanHalf = Math.tan((CAMERA.fov * Math.PI) / 360);

export interface Point {
  x: number;
  y: number;
}

/** Chiếu điểm thế giới (x, y, z) lên màn hình thiết kế. */
export function projectPerspective(x: number, y: number, z: number): Point {
  const v = sub([x, y, z], [...CAMERA.position]);
  const depth = dot(v, forward);
  const ndcX = dot(v, right) / (depth * tanHalf * CAMERA.aspect);
  const ndcY = dot(v, up) / (depth * tanHalf);
  return { x: (ndcX * 0.5 + 0.5) * DESIGN_WIDTH, y: (0.5 - ndcY * 0.5) * DESIGN_HEIGHT };
}

/** Số px thiết kế trên một đơn vị thế giới tại điểm (x, y, z) (theo phương ngang). */
export function pixelsPerUnit(x: number, y: number, z: number): number {
  const depth = dot(sub([x, y, z], [...CAMERA.position]), forward);
  return DESIGN_HEIGHT / (2 * tanHalf * depth);
}

/** Điểm trên mặt phẳng y = planeY mà tia nhìn qua pixel (px, py) cắt. */
export function unprojectToPlane(px: number, py: number, planeY = 0): { x: number; z: number } {
  const ndcX = (px / DESIGN_WIDTH) * 2 - 1;
  const ndcY = 1 - (py / DESIGN_HEIGHT) * 2;
  const dir: Vec = [
    forward[0] + right[0] * ndcX * tanHalf * CAMERA.aspect + up[0] * ndcY * tanHalf,
    forward[1] + right[1] * ndcX * tanHalf * CAMERA.aspect + up[1] * ndcY * tanHalf,
    forward[2] + right[2] * ndcX * tanHalf * CAMERA.aspect + up[2] * ndcY * tanHalf,
  ];
  const t = (planeY - CAMERA.position[1]) / dir[1];
  return { x: CAMERA.position[0] + dir[0] * t, z: CAMERA.position[2] + dir[2] * t };
}

/** Bộ chiếu dùng cho lớp HUD: 3D (phối cảnh) hoặc 2D phẳng (nhìn từ trên xuống, không phối cảnh). */
export interface Projection {
  project(x: number, y: number, z: number): Point;
  /** px thiết kế cho 1 đơn vị thế giới tại điểm đó. */
  scaleAt(x: number, y: number, z: number): number;
}

export const perspectiveProjection: Projection = {
  project: projectPerspective,
  scaleAt: pixelsPerUnit,
};

const FLAT_SCALE = 100;
export const flatProjection: Projection = {
  project: (x, _y, z) => ({ x: DESIGN_WIDTH / 2 + x * FLAT_SCALE, y: DESIGN_HEIGHT / 2 + z * FLAT_SCALE }),
  scaleAt: () => FLAT_SCALE,
};
