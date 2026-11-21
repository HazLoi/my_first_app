import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/i18n';
import './overlay.css';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  width?: number;
  footer?: ReactNode;
  headerStart?: ReactNode;
}

let openDialogs = 0;
let historyCleanup: number | undefined;
const isEditable = (element: EventTarget | null): element is HTMLElement =>
  element instanceof HTMLElement && (element.isContentEditable || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement || (element instanceof HTMLInputElement
      && !['checkbox', 'radio', 'button', 'submit'].includes(element.type)));

export function Modal({ title, children, onClose, width = 760, footer, headerStart }: ModalProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');

  useEffect(() => {
    if (!onClose) return undefined;
    window.clearTimeout(historyCleanup);
    openDialogs++;
    if (!window.history.state?.__zingplayModal) {
      window.history.pushState({ ...window.history.state, __zingplayModal: true }, '');
    }
    const onPop = (): void => {
      if (!window.history.state?.__zingplayModal) closeRef.current?.();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current?.();
      }
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      openDialogs--;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      historyCleanup = window.setTimeout(() => {
        if (openDialogs === 0 && window.history.state?.__zingplayModal) window.history.back();
      }, 0);
    };
  }, [Boolean(onClose)]);

  useEffect(() => {
    const update = (): void => {
      const stableHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stable-height')) || window.innerHeight;
      setEditing(Boolean(active && (window.visualViewport?.height ?? window.innerHeight) < stableHeight * 0.7));
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    return () => window.visualViewport?.removeEventListener('resize', update);
  }, [active]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!editing || !active || !body?.contains(active)) return undefined;
    const frame = requestAnimationFrame(() => {
      active.scrollIntoView({ block: 'center', inline: 'nearest', container: 'nearest' } as ScrollIntoViewOptions);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, editing]);

  return createPortal(
    <div className="hud-interactive modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal-card${editing ? ' modal-input-mode' : ''}`} style={{ width: `min(calc(${width}px * var(--ui-scale, 1)), 100%)` }}
        onClick={(event) => event.stopPropagation()}
        onFocusCapture={(event) => {
          if (!isEditable(event.target)) return;
          const element = event.target;
          const label = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
            ? element.labels?.[0]?.textContent : null;
          const body = bodyRef.current ?? element.closest('.modal-body');
          let node: HTMLElement | null = element;
          while (node && node !== body) {
            node.dataset.inputBranch = 'true';
            node = node.parentElement;
          }
          setEditLabel(element.getAttribute('aria-label') || label?.trim() || element.getAttribute('placeholder') || 'Nhập dữ liệu');
          setActive(element);
        }}
        onBlurCapture={(event) => {
          if (event.target === active) {
            bodyRef.current?.querySelectorAll('[data-input-branch]').forEach((item) => item.removeAttribute('data-input-branch'));
            setActive(null);
          }
        }}
        onKeyDownCapture={(event) => {
          if (editing && event.key === 'Enter' && isEditable(event.target)) {
            event.preventDefault();
            event.target.blur();
          }
        }}>
        <div className="modal-head">
          {headerStart}
          <h2>{title}</h2>
          {onClose ? <button type="button" className="btn btn-round modal-x" onClick={onClose} aria-label={t('common.close')}>✕</button> : null}
        </div>
        {editing ? <div className="modal-edit-label">{editLabel}</div> : null}
        <div className="modal-body" ref={bodyRef}>{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
        {editing ? <button type="button" className="btn modal-done" onPointerDown={(event) => event.preventDefault()}
          onClick={() => active?.blur()}>Xong</button> : null}
      </div>
    </div>,
    document.body,
  );
}
