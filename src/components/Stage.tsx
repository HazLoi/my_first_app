import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/env';
import { t } from '@/i18n';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface StageMetrics {
  /** Tỉ lệ thu phóng từ khung thiết kế 1920×1080 sang pixel thật. */
  scale: number;
  /** Kích thước thật (px) của khung 16:9 sau khi letterbox. */
  width: number;
  height: number;
}

const StageContext = createContext<StageMetrics>({ scale: 1, width: DESIGN_WIDTH, height: DESIGN_HEIGHT });
export const useStage = (): StageMetrics => useContext(StageContext);

function viewportSize(): { w: number; h: number; outerWidth: number; outerHeight: number; orientation: string } {
  const styles = getComputedStyle(document.documentElement);
  const inset = (name: string): number => Number.parseFloat(styles.getPropertyValue(name)) || 0;
  return {
    w: window.innerWidth - inset('--safe-area-left') - inset('--safe-area-right'),
    h: window.innerHeight - inset('--safe-area-top') - inset('--safe-area-bottom'),
    outerWidth: window.innerWidth,
    outerHeight: window.innerHeight,
    orientation: screen.orientation?.type ?? (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'),
  };
}

export function useViewportMetrics(): StageMetrics & { portrait: boolean; outerWidth: number; outerHeight: number } {
  const [size, setSize] = useState(viewportSize);
  const stable = useRef(size);
  useEffect(() => {
    let blurTimer: number | undefined;
    let suppressUntil = 0;
    const update = (force = false): void => {
      const next = viewportSize();
      const previous = stable.current;
      const widthChanged = Math.abs(next.outerWidth - previous.outerWidth) > 1;
      const orientationChanged = next.orientation !== previous.orientation && widthChanged;
      const active = document.activeElement;
      const editing = active instanceof HTMLElement && (active.isContentEditable
        || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement
        || (active instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(active.type)));
      const keyboardResize = !widthChanged && next.outerHeight < previous.outerHeight * 0.8;
      if (!force && !widthChanged && !orientationChanged && (editing || Date.now() < suppressUntil || keyboardResize)) return;
      stable.current = next;
      setSize(next);
    };
    const resize = (): void => update();
    const rotate = (): void => update(true);
    const blur = (): void => {
      window.clearTimeout(blurTimer);
      suppressUntil = Date.now() + 300;
      blurTimer = window.setTimeout(() => update(), 300);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', rotate);
    document.addEventListener('focusout', blur);
    return () => {
      window.clearTimeout(blurTimer);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', rotate);
      document.removeEventListener('focusout', blur);
    };
  }, []);
  return useMemo(() => {
    const scale = Math.min(size.w / DESIGN_WIDTH, size.h / DESIGN_HEIGHT);
    return { scale, width: DESIGN_WIDTH * scale, height: DESIGN_HEIGHT * scale, portrait: size.h > size.w,
      outerWidth: size.outerWidth, outerHeight: size.outerHeight };
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
  const debug = useRef<HTMLDivElement>(null);
  const debugEnabled = new URLSearchParams(window.location.search).get('debug') === 'layout'
    || new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('debug') === 'layout';

  useEffect(() => {
    const root = document.documentElement;
    const update = (): void => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const uiScale = Math.max(0.875, Math.min(1.25, metrics.scale * 2));
      root.style.setProperty('--vvw', `${width}px`);
      root.style.setProperty('--vvh', `${height}px`);
      root.style.setProperty('--vvt', `${viewport?.offsetTop ?? 0}px`);
      root.style.setProperty('--vvl', `${viewport?.offsetLeft ?? 0}px`);
      root.style.setProperty('--ui-scale', String(uiScale));
      root.style.setProperty('--stage-scale', String(metrics.scale));
      root.style.setProperty('--stable-height', `${metrics.outerHeight}px`);
      root.dataset.keyboardOpen = String(height < metrics.outerHeight * 0.7);
      if (debug.current) {
        debug.current.textContent = `inner ${window.innerWidth}×${window.innerHeight} · visual ${Math.round(width)}×${Math.round(height)} · stage ${metrics.scale.toFixed(3)} · ui ${uiScale.toFixed(2)} · keyboardOpen ${root.dataset.keyboardOpen} · ${screen.orientation?.type ?? (metrics.portrait ? 'portrait' : 'landscape')} · DPR ${window.devicePixelRatio}`;
      }
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [metrics]);

  useEffect(() => {
    void (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')?.catch(() => undefined);
  }, []);

  return (
    <StageContext.Provider value={metrics}>
      <div className="stage-root" style={{ width: metrics.outerWidth, height: metrics.outerHeight }}>
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
        {debugEnabled ? createPortal(<div ref={debug} className="layout-debug" />, document.body) : null}
      </div>
    </StageContext.Provider>
  );
}

export { enterFullscreenLandscape };
