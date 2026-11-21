import gameCatalog from './games.json';

export type GameId = 'xapxam' | 'tienlen';

export interface GameDefinition {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  betLevels: number[];
  enabled: boolean;
  icon: string;
}

export const GAMES = gameCatalog as GameDefinition[];
export const DEFAULT_GAME: GameId = 'xapxam';
export const SELECTED_GAME_STORAGE_KEY = 'zp_selected_game';

export function isGameId(value: unknown): value is GameId {
  return GAMES.some((game) => game.id === value);
}

export function getGame(id: GameId): GameDefinition {
  const game = GAMES.find((item) => item.id === id);
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
}

export function readSelectedGame(): GameId {
  const saved = window.localStorage.getItem(SELECTED_GAME_STORAGE_KEY);
  return isGameId(saved) ? saved : DEFAULT_GAME;
}

export function saveSelectedGame(id: GameId): void {
  window.localStorage.setItem(SELECTED_GAME_STORAGE_KEY, id);
}
