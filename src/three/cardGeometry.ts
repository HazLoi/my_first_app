import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, MeshStandardMaterial, Shape, ShapeGeometry } from 'three';
import { ATLAS_COLS, ATLAS_ROWS, BACK_CELL } from '@/components/table/cardSvg';
import { CARD_WORLD } from '@/components/table/layout';
import { getCardAtlas } from './cardAtlas';

const { w: W, h: H, thickness: T } = CARD_WORLD;
const RADIUS = 0.075;

function roundedRect(width: number, height: number, radius: number): Shape {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

let slab: BufferGeometry | null = null;
const faces = new Map<number, BufferGeometry>();

/** Thân lá bài: hộp mỏng bo góc có độ dày (một geometry dùng chung). */
export function slabGeometry(): BufferGeometry {
  if (!slab) {
    slab = new ExtrudeGeometry(roundedRect(W, H, RADIUS), { depth: T, bevelEnabled: false, curveSegments: 5 });
    slab.translate(0, 0, -T / 2);
  }
  return slab;
}

/**
 * Mặt phẳng bo góc có UV trỏ vào ô `cell` của atlas. Mặt trước nằm ở +z, mặt sau (lưng) ở −z.
 * Có tối đa 53 geometry nhỏ (một cho mỗi ô atlas) được cache và dùng lại cho mọi lá.
 */
export function faceGeometry(cell: number, back = false): BufferGeometry {
  const key = back ? cell + 1000 : cell;
  const cached = faces.get(key);
  if (cached) return cached;
  const inset = 0.006;
  const geometry = new ShapeGeometry(roundedRect(W - inset, H - inset, RADIUS - 0.004), 5);
  const position = geometry.getAttribute('position');
  const col = cell % ATLAS_COLS;
  const row = Math.floor(cell / ATLAS_COLS);
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const u = (col + position.getX(i) / W + 0.5) / ATLAS_COLS;
    const v = 1 - (row + 0.5 - position.getY(i) / H) / ATLAS_ROWS;
    uv.push(u, v);
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  if (back) {
    geometry.rotateY(Math.PI);
    geometry.translate(0, 0, -(T / 2 + 0.0008));
  } else {
    geometry.translate(0, 0, T / 2 + 0.0008);
  }
  faces.set(key, geometry);
  return geometry;
}

export const backFaceGeometry = (): BufferGeometry => faceGeometry(BACK_CELL, true);

export interface CardMaterials {
  slab: MeshStandardMaterial;
  face: MeshStandardMaterial;
}

let materials: CardMaterials | null = null;

/** Material dùng chung: thân ngà + mặt dùng atlas (một texture cho cả 52 lá). */
export function cardMaterials(low = false): CardMaterials {
  materials ??= {
    slab: new MeshStandardMaterial({ color: '#f1ead6', roughness: 0.7 }),
    face: new MeshStandardMaterial({ map: getCardAtlas(low ? 128 : 192), roughness: 0.42, metalness: 0 }),
  };
  return materials;
}
