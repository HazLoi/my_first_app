import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Float32BufferAttribute,
  AdditiveBlending,
  type BufferGeometry,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CARD_REST_Y, rowRect } from '@/components/table/layout';
import type { CardSpec, RowMark } from '@/components/table/tableView';
import { CAMERA } from './camera';
import { Card3D } from './Card3D';
import { backFaceGeometry, cardMaterials, slabGeometry } from './cardGeometry';

export const TABLE_RX = 7.9;
export const TABLE_RZ = 4.6;

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d') as CanvasRenderingContext2D);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function ellipseShape(rx: number, rz: number, holeRx?: number, holeRz?: number): Shape {
  const shape = new Shape();
  shape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  if (holeRx && holeRz) {
    const hole = new Shape();
    hole.absellipse(0, 0, holeRx, holeRz, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
  }
  return shape;
}

function feltTexture(): CanvasTexture {
  return canvasTexture(1024, 600, (ctx) => {
    const gradient = ctx.createRadialGradient(512, 300, 40, 512, 300, 560);
    gradient.addColorStop(0, '#19b3a4');
    gradient.addColorStop(0.55, '#0f857c');
    gradient.addColorStop(1, '#06403d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 600);
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      ctx.fillRect(Math.random() * 1024, Math.random() * 600, 2, 2);
    }
    ctx.strokeStyle = 'rgba(245,196,81,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(512, 300, 478, 272, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(245,196,81,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(512, 300, 462, 258, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,196,81,0.10)';
    ctx.font = '700 64px "Baloo 2", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ZINGPLAY · XẬP XÁM', 512, 322);
  });
}

function blobTexture(): CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    const gradient = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.5)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  });
}

