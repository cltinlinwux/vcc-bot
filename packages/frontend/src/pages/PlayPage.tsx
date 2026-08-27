import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { WS_EVENTS } from '@vcc/shared';
import type { MatchState } from '@vcc/shared';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

export function PlayPage() {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'idle' | 'queued' | 'matched'>('idle');
  const [match, setMatch] = useState<MatchState | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    const s = io(WS_URL, { auth: { token } });
    setSocket(s);

    s.on(WS_EVENTS.QUEUE_JOIN, () => setStatus('queued'));
    s.on(WS_EVENTS.QUEUE_MATCHED, (data: { matchId: string; state: MatchState }) => {
      setStatus('matched');
      setMatch(data.state);
    });
    s.on(WS_EVENTS.MATCH_STATE, (state: MatchState) => setMatch(state));
    s.on(WS_EVENTS.MATCH_RESULT, (state: MatchState) => setMatch(state));
    s.on(WS_EVENTS.ERROR, (data: { message: string }) => setError(data.message));

    return () => { s.disconnect(); };
  }, [token]);

  const joinQueue = () => {
    setError('');
    socket?.emit(WS_EVENTS.QUEUE_JOIN);
    setStatus('queued');
  };

  const leaveQueue = () => {
    socket?.emit(WS_EVENTS.QUEUE_LEAVE);
    setStatus('idle');
  };

  const endTurn = () => {
    if (!match) return;
    socket?.emit(WS_EVENTS.MATCH_ACTION, { matchId: match.id, action: { type: 'end_turn' } });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-8">Arena</h1>

      {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">{error}</div>}

      {!match && (
        <div className="card-surface text-center py-16">
          {status === 'idle' && (
            <>
              <p className="text-vcc-muted mb-6">Find an opponent for ranked PvP</p>
              <button onClick={joinQueue} className="btn-primary text-lg">Find Match</button>
            </>
          )}
          {status === 'queued' && (
            <>
              <div className="animate-pulse-glow w-20 h-20 rounded-full bg-vcc-gold/20 border-2 border-vcc-gold mx-auto mb-6" />
              <p className="text-vcc-muted mb-4">Searching for opponent...</p>
              <button onClick={leaveQueue} className="btn-secondary">Cancel</button>
            </>
          )}
        </div>
      )}

      {match && (
        <div className="space-y-6">
          <div className="card-surface">
            <div className="flex justify-between items-center mb-4">
              <span className="text-vcc-muted">Turn {match.turnNumber}</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                match.status === 'finished' ? 'bg-vcc-gold/20 text-vcc-gold' : 'bg-green-500/20 text-green-400'
              }`}>
                {match.status === 'finished' ? 'Finished' : 'In Progress'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {match.players.map((player, idx) => (
                <div
                  key={player.userId}
                  className={`p-4 rounded-lg border ${
                    match.currentTurn === idx && match.status === 'active'
                      ? 'border-vcc-gold bg-vcc-gold/5'
                      : 'border-vcc-border'
                  }`}
                >
                  <h3 className="font-display font-bold">{player.displayName}</h3>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div><span className="text-vcc-muted">HP</span> <span className="text-vcc-fire font-bold">{player.health}</span></div>
                    <div><span className="text-vcc-muted">Mana</span> <span className="text-vcc-water font-bold">{player.mana}</span></div>
                    <div><span className="text-vcc-muted">Deck</span> <span>{player.deckRemaining}</span></div>
                  </div>
                  {player.userId === user?.id && <span className="text-xs text-vcc-gold mt-1 block">You</span>}
                </div>
              ))}
            </div>

            {match.status === 'active' && match.players[match.currentTurn]?.userId === user?.id && (
              <button onClick={endTurn} className="btn-primary mt-6 w-full">End Turn</button>
            )}

            {match.status === 'finished' && (
              <div className="mt-6 text-center">
                <p className="font-display text-xl font-bold text-vcc-gold mb-4">
                  {match.winnerId === user?.id ? 'Victory!' : 'Defeat'}
                </p>
                <button onClick={() => { setMatch(null); setStatus('idle'); }} className="btn-secondary">
                  Play Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
