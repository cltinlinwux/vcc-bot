import type { CardElement, CardRarity } from './card.js';

export type MatchStatus = 'waiting' | 'active' | 'finished' | 'cancelled';
export type MatchResult = 'win' | 'loss' | 'draw';

export interface BoardCard {
  instanceId: string;
  cardId: string;
  name: string;
  description: string;
  rarity: CardRarity;
  element: CardElement;
  attack: number;
  defense: number;
  cost: number;
  ability: string | null;
}

export interface MatchPlayer {
  userId: string;
  username: string;
  displayName: string;
  health: number;
  mana: number;
  maxMana: number;
  deckRemaining: number;
  handCount: number;
  field: BoardCard[];
  /** Only populated for the player viewing the state. */
  hand?: BoardCard[];
}

export interface MatchState {
  id: string;
  status: MatchStatus;
  players: [MatchPlayer, MatchPlayer];
  currentTurn: 0 | 1;
  turnNumber: number;
  winnerId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface MatchHistoryEntry {
  id: string;
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  player1RatingChange: number;
  player2RatingChange: number;
  duration: number;
  finishedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
}
