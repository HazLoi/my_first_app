import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { BACK_CELL, cardCell } from '@/components/table/cardSvg';
import type { CardSpec } from '@/components/table/tableView';
import { backFaceGeometry, cardMaterials, faceGeometry, slabGeometry } from './cardGeometry';

interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** 0 = úp (lưng lên), 1 = ngửa (mặt lên). */
  flip: number;
}

interface Anim {
  ready: boolean;
  active: boolean;
  cur: Pose;
  from: Pose;
  to: Pose;
  start: number;
  duration: number;
  arc: number;
  pendingDelay: number | null;
}

const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const targetPose = (spec: CardSpec): Pose => ({
  x: spec.x,
  y: spec.y,
  z: spec.z,
  yaw: spec.yaw,
  scale: spec.scale,
  flip: spec.faceUp ? 1 : 0,
});

interface Card3DProps {
  spec: CardSpec;
  shadows: boolean;
  lowGraphics: boolean;
}

/**
 * Lá bài 3D: hộp mỏng bo góc (geometry/material/texture dùng chung), bay + lật thật bằng xoay trục X.
 * Chỉ tween lại khi tư thế đích đổi, nên reconcile cùng version không chạy lại animation.
 */
function Card3DInner({ spec, shadows, lowGraphics }: Card3DProps) {
  const group = useRef<Group>(null);
  const flipper = useRef<Group>(null);
  const anim = useRef<Anim | null>(null);
  const specRef = useRef(spec);
  specRef.current = spec;

  const cell = spec.card ? cardCell(spec.card) : BACK_CELL;
  const frontGeometry = useMemo(() => faceGeometry(cell), [cell]);
  const backGeometry = useMemo(() => backFaceGeometry(), []);
  const materials = useMemo(() => cardMaterials(lowGraphics), [lowGraphics]);
  const signature = `${spec.x.toFixed(3)}|${spec.y.toFixed(3)}|${spec.z.toFixed(3)}|${spec.yaw.toFixed(3)}|${spec.scale}|${spec.faceUp ? 1 : 0}`;

  useEffect(() => {
    const current = specRef.current;
    const target = targetPose(current);
    const state = anim.current;
    if (!state) {
      const start: Pose = current.from ? { ...target, ...current.from, yaw: 0, flip: 0 } : target;
      anim.current = {
        ready: false,
        active: Boolean(current.from),
        cur: { ...start },
        from: { ...start },
        to: target,
        start: 0,
        duration: current.duration,
        arc: current.arc,
        pendingDelay: current.from ? current.delay : null,
      };
      return;
    }
    state.from = { ...state.cur };
    state.to = target;
    state.duration = current.duration;
    state.arc = current.arc + (state.from.flip !== target.flip ? 0.45 : 0);
    state.pendingDelay = current.delay;
    state.active = true;
  }, [signature]);

  useFrame(({ clock }) => {
    const state = anim.current;
    const root = group.current;
    const flip = flipper.current;
    if (!state || !root || !flip) return;
    const now = clock.elapsedTime;
    if (state.pendingDelay !== null) {
      state.start = now + state.pendingDelay;
      state.pendingDelay = null;
    }
    if (!state.active && state.ready) return;
    let lift = 0;
    if (state.active) {
      const p = state.duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - state.start) / state.duration));
      const e = ease(p);
      state.cur.x = lerp(state.from.x, state.to.x, e);
      state.cur.y = lerp(state.from.y, state.to.y, e);
      state.cur.z = lerp(state.from.z, state.to.z, e);
      state.cur.yaw = lerp(state.from.yaw, state.to.yaw, e);
      state.cur.scale = lerp(state.from.scale, state.to.scale, e);
      state.cur.flip = lerp(state.from.flip, state.to.flip, e);
      lift = state.arc * Math.sin(Math.PI * p);
      if (p >= 1) state.active = false;
    }
    root.position.set(state.cur.x, state.cur.y + lift, state.cur.z);
    root.rotation.y = state.cur.yaw;
    root.scale.setScalar(state.cur.scale);
    flip.rotation.x = Math.PI / 2 - state.cur.flip * Math.PI;
    root.visible = !specRef.current.hidden;
    state.ready = true;
  });

  return (
    <group ref={group} visible={false}>
      <group ref={flipper}>
        <mesh geometry={slabGeometry()} material={materials.slab} castShadow={shadows} />
        <mesh geometry={frontGeometry} material={materials.face} />
        <mesh geometry={backGeometry} material={materials.face} />
      </group>
    </group>
  );
}

export const Card3D = memo(
  Card3DInner,
  (a, b) =>
    a.shadows === b.shadows &&
    a.lowGraphics === b.lowGraphics &&
    a.spec.key === b.spec.key &&
    a.spec.hidden === b.spec.hidden &&
    a.spec.card?.id === b.spec.card?.id &&
    a.spec.faceUp === b.spec.faceUp &&
    a.spec.x === b.spec.x &&
    a.spec.y === b.spec.y &&
    a.spec.z === b.spec.z &&
    a.spec.yaw === b.spec.yaw &&
    a.spec.scale === b.spec.scale,
);
