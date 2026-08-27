import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { WS_EVENTS } from '@vcc/shared';
import type { BoardCard, MatchState } from '@vcc/shared';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

const elementBorder: Record<string, string> = {
  fire: 'border-vcc-fire',
  water: 'border-vcc-water',
  earth: 'border-vcc-earth',
  air: 'border-vcc-air',
  neutral: 'border-vcc-neutral',
};

function CardTile({
  card,
  onClick,
  selected,
  disabled,
  small,
}: {
  card: BoardCard;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const border = elementBorder[card.element] ?? 'border-vcc-border';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`text-left rounded-lg border-2 ${border} bg-vcc-surface transition-all ${
        small ? 'p-2 min-w-[100px]' : 'p-3 min-w-[140px]'
      } ${selected ? 'ring-2 ring-vcc-gold scale-105' : 'hover:scale-[1.02]'} ${
        disabled ? 'opacity-50 cursor-not-allowed' : onClick ? 'cursor-pointer' : ''
      }`}
    >
      <p className={`font-display font-bold truncate ${small ? 'text-xs' : 'text-sm'}`}>{card.name}</p>
      <div className={`flex gap-2 mt-1 ${small ? 'text-[10px]' : 'text-xs'} text-vcc-muted`}>
        <span>C{card.cost}</span>
        <span className="text-vcc-fire">A{card.attack}</span>
        <span className="text-vcc-water">D{card.defense}</span>
      </div>
    </button>
  );
}

