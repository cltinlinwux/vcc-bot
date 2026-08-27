import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { verifyToken } from '../middleware/auth.js';
import { WS_EVENTS } from '@vcc/shared';
import { joinQueue, leaveQueue, getPublicMatch, performAction } from '../services/match.service.js';
import type { GameAction } from '@vcc/shared';

export function setupWebSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
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

    socket.on(WS_EVENTS.QUEUE_JOIN, () => {
      const result = joinQueue(userId);
      if (result.matched && result.matchId && result.state) {
        socket.join(result.matchId);
        io.to(result.matchId).emit(WS_EVENTS.QUEUE_MATCHED, { matchId: result.matchId, state: result.state });
        io.to(result.matchId).emit(WS_EVENTS.MATCH_STATE, result.state);
      } else {
        socket.emit(WS_EVENTS.QUEUE_JOIN, { queued: true });
      }
    });

    socket.on(WS_EVENTS.QUEUE_LEAVE, () => {
      leaveQueue(userId);
      socket.emit(WS_EVENTS.QUEUE_LEAVE, { left: true });
    });

    socket.on(WS_EVENTS.MATCH_JOIN, (matchId: string) => {
      const state = getPublicMatch(matchId);
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
        const state = performAction(payload.matchId, userId, payload.action);
        io.to(payload.matchId).emit(WS_EVENTS.MATCH_STATE, state);
        if (state.status === 'finished') {
          io.to(payload.matchId).emit(WS_EVENTS.MATCH_RESULT, state);
        }
      } catch (err) {
        socket.emit(WS_EVENTS.ERROR, { message: (err as Error).message });
      }
    });

    socket.on('disconnect', () => {
      leaveQueue(userId);
    });
  });

  return io;
}
