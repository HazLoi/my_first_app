import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SettingsState {
  soundOn: boolean;
  lowGraphics: boolean;
  flat2D: boolean;
  setSoundOn(value: boolean): void;
  setLowGraphics(value: boolean): void;
  setFlat2D(value: boolean): void;
}

/** Máy yếu (ít nhân CPU / ít RAM) mặc định bật đồ họa thấp. */
function detectWeakDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return (navigator.hardwareConcurrency ?? 8) <= 4 || (memory !== undefined && memory <= 2);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundOn: true,
      lowGraphics: detectWeakDevice(),
      flat2D: false,
      setSoundOn: (soundOn) => set({ soundOn }),
      setLowGraphics: (lowGraphics) => set({ lowGraphics }),
      setFlat2D: (flat2D) => set({ flat2D }),
    }),
    { name: 'zp_settings' },
  ),
);
