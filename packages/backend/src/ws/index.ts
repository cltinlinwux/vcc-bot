import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { verifyToken } from '../middleware/auth.js';
import { WS_EVENTS } from '@vcc/shared';
import { toPlayerMatchState } from '@vcc/shared';
import {
  joinQueue,
  leaveQueue,
  getMatch,
  getPlayerMatch,
  performAction,
  onMatchFound,
} from '../services/match.service.js';
import type { GameAction } from '@vcc/shared';

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function emitMatchToPlayers(io: Server, matchId: string): void {
  const internal = getMatch(matchId);
  if (!internal) return;

  for (const player of internal.players) {
    const state = toPlayerMatchState(internal, player.userId);
    io.to(userRoom(player.userId)).emit(WS_EVENTS.MATCH_STATE, state);
    if (state.status === 'finished') {
      io.to(userRoom(player.userId)).emit(WS_EVENTS.MATCH_RESULT, state);
    }
  }
}

export function setupWebSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  onMatchFound(({ matchId, playerIds }) => {
    for (const playerId of playerIds) {
      io.in(userRoom(playerId)).socketsJoin(matchId);
      const state = getPlayerMatch(matchId, playerId);
      if (state) {
        io.to(userRoom(playerId)).emit(WS_EVENTS.QUEUE_MATCHED, { matchId, state });
        io.to(userRoom(playerId)).emit(WS_EVENTS.MATCH_STATE, state);
      }
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    try {
      socket.data.auth = verifyToken(token);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.auth.userId as string;
    socket.join(userRoom(userId));

    socket.on(WS_EVENTS.QUEUE_JOIN, () => {
      const result = joinQueue(userId);
      if (!result.matched) {
        socket.emit(WS_EVENTS.QUEUE_JOIN, { queued: true });
      }
    });

    socket.on(WS_EVENTS.QUEUE_LEAVE, () => {
      leaveQueue(userId);
      socket.emit(WS_EVENTS.QUEUE_LEAVE, { left: true });
    });

    socket.on(WS_EVENTS.MATCH_JOIN, (matchId: string) => {
      const state = getPlayerMatch(matchId, userId);
      if (!state) {
        socket.emit(WS_EVENTS.ERROR, { message: 'Match not found' });
        return;
      }
      const isPlayer = state.players.some((p) => p.userId === userId);
      if (!isPlayer) {
        socket.emit(WS_EVENTS.ERROR, { message: 'Not a match participant' });
        return;
      }
      socket.join(matchId);
      socket.emit(WS_EVENTS.MATCH_STATE, state);
    });

    socket.on(WS_EVENTS.MATCH_ACTION, (payload: { matchId: string; action: GameAction }) => {
      try {
        performAction(payload.matchId, userId, payload.action);
        emitMatchToPlayers(io, payload.matchId);
      } catch (err) {
        socket.emit(WS_EVENTS.ERROR, { message: (err as Error).message });
      }
    });

    socket.on('disconnect', () => {
      const remaining = io.sockets.adapter.rooms.get(userRoom(userId));
      if (!remaining || remaining.size === 0) {
        leaveQueue(userId);
      }
    });
  });

  return io;
}
