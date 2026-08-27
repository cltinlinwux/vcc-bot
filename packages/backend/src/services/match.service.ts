import { v4 as uuid } from 'uuid';
import { db } from '../db/client.js';
import {
  createMatch,
  applyAction,
  toPublicMatchState,
  toPlayerMatchState,
  calculateRatingChange,
  type InternalMatchState,
  type GameAction,
} from '@vcc/shared';
import type { MatchHistoryEntry, MatchState } from '@vcc/shared';
import { getDefaultDeck } from './deck.service.js';
import { findUserById, updateRating } from './user.service.js';

const activeMatches = new Map<string, InternalMatchState>();
const matchQueue: string[] = [];

export interface MatchFoundEvent {
  matchId: string;
  playerIds: [string, string];
}

export interface QueueJoinResult {
  matched: boolean;
  matchId?: string;
  state?: MatchState;
  playerIds?: [string, string];
}

type MatchFoundListener = (event: MatchFoundEvent) => void;

const matchFoundListeners = new Set<MatchFoundListener>();

/**
 * Register a listener invoked whenever a queue join results in a match,
 * regardless of which transport (REST or WebSocket) triggered it.
 * Returns an unsubscribe function.
 */
export function onMatchFound(listener: MatchFoundListener): () => void {
  matchFoundListeners.add(listener);
  return () => matchFoundListeners.delete(listener);
}

export function joinQueue(userId: string): QueueJoinResult {
  if (matchQueue.includes(userId)) {
    return { matched: false };
  }

  const waiting = matchQueue.find((id) => id !== userId);
  if (waiting) {
    matchQueue.splice(matchQueue.indexOf(waiting), 1);
    const match = startMatch(waiting, userId);
    const event: MatchFoundEvent = { matchId: match.id, playerIds: [waiting, userId] };
    for (const listener of matchFoundListeners) {
      listener(event);
    }
    return {
      matched: true,
      matchId: match.id,
      state: toPublicMatchState(match),
      playerIds: event.playerIds,
    };
  }

  matchQueue.push(userId);
  return { matched: false };
}

export function leaveQueue(userId: string): void {
  const idx = matchQueue.indexOf(userId);
  if (idx !== -1) matchQueue.splice(idx, 1);
}

function startMatch(player1Id: string, player2Id: string): InternalMatchState {
  const p1 = findUserById(player1Id);
  const p2 = findUserById(player2Id);
  if (!p1 || !p2) throw new Error('Player not found');

  const deck1 = getDefaultDeck(player1Id);
  const deck2 = getDefaultDeck(player2Id);
  if (!deck1 || !deck2) throw new Error('Player missing deck');

  const matchId = uuid();
  const state = createMatch(
    matchId,
    { userId: p1.id, username: p1.username, displayName: p1.displayName, deck: deck1.cards },
    { userId: p2.id, username: p2.username, displayName: p2.displayName, deck: deck2.cards },
  );

  activeMatches.set(matchId, state);

  db.prepare(`
    INSERT INTO matches (id, player1_id, player2_id, state_json, status, started_at, created_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(matchId, player1Id, player2Id, JSON.stringify(state), state.startedAt, new Date().toISOString());

  return state;
}

export function getMatch(matchId: string): InternalMatchState | null {
  return activeMatches.get(matchId) ?? null;
}

export function getPlayerMatch(matchId: string, viewerUserId: string): MatchState | null {
  const state = activeMatches.get(matchId);
  return state ? toPlayerMatchState(state, viewerUserId) : null;
}

export function performAction(matchId: string, userId: string, action: GameAction): InternalMatchState {
  const state = activeMatches.get(matchId);
  if (!state) throw new Error('Match not found');

  const updated = applyAction(state, userId, action);
  activeMatches.set(matchId, updated);

  db.prepare('UPDATE matches SET state_json = ?, status = ? WHERE id = ?').run(
    JSON.stringify(updated),
    updated.status,
    matchId,
  );

  if (updated.status === 'finished' && updated.winnerId) {
    finalizeMatch(updated);
  }

  return updated;
}

function finalizeMatch(state: InternalMatchState): void {
  const p1 = findUserById(state.players[0].userId);
  const p2 = findUserById(state.players[1].userId);
  if (!p1 || !p2) return;

  const isDraw = !state.winnerId;
  const { winnerChange, loserChange } = isDraw
    ? calculateRatingChange(p1.rating, p2.rating, true)
    : state.winnerId === p1.id
      ? calculateRatingChange(p1.rating, p2.rating)
      : calculateRatingChange(p2.rating, p1.rating);

  const p1Change = isDraw ? winnerChange : state.winnerId === p1.id ? winnerChange : loserChange;
  const p2Change = isDraw ? loserChange : state.winnerId === p2.id ? winnerChange : loserChange;

  updateRating(p1.id, p1Change, isDraw ? 'draw' : state.winnerId === p1.id ? 'win' : 'loss');
  updateRating(p2.id, p2Change, isDraw ? 'draw' : state.winnerId === p2.id ? 'win' : 'loss');

  db.prepare(`
    UPDATE matches SET winner_id = ?, finished_at = ?, player1_rating_change = ?, player2_rating_change = ?, status = 'finished'
    WHERE id = ?
  `).run(state.winnerId, state.finishedAt, p1Change, p2Change, state.id);

  activeMatches.delete(state.id);
}

export function getMatchHistory(userId: string, limit = 20): MatchHistoryEntry[] {
  const rows = db.prepare(`
    SELECT id, player1_id, player2_id, winner_id, player1_rating_change, player2_rating_change, started_at, finished_at
    FROM matches
    WHERE (player1_id = ? OR player2_id = ?) AND status = 'finished'
    ORDER BY finished_at DESC LIMIT ?
  `).all(userId, userId, limit) as {
    id: string;
    player1_id: string;
    player2_id: string;
    winner_id: string | null;
    player1_rating_change: number;
    player2_rating_change: number;
    started_at: string;
    finished_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    player1Id: r.player1_id,
    player2Id: r.player2_id,
    winnerId: r.winner_id,
    player1RatingChange: r.player1_rating_change,
    player2RatingChange: r.player2_rating_change,
    duration: new Date(r.finished_at).getTime() - new Date(r.started_at).getTime(),
    finishedAt: r.finished_at,
  }));
}

export function getQueueSize(): number {
  return matchQueue.length;
}
