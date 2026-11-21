import { useCallback, useEffect, useRef, useState } from 'react';
import { playSound } from '@/services/sound';
import './overlay.css';

export interface ToastItem {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

/** Hàng đợi toast cục bộ cho một màn hình. */
export function useToasts(duration = 3600): { toasts: ToastItem[]; toast: (text: string, tone?: ToastItem['tone']) => void } {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((timer) => window.clearTimeout(timer));
      active.clear();
    };
  }, []);

  const toast = useCallback(
    (text: string, tone: ToastItem['tone'] = 'info') => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, text, tone }]);
      if (tone === 'error') playSound('toast');
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        setToasts((list) => list.filter((item) => item.id !== id));
      }, duration);
      timers.current.add(timer);
    },
    [duration],
  );

  return { toasts, toast };
}

export function ToastHost({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast-item toast-${item.tone}`}>
          {item.text}
        </div>
      ))}
    </div>
  );
}