export function PlayPage() {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'idle' | 'queued' | 'matched'>('idle');
  const [match, setMatch] = useState<MatchState | null>(null);
  const [error, setError] = useState('');
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedAttacker, setSelectedAttacker] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const s = io(WS_URL, { auth: { token } });
    setSocket(s);

    s.on(WS_EVENTS.QUEUE_JOIN, () => setStatus('queued'));
    s.on(WS_EVENTS.QUEUE_MATCHED, (data: { matchId: string; state: MatchState }) => {
      setStatus('matched');
      setMatch(data.state);
      setSelectedCard(null);
      setSelectedAttacker(null);
    });
    s.on(WS_EVENTS.MATCH_STATE, (state: MatchState) => {
      setMatch(state);
      setSelectedCard(null);
      setSelectedAttacker(null);
    });
    s.on(WS_EVENTS.MATCH_RESULT, (state: MatchState) => setMatch(state));
    s.on(WS_EVENTS.ERROR, (data: { message: string }) => setError(data.message));

    return () => { s.disconnect(); };
  }, [token]);

  const myIdx = match?.players.findIndex((p) => p.userId === user?.id) ?? -1;
  const oppIdx = myIdx === 0 ? 1 : 0;
  const me = myIdx >= 0 ? match?.players[myIdx as 0 | 1] : null;
  const opponent = myIdx >= 0 ? match?.players[oppIdx as 0 | 1] : null;
  const isMyTurn = match?.status === 'active' && match.currentTurn === myIdx;

  const sendAction = useCallback((action: { type: string; cardInstanceId?: string; targetInstanceId?: string; attackerInstanceId?: string }) => {
    if (!match || !socket) return;
    setError('');
    socket.emit(WS_EVENTS.MATCH_ACTION, { matchId: match.id, action });
  }, [match, socket]);

  const joinQueue = () => {
    setError('');
    socket?.emit(WS_EVENTS.QUEUE_JOIN);
    setStatus('queued');
  };

  const leaveQueue = () => {
    socket?.emit(WS_EVENTS.QUEUE_LEAVE);
    setStatus('idle');
  };

  const playSelectedCard = () => {
    if (!selectedCard) return;
    sendAction({ type: 'play_card', cardInstanceId: selectedCard });
  };

  const handleFieldClick = (targetInstanceId?: string) => {
    if (selectedAttacker) {
      sendAction({ type: 'attack', attackerInstanceId: selectedAttacker, targetInstanceId });
      return;
    }
    if (selectedCard) playSelectedCard();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 animate-fade-in">
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

      {match && me && opponent && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-sm text-vcc-muted">
            <span>Turn {match.turnNumber}</span>
            <span className={match.status === 'finished' ? 'text-vcc-gold' : 'text-green-400'}>
              {match.status === 'finished' ? 'Finished' : isMyTurn ? 'Your turn' : "Opponent's turn"}
            </span>
          </div>

          {/* Opponent */}
          <div className="card-surface">
            <div className="flex justify-between mb-3">
              <h3 className="font-display font-bold">{opponent.displayName}</h3>
              <div className="flex gap-4 text-sm">
                <span>HP <strong className="text-vcc-fire">{opponent.health}</strong></span>
                <span>Mana <strong className="text-vcc-water">{opponent.mana}</strong></span>
                <span>Deck {opponent.deckRemaining}</span>
                <span>Hand {opponent.handCount}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 min-h-[60px]">
              {opponent.field.length === 0 ? (
                <button
                  type="button"
                  onClick={() => isMyTurn && selectedAttacker && handleFieldClick()}
                  className="flex-1 min-h-[60px] border border-dashed border-vcc-border rounded-lg text-vcc-muted text-sm hover:border-vcc-fire/50"
                  disabled={!isMyTurn || !selectedAttacker}
                >
                  {isMyTurn && selectedAttacker ? 'Attack face' : 'Empty field'}
                </button>
              ) : (
                opponent.field.map((card) => (
                  <CardTile
                    key={card.instanceId}
                    card={card}
                    small
                    onClick={isMyTurn && selectedAttacker ? () => handleFieldClick(card.instanceId) : undefined}
                  />
                ))
              )}
            </div>
          </div>

          {/* Player */}
          <div className={`card-surface ${isMyTurn ? 'border-vcc-gold/50' : ''}`}>
            <div className="flex justify-between mb-3">
              <h3 className="font-display font-bold">{me.displayName} <span className="text-xs text-vcc-gold">(You)</span></h3>
              <div className="flex gap-4 text-sm">
                <span>HP <strong className="text-vcc-fire">{me.health}</strong></span>
                <span>Mana <strong className="text-vcc-water">{me.mana}/{me.maxMana}</strong></span>
                <span>Deck {me.deckRemaining}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 min-h-[60px] mb-4">
              {me.field.map((card) => (
                <CardTile
                  key={card.instanceId}
                  card={card}
                  small
                  selected={selectedAttacker === card.instanceId}
                  onClick={isMyTurn ? () => setSelectedAttacker(selectedAttacker === card.instanceId ? null : card.instanceId) : undefined}
                />
              ))}
            </div>

            <p className="text-xs text-vcc-muted mb-2">Your hand</p>
            <div className="flex flex-wrap gap-2">
              {(me.hand ?? []).map((card) => (
                <CardTile
                  key={card.instanceId}
                  card={card}
                  selected={selectedCard === card.instanceId}
                  disabled={!isMyTurn || me.mana < card.cost}
                  onClick={isMyTurn && me.mana >= card.cost ? () => setSelectedCard(selectedCard === card.instanceId ? null : card.instanceId) : undefined}
                />
              ))}
            </div>

            {isMyTurn && match.status === 'active' && (
              <div className="flex gap-3 mt-4">
                {selectedCard && (
                  <button onClick={playSelectedCard} className="btn-primary flex-1">Play Card</button>
                )}
                <button onClick={() => sendAction({ type: 'end_turn' })} className="btn-secondary flex-1">End Turn</button>
              </div>
            )}
          </div>

          {match.status === 'finished' && (
            <div className="text-center py-4">
              <p className="font-display text-2xl font-bold text-vcc-gold mb-4">
                {match.winnerId === user?.id ? 'Victory!' : 'Defeat'}
              </p>
              <button onClick={() => { setMatch(null); setStatus('idle'); }} className="btn-secondary">Play Again</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
