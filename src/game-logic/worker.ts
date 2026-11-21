import { suggestArrangements } from './suggest';
import type { Card } from './types';

interface Request {
  id: number;
  cards: Card[];
  limit: number;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, cards, limit } = event.data;
  try {
    self.postMessage({ id, suggestions: suggestArrangements(cards, limit) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
