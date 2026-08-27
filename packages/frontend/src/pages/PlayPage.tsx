import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { WS_EVENTS } from '@vcc/shared';
import type { BoardCard, GameAction, MatchPlayer, MatchState } from '@vcc/shared';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

const MAX_FIELD_SIZE = 5;

const elementBorders: Record<string, string> = {
  fire: 'border-vcc-fire',
  water: 'border-vcc-water',
  earth: 'border-vcc-earth',
  air: 'border-vcc-air',
  neutral: 'border-vcc-neutral',
};

interface HandCardViewProps {
  card: BoardCard;
  playable: boolean;
  onPlay: () => void;
}

function HandCardView({ card, playable, onPlay }: HandCardViewProps) {
  return (
    <button
      type="button"
      disabled={!playable}
      onClick={onPlay}
      title={card.ability ? `${card.description} — ${card.ability}` : card.description}
      className={`relative w-40 shrink-0 p-3 rounded-lg border-2 bg-vcc-card text-left transition-all duration-150 ${
        elementBorders[card.element] ?? 'border-vcc-border'
      } ${
        playable
          ? 'cursor-pointer hover:-translate-y-2 hover:shadow-xl hover:shadow-vcc-gold/20'
          : 'opacity-50 cursor-not-allowed'
      }`}
    >
      <span
        className={`absolute -top-2.5 -left-2.5 w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold border-2 bg-vcc-bg ${
          playable ? 'text-vcc-water border-vcc-water' : 'text-vcc-muted border-vcc-border'
        }`}
      >
        {card.cost}
      </span>
      <p className="font-display text-sm font-bold truncate pl-2">{card.name}</p>
      <p className="text-xs text-vcc-muted mt-1 line-clamp-2 h-8">{card.description}</p>
      <div className="mt-2 flex justify-between text-sm font-bold">
        <span className="text-vcc-fire">{card.attack} ATK</span>
        <span className="text-green-400">{card.defense} DEF</span>
      </div>
      {card.ability && <p className="mt-1 text-[10px] text-vcc-gold/80 italic truncate">{card.ability}</p>}
    </button>
  );
}

interface FieldCardViewProps {
  card: BoardCard;
  selected?: boolean;
  clickable?: boolean;
  targetable?: boolean;
  onClick?: () => void;
}

function FieldCardView({ card, selected = false, clickable = false, targetable = false, onClick }: FieldCardViewProps) {
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      title={card.ability ? `${card.description} — ${card.ability}` : card.description}
      className={`w-full p-3 rounded-lg border-2 bg-vcc-surface text-left transition-all duration-150 ${
        elementBorders[card.element] ?? 'border-vcc-border'
      } ${selected ? 'ring-2 ring-vcc-gold shadow-lg shadow-vcc-gold/30 -translate-y-1' : ''} ${
        targetable ? 'ring-2 ring-red-500/70 hover:ring-red-400 hover:shadow-lg hover:shadow-red-500/20' : ''
      } ${clickable ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'}`}
    >
      <p className="font-display text-xs font-bold truncate">{card.name}</p>
      <div className="mt-2 flex justify-between text-sm font-bold">
        <span className="text-vcc-fire">{card.attack}</span>
        <span className="text-green-400">{card.defense}</span>
      </div>
    </button>
  );
}

interface FieldRowProps {
  cards: BoardCard[];
  selectedId?: string | null;
  clickable?: boolean;
  targetable?: boolean;
  onCardClick?: (card: BoardCard) => void;
}

function FieldRow({ cards, selectedId = null, clickable = false, targetable = false, onCardClick }: FieldRowProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {cards.map((card) => (
        <FieldCardView
          key={card.instanceId}
          card={card}
          selected={card.instanceId === selectedId}
          clickable={clickable}
          targetable={targetable}
          onClick={() => onCardClick?.(card)}
        />
      ))}
      {Array.from({ length: MAX_FIELD_SIZE - cards.length }).map((_, i) => (
        <div key={`empty-${i}`} className="min-h-[72px] rounded-lg border-2 border-dashed border-vcc-border/40" />
      ))}
    </div>
  );
}

interface PlayerPanelProps {
  player: MatchPlayer;
  isTurn: boolean;
  isYou: boolean;
  canBeAttacked?: boolean;
  onAttack?: () => void;
}

function PlayerPanel({ player, isTurn, isYou, canBeAttacked = false, onAttack }: PlayerPanelProps) {
  return (
    <div
      className={`p-4 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
        isTurn ? 'border-vcc-gold bg-vcc-gold/5' : 'border-vcc-border'
      }`}
    >
      <div>
        <h3 className="font-display font-bold">
          {player.displayName}
          {isYou && <span className="ml-2 text-xs text-vcc-gold font-body">You</span>}
        </h3>
        <div className="mt-1 flex gap-4 text-sm">
          <span><span className="text-vcc-muted">HP</span> <span className="text-vcc-fire font-bold">{player.health}</span></span>
          <span><span className="text-vcc-muted">Mana</span> <span className="text-vcc-water font-bold">{player.mana}/{player.maxMana}</span></span>
          <span><span className="text-vcc-muted">Deck</span> {player.deckRemaining}</span>
          <span><span className="text-vcc-muted">Hand</span> {player.handCount}</span>
        </div>
      </div>
      {canBeAttacked && (
        <button
          onClick={onAttack}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/10 border border-red-500/50 text-red-400
                     hover:bg-red-500/20 hover:border-red-400 transition-colors"
        >
          Attack Directly
        </button>
      )}
    </div>
  );
}

