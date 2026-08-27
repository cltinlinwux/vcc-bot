import type { AuthTokens, UserProfile } from './user.js';
import type { CardDefinition, Deck } from './card.js';
import type { LeaderboardEntry, MatchHistoryEntry, MatchState } from './match.js';

export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, string[]>;
}

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
}

export interface CreateDeckRequest {
  name: string;
  cards: { cardId: string; quantity: number }[];
}

export interface JoinQueueResponse {
  matchId: string;
  status: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime: number;
  checks: {
    database: boolean;
  };
}

export type CardsResponse = ApiResponse<CardDefinition[]>;
export type DecksResponse = ApiResponse<Deck[]>;
export type MatchResponse = ApiResponse<MatchState>;
export type LeaderboardResponse = ApiResponse<LeaderboardEntry[]>;
export type HistoryResponse = ApiResponse<MatchHistoryEntry[]>;
