import type { Card } from './types';
import { suggestArrangements, type Suggestion } from './suggest';

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve(value: Suggestion[]): void; reject(reason: unknown): void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined') return worker;
  try {
    const created = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    created.onmessage = (event: MessageEvent<{ id: number; suggestions?: Suggestion[]; error?: string }>) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      pending.delete(event.data.id);
      if (event.data.suggestions) entry.resolve(event.data.suggestions);
      else entry.reject(new Error(event.data.error ?? 'worker error'));
    };
    created.onerror = () => {
      // Worker hỏng: từ lần sau dùng phương án đồng bộ.
      for (const entry of pending.values()) entry.reject(new Error('worker failed'));
      pending.clear();
      created.terminate();
      worker = null;
    };
    worker = created;
  } catch {
    worker = null;
  }
  return worker;
}

/** Gợi ý xếp bài chạy trong Web Worker (không giật UI); không có Worker thì chạy đồng bộ ở tick sau. */
export function suggestAsync(cards: readonly Card[], limit = 5): Promise<Suggestion[]> {
  const active = getWorker();
  if (!active) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(suggestArrangements(cards, limit));
        } catch (error) {
          reject(error);
        }
      }, 0);
    });
  }
  return new Promise<Suggestion[]>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    active.postMessage({ id, cards, limit });
  }).catch(() => suggestArrangements(cards, limit));
}
