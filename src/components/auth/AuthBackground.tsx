import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  hue: number;
  phase: number;
}

const COUNT = 46;

/** Hạt sáng neon trôi chậm (canvas nhẹ). Tắt hoàn toàn khi bật đồ họa thấp hoặc người dùng giảm chuyển động. */
export function AuthBackground() {
  const lowGraphics = useSettingsStore((state) => state.lowGraphics);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || lowGraphics) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let frame = 0;
    let particles: Particle[] = [];

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const base = Math.max(width, height);
      particles = Array.from({ length: COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1 + Math.random() * 2.6 + base / 1200,
        vx: (Math.random() - 0.5) * 0.18,
        vy: -0.08 - Math.random() * 0.28,
        hue: Math.random() < 0.5 ? 200 + Math.random() * 30 : 265 + Math.random() * 40,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (time: number): void => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) p.y = height + 10;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        const alpha = 0.35 + 0.35 * Math.sin(time / 900 + p.phase);
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        glow.addColorStop(0, `hsla(${p.hue}, 95%, 70%, ${alpha})`);
        glow.addColorStop(1, `hsla(${p.hue}, 95%, 60%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };

    const start = (): void => {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };

    resize();
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', start);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', start);
    };
  }, [lowGraphics]);

  return (
    <div className="auth-bg" aria-hidden="true">
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />
      <canvas ref={canvasRef} className="auth-canvas" />
    </div>
  );
}