export function PlayPage() {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'idle' | 'queued' | 'matched'>('idle');
  const [match, setMatch] = useState<MatchState | null>(null);
  const [error, setError] = useState('');
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);

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
    s.on('connect_error', (err) => setError(err.message));

    return () => { s.disconnect(); };
  }, [token]);

  const me = match?.players.find((p) => p.userId === user?.id) ?? null;
  const opponent = match?.players.find((p) => p.userId !== user?.id) ?? null;
  const isMyTurn =
    !!match && match.status === 'active' && match.players[match.currentTurn]?.userId === user?.id;

  // Drop a stale attacker selection when the card leaves the field or the turn passes.
  useEffect(() => {
    if (!selectedAttackerId) return;
    if (!isMyTurn || !me?.field.some((c) => c.instanceId === selectedAttackerId)) {
      setSelectedAttackerId(null);
    }
  }, [match, isMyTurn, me, selectedAttackerId]);

  const joinQueue = () => {
    setError('');
    socket?.emit(WS_EVENTS.QUEUE_JOIN);
    setStatus('queued');
  };

  const leaveQueue = () => {
    socket?.emit(WS_EVENTS.QUEUE_LEAVE);
    setStatus('idle');
  };

  const sendAction = (action: GameAction) => {
    if (!match) return;
    setError('');
    socket?.emit(WS_EVENTS.MATCH_ACTION, { matchId: match.id, action });
  };

  const playCard = (card: BoardCard) => {
    sendAction({ type: 'play_card', cardInstanceId: card.instanceId });
  };

  const toggleAttacker = (card: BoardCard) => {
    setSelectedAttackerId((current) => (current === card.instanceId ? null : card.instanceId));
  };

  const attackTarget = (targetInstanceId?: string) => {
    if (!selectedAttackerId) return;
    sendAction({ type: 'attack', attackerInstanceId: selectedAttackerId, targetInstanceId });
    setSelectedAttackerId(null);
  };

  const canPlay = (card: BoardCard) =>
    isMyTurn && !!me && me.mana >= card.cost && me.field.length < MAX_FIELD_SIZE;

  const resetToIdle = () => {
    setMatch(null);
    setStatus('idle');
    setSelectedAttackerId(null);
    setError('');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-8">Arena</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 flex justify-between items-center gap-4">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400/70 hover:text-red-300 font-bold" aria-label="Dismiss error">
            &times;
          </button>
        </div>
      )}

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
        <div className="card-surface space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-vcc-muted">Turn {match.turnNumber}</span>
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  match.status === 'finished'
                    ? 'bg-vcc-gold/20 text-vcc-gold'
                    : isMyTurn
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-vcc-surface text-vcc-muted'
                }`}
              >
                {match.status === 'finished' ? 'Finished' : isMyTurn ? 'Your Turn' : "Opponent's Turn"}
              </span>
              {isMyTurn && (
                <button onClick={() => sendAction({ type: 'end_turn' })} className="btn-primary !px-4 !py-2 text-sm">
                  End Turn
                </button>
              )}
            </div>
          </div>

          <PlayerPanel
            player={opponent}
            isTurn={match.status === 'active' && !isMyTurn}
            isYou={false}
            canBeAttacked={isMyTurn && !!selectedAttackerId}
            onAttack={() => attackTarget()}
          />

          <FieldRow
            cards={opponent.field}
            clickable={isMyTurn && !!selectedAttackerId}
            targetable={isMyTurn && !!selectedAttackerId}
            onCardClick={(card) => attackTarget(card.instanceId)}
          />

          <div className="border-t border-vcc-border" />

          <FieldRow
            cards={me.field}
            selectedId={selectedAttackerId}
            clickable={isMyTurn}
            onCardClick={toggleAttacker}
          />

          <PlayerPanel player={me} isTurn={isMyTurn} isYou />

          {match.status === 'active' && (
            <>
              <p className="text-xs text-vcc-muted">
                {!isMyTurn
                  ? 'Waiting for your opponent to move...'
                  : selectedAttackerId
                    ? 'Choose a target: click an enemy card or attack the opponent directly.'
                    : 'Click a hand card to play it, or one of your field cards to attack.'}
              </p>
              <div className="flex gap-3 overflow-x-auto pt-3 pb-1">
                {(me.hand ?? []).map((card) => (
                  <HandCardView
                    key={card.instanceId}
                    card={card}
                    playable={canPlay(card)}
                    onPlay={() => playCard(card)}
                  />
                ))}
                {(me.hand ?? []).length === 0 && (
                  <p className="text-sm text-vcc-muted py-4">Your hand is empty.</p>
                )}
              </div>
            </>
          )}

          {match.status === 'finished' && (
            <div className="text-center py-4">
              <p className="font-display text-xl font-bold text-vcc-gold mb-4">
                {match.winnerId === user?.id ? 'Victory!' : 'Defeat'}
              </p>
              <button onClick={resetToIdle} className="btn-secondary">Play Again</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