function floorTexture(): CanvasTexture {
  return canvasTexture(512, 512, (ctx) => {
    const gradient = ctx.createRadialGradient(256, 256, 10, 256, 256, 256);
    gradient.addColorStop(0, '#26214f');
    gradient.addColorStop(0.45, '#121634');
    gradient.addColorStop(1, '#05070f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
  });
}

function glowTexture(): CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,214,110,0.95)');
    gradient.addColorStop(0.55, 'rgba(255,190,60,0.55)');
    gradient.addColorStop(1, 'rgba(255,170,40,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function feltGeometry(): BufferGeometry {
  const geometry = new ShapeGeometry(ellipseShape(TABLE_RX, TABLE_RZ), 96);
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) {
    uv.push(position.getX(i) / (2 * TABLE_RX) + 0.5, position.getY(i) / (2 * TABLE_RZ) + 0.5);
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function ringGeometry(innerX: number, innerZ: number, outerX: number, outerZ: number, height: number, bevel: boolean): BufferGeometry {
  const geometry = new ExtrudeGeometry(ellipseShape(outerX, outerZ, innerX, innerZ), {
    depth: height,
    bevelEnabled: bevel,
    bevelSize: 0.07,
    bevelThickness: 0.07,
    bevelSegments: 3,
    curveSegments: 96,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Bàn bầu dục: nỉ teal, đệm da, viền vàng đồng, chân bàn, bóng đổ giả mềm bên dưới. */
function TableMesh({ shadows, lowGraphics }: { shadows: boolean; lowGraphics: boolean }) {
  const assets = useMemo(() => {
    const felt = new MeshStandardMaterial({ map: feltTexture(), roughness: 0.92, metalness: 0 });
    const cushion = new MeshStandardMaterial({ color: '#0a2e2b', roughness: 0.6 });
    const gold = new MeshStandardMaterial({
      color: '#d9a441',
      roughness: 0.32,
      metalness: lowGraphics ? 0.35 : 0.85,
      emissive: '#3a2400',
    });
    const base = new MeshStandardMaterial({ color: '#0b0f24', roughness: 0.8 });
    return {
      felt,
      cushion,
      gold,
      base,
      feltGeo: feltGeometry(),
      cushionGeo: ringGeometry(TABLE_RX, TABLE_RZ, TABLE_RX + 0.3, TABLE_RZ + 0.3, 0.1, false),
      goldGeo: ringGeometry(TABLE_RX + 0.3, TABLE_RZ + 0.3, TABLE_RX + 0.6, TABLE_RZ + 0.6, 0.2, true),
      baseGeo: new CylinderGeometry(1, 0.7, 0.7, 64),
      blob: new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
      blobGeo: new PlaneGeometry(1, 1),
    };
  }, [lowGraphics]);
  return (
    <group>
      <mesh geometry={assets.feltGeo} material={assets.felt} receiveShadow={shadows} />
      <mesh geometry={assets.cushionGeo} material={assets.cushion} position={[0, -0.01, 0]} />
      <mesh geometry={assets.goldGeo} material={assets.gold} position={[0, -0.05, 0]} />
      <mesh geometry={assets.baseGeo} material={assets.base} position={[0, -0.5, 0]} scale={[TABLE_RX * 0.82, 1, TABLE_RZ * 0.82]} />
      <mesh
        geometry={assets.blobGeo}
        material={assets.blob}
        position={[0, -0.78, 0.25]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[(TABLE_RX + 2.2) * 2, (TABLE_RZ + 2.2) * 2, 1]}
      />
    </group>
  );
}

function Room({ lowGraphics }: { lowGraphics: boolean }) {
  const floor = useMemo(() => new MeshStandardMaterial({ map: floorTexture(), roughness: 1 }), []);
  const neon = useMemo(() => new MeshBasicMaterial({ color: new Color('#7c3aed') }), []);
  const neon2 = useMemo(() => new MeshBasicMaterial({ color: new Color('#22d3ee') }), []);
  return (
    <group>
      <mesh geometry={useMemo(() => new CircleGeometry(40, 48), [])} material={floor} position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      {lowGraphics ? null : (
        <>
          <mesh position={[0, -0.78, 0.2]} rotation={[-Math.PI / 2, 0, 0]} scale={[(TABLE_RX + 3.1) / 1, (TABLE_RZ + 3.1) / 1, 1]} material={neon}>
            <ringGeometry args={[0.985, 1, 128]} />
          </mesh>
          <mesh position={[0, -0.78, 0.2]} rotation={[-Math.PI / 2, 0, 0]} scale={[(TABLE_RX + 4.2) / 1, (TABLE_RZ + 4.2) / 1, 1]} material={neon2}>
            <ringGeometry args={[0.99, 1, 128]} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Môi trường phản chiếu thủ tục (không tải file ngoài) giúp viền vàng ánh kim. */
function Environment({ enabled }: { enabled: boolean }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    if (!enabled) return undefined;
    const generator = new PMREMGenerator(gl);
    const target = generator.fromScene(new RoomEnvironment(), 0.04);
    const previous = scene.environment;
    scene.environment = target.texture;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = previous;
      target.dispose();
      generator.dispose();
    };
  }, [enabled, gl, scene]);
  return null;
}

/** Rung nhẹ theo chuột/gyro (parallax); luôn nhìn về tâm bàn. */
function CameraRig({ parallax }: { parallax: boolean }) {
  const tilt = useRef({ x: 0, y: 0 });
  const smooth = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!parallax) return undefined;
    const onOrientation = (event: DeviceOrientationEvent): void => {
      const gamma = Math.max(-25, Math.min(25, event.gamma ?? 0)) / 25;
      const beta = Math.max(-25, Math.min(25, (event.beta ?? 45) - 45)) / 25;
      tilt.current = { x: gamma, y: -beta };
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, [parallax]);
  useFrame(({ camera, pointer }, delta) => {
    const gx = parallax ? (Math.abs(tilt.current.x) > 0.001 ? tilt.current.x : pointer.x) : 0;
    const gy = parallax ? (Math.abs(tilt.current.y) > 0.001 ? tilt.current.y : pointer.y) : 0;
    const k = 1 - Math.exp(-delta * 3);
    smooth.current.x += (gx - smooth.current.x) * k;
    smooth.current.y += (gy - smooth.current.y) * k;
    camera.position.set(CAMERA.position[0] + smooth.current.x * 0.35, CAMERA.position[1] + smooth.current.y * 0.18, CAMERA.position[2]);
    camera.lookAt(CAMERA.target[0], CAMERA.target[1], CAMERA.target[2]);
  });
  return null;
}

/** Chồng bài (lưng) ở giữa bàn lúc chờ/chia bài. */
function DeckStack({ visible }: { visible: boolean }) {
  const materials = cardMaterials();
  if (!visible) return null;
  return (
    <group>
      {Array.from({ length: 9 }, (_, index) => (
        <group key={index} position={[0, CARD_REST_Y + index * 0.022, 0]} rotation={[0, (index % 3) * 0.04 - 0.04, 0]} scale={0.9}>
          <group rotation={[Math.PI / 2, 0, 0]}>
            <mesh geometry={slabGeometry()} material={materials.slab} />
            <mesh geometry={backFaceGeometry()} material={materials.face} />
          </group>
        </group>
      ))}
    </group>
  );
}

function RowMarks({ marks }: { marks: RowMark[] }) {
  const assets = useMemo(
    () => ({
      geo: new PlaneGeometry(1, 1),
      glow: new MeshBasicMaterial({
        map: glowTexture(),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
      dim: new MeshBasicMaterial({ color: '#02040a', transparent: true, opacity: 0.55, depthWrite: false }),
    }),
    [],
  );
  useFrame(({ clock }) => {
    assets.glow.opacity = 0.75 + Math.sin(clock.elapsedTime * 3.2) * 0.2;
  });
  return (
    <group>
      {marks.map((mark) => {
        if (mark.outcome === 'tie') return null;
        const rect = rowRect(mark.slot, mark.pile);
        const win = mark.outcome === 'win';
        return (
          <mesh
            key={mark.key}
            geometry={assets.geo}
            material={win ? assets.glow : assets.dim}
            position={[rect.x, win ? 0.006 : CARD_REST_Y + 0.07, rect.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={win ? [rect.halfW * 2 + 0.7, rect.halfD * 2 + 0.7, 1] : [rect.halfW * 2, rect.halfD * 2, 1]}
          />
        );
      })}
    </group>
  );
}

export interface Table3DProps {
  specs: CardSpec[];
  rowMarks: RowMark[];
  shadows: boolean;
  lowGraphics: boolean;
  parallax: boolean;
  deckVisible: boolean;
}

/** Toàn bộ cảnh 3D: phòng tối, bàn, đèn, chồng bài và các lá bài. */
export function Table3D({ specs, rowMarks, shadows, lowGraphics, parallax, deckVisible }: Table3DProps) {
  return (
    <>
      <color attach="background" args={['#05070f']} />
      <fog attach="fog" args={['#05070f', 24, 46]} />
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#bfe9ff', '#1a1040', 0.7]} />
      <directionalLight
        position={[2.5, 13, 5]}
        intensity={1.9}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={2}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
      />
      <pointLight position={[-9, 5, -4]} color="#7c3aed" intensity={lowGraphics ? 0 : 120} distance={30} />
      <pointLight position={[9, 5, -4]} color="#22d3ee" intensity={lowGraphics ? 0 : 90} distance={30} />
      <Environment enabled={!lowGraphics} />
      <Room lowGraphics={lowGraphics} />
      <TableMesh shadows={shadows} lowGraphics={lowGraphics} />
      <DeckStack visible={deckVisible} />
      <RowMarks marks={rowMarks} />
      {specs.map((spec) => (
        <Card3D key={spec.key} spec={spec} shadows={shadows} lowGraphics={lowGraphics} />
      ))}
      <CameraRig parallax={parallax} />
    </>
  );
}
