import { Howl } from 'howler';
import { useSettingsStore } from '@/store/settingsStore';

export type SoundName = 'deal' | 'flip' | 'click' | 'tick' | 'win' | 'lose' | 'toast';

const cache = new Map<SoundName, Howl>();

function howl(name: SoundName): Howl {
  let sound = cache.get(name);
  if (!sound) {
    sound = new Howl({ src: [`${import.meta.env.BASE_URL}sounds/${name}.wav`], volume: 0.6, preload: true });
    cache.set(name, sound);
  }
  return sound;
}

/** Phát âm thanh (file placeholder trong public/sounds/); tôn trọng cài đặt bật/tắt. */
export function playSound(name: SoundName): void {
  if (!useSettingsStore.getState().soundOn) return;
  try {
    howl(name).play();
  } catch {
    /* thiết bị chưa cho phép phát âm thanh */
  }
}
