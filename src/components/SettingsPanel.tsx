import { enterFullscreenLandscape } from '@/components/Stage';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/settingsStore';

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[56px] w-full items-center justify-between rounded-xl bg-white/5 px-5 text-left text-[22px] font-medium"
    >
      <span>{label}</span>
      <span
        className={`relative h-9 w-16 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-600'}`}
      >
        <span
          className={`absolute top-1 h-7 w-7 rounded-full bg-white transition-all ${checked ? 'left-8' : 'left-1'}`}
        />
      </span>
    </button>
  );
}

/** Hộp cài đặt dùng chung (sảnh + bàn chơi): âm thanh, đồ họa thấp, 2D phẳng, toàn màn hình. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore();
  return (
    <div
      className="hud-interactive absolute inset-0 z-50 grid place-items-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('common.settings')}
    >
      <div className="glass flex w-[640px] flex-col gap-4 p-8" onClick={(event) => event.stopPropagation()}>
        <h2 className="m-0 font-display text-[40px] font-bold text-gold">{t('common.settings')}</h2>
        <Toggle label={t('common.sound')} checked={settings.soundOn} onChange={settings.setSoundOn} />
        <Toggle label={t('common.lowGraphics')} checked={settings.lowGraphics} onChange={settings.setLowGraphics} />
        <Toggle label={t('common.flat2d')} checked={settings.flat2D} onChange={settings.setFlat2D} />
        <button type="button" className="btn" onClick={() => void enterFullscreenLandscape()}>
          {t('common.fullscreen')}
        </button>
        <button type="button" className="btn btn-gold" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
