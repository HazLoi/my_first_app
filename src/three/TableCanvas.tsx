import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import type { CardSpec, RowMark } from '@/components/table/tableView';
import { useSettingsStore } from '@/store/settingsStore';
import { CAMERA } from './camera';
import { Table3D } from './Table3D';

export interface TableCanvasProps {
  specs: CardSpec[];
  rowMarks: RowMark[];
  deckVisible: boolean;
}

/**
 * Lớp Canvas 3D của bàn chơi (lazy-load để không kéo three vào bundle chính / chế độ 2D phẳng).
 * `dpr` giới hạn ≤ 1.5 (≤ 1 khi đồ họa thấp); PerformanceMonitor đo FPS bằng useFrame và tự hạ chất lượng.
 */
export default function TableCanvas({ specs, rowMarks, deckVisible }: TableCanvasProps) {
  const lowGraphics = useSettingsStore((state) => state.lowGraphics);
  const [degraded, setDegraded] = useState(false);
  const low = lowGraphics || degraded;
  return (
    <div className="table-canvas-host">
      <Canvas
        flat
        shadows={!low}
        dpr={[1, low ? 1 : 1.5]}
        camera={{ position: [...CAMERA.position], fov: CAMERA.fov, near: 0.1, far: 80 }}
        gl={{ antialias: !lowGraphics, powerPreference: 'high-performance' }}
      >
        <PerformanceMonitor bounds={() => [36, 120]} onDecline={() => setDegraded(true)} />
        <Table3D
          specs={specs}
          rowMarks={rowMarks}
          shadows={!low}
          lowGraphics={low}
          parallax={!lowGraphics}
          deckVisible={deckVisible}
        />
      </Canvas>
      <div className="table-vignette" />
    </div>
  );
}
