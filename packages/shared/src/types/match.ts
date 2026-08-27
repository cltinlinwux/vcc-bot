export type MatchStatus = 'waiting' | 'active' | 'finished' | 'cancelled';
export type MatchResult = 'win' | 'loss' | 'draw';

export interface MatchPlayer {
  userId: string;
  username: string;
  displayName: string;
  health: number;
  mana: number;
  deckRemaining: number;
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
