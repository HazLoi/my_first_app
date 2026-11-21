import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/env';
import { t } from '@/i18n';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface StageMetrics {
  /** Tỉ lệ thu phóng từ khung thiết kế 1920×1080 sang pixel thật. */
  scale: number;
  /** Kích thước thật (px) của khung 16:9 sau khi letterbox. */
  width: number;
  height: number;
}

const StageContext = createContext<StageMetrics>({ scale: 1, width: DESIGN_WIDTH, height: DESIGN_HEIGHT });
export const useStage = (): StageMetrics => useContext(StageContext);

function viewportSize(): { w: number; h: number } {
  const viewport = window.visualViewport;
  return { w: viewport?.width ?? window.innerWidth, h: viewport?.height ?? window.innerHeight };
}

export function useViewportMetrics(): StageMetrics & { portrait: boolean } {
  const [size, setSize] = useState(viewportSize);
  useEffect(() => {
    const update = (): void => setSize(viewportSize());
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return useMemo(() => {
    const scale = Math.min(size.w / DESIGN_WIDTH, size.h / DESIGN_HEIGHT);
    return { scale, width: DESIGN_WIDTH * scale, height: DESIGN_HEIGHT * scale, portrait: size.h > size.w };
  }, [size]);
}

async function enterFullscreenLandscape(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {
    /* trình duyệt không cho phép */
  }
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    /* iOS/desktop không hỗ trợ khóa hướng */
  }
}

interface StageProps {
  /** Lớp 3D (Canvas) — có kích thước pixel thật của khung 16:9, không bị scale bằng CSS. */
  canvas?: ReactNode;
  /** Lớp HUD DOM — dùng tọa độ thiết kế 1920×1080. */
  children: ReactNode;
}

/**
 * Khung 16:9 (thiết kế 1920×1080) scale vừa màn hình có letterbox. Khi thiết bị đang dọc,
 * hiện lớp phủ yêu cầu xoay ngang. Dùng cho /lobby và /table.
 */
export function Stage({ canvas, children }: StageProps) {
  const metrics = useViewportMetrics();

  useEffect(() => {
    void (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')?.catch(() => undefined);
  }, []);

  return (
    <StageContext.Provider value={metrics}>
      <div className="stage-root">
        <div className="stage-box" style={{ width: metrics.width, height: metrics.height }}>
          {canvas ? <div className="stage-canvas">{canvas}</div> : null}
          <div
            className="stage-hud"
            style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, transform: `scale(${metrics.scale})` }}
          >
            {children}
          </div>
        </div>
        {metrics.portrait ? (
          <div className="rotate-overlay" role="alertdialog" aria-live="assertive">
            <svg viewBox="0 0 64 64" width="96" height="96" className="rotate-icon" aria-hidden="true">
              <rect x="22" y="6" width="20" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
              <path d="M10 46c4 10 14 14 24 12M46 58l-6-2 3-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <h2>{t('orientation.rotate')}</h2>
            <p>{t('orientation.hint')}</p>
            <button type="button" className="btn btn-gold" onClick={() => void enterFullscreenLandscape()}>
              {t('orientation.fullscreen')}
            </button>
          </div>
        ) : null}
      </div>
    </StageContext.Provider>
  );
}

export { enterFullscreenLandscape };
