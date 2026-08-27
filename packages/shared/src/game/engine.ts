import {
  DECK_SIZE,
  HAND_SIZE,
  MAX_COPIES_PER_CARD,
  MAX_MANA,
  STARTING_HEALTH,
  STARTING_MANA,
} from '../types/card.js';
import { getCard, CARD_MAP } from './cards.js';
import type { CardDefinition } from '../types/card.js';
import type { MatchPlayer, MatchState, MatchStatus } from '../types/match.js';

export interface GameCard {
  instanceId: string;
  cardId: string;
  definition: CardDefinition;
}

export interface PlayerState {
  userId: string;
  username: string;
  displayName: string;
  health: number;
  mana: number;
  maxMana: number;
  deck: GameCard[];
  hand: GameCard[];
  field: GameCard[];
  graveyard: GameCard[];
}

export interface InternalMatchState {
  id: string;
  status: MatchStatus;
  players: [PlayerState, PlayerState];
  currentTurn: 0 | 1;
  turnNumber: number;
  winnerId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  actionLog: string[];
}

export type GameAction =
  | { type: 'play_card'; cardInstanceId: string; targetSlot?: number }
  | { type: 'attack'; attackerInstanceId: string; targetInstanceId?: string }
  | { type: 'end_turn' };

let instanceCounter = 0;

function nextInstanceId(): string {
  instanceCounter += 1;
  return `inst_${instanceCounter}_${Date.now()}`;
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function validateDeck(cards: { cardId: string; quantity: number }[]): string | null {
  let total = 0;
  for (const entry of cards) {
    if (!getCard(entry.cardId)) {
      return `Unknown card: ${entry.cardId}`;
    }
    if (entry.quantity < 1 || entry.quantity > MAX_COPIES_PER_CARD) {
      return `Invalid quantity for ${entry.cardId}: max ${MAX_COPIES_PER_CARD}`;
    }
    total += entry.quantity;
  }
  if (total !== DECK_SIZE) {
    return `Deck must contain exactly ${DECK_SIZE} cards (has ${total})`;
  }
  return null;
}

function buildDeck(cards: { cardId: string; quantity: number }[]): GameCard[] {
  const deck: GameCard[] = [];
  for (const entry of cards) {
    const definition = CARD_MAP.get(entry.cardId);
    if (!definition) continue;
    for (let i = 0; i < entry.quantity; i += 1) {
      deck.push({
        instanceId: nextInstanceId(),
        cardId: entry.cardId,
        definition,
      });
    }
  }
  return shuffle(deck);
}

export function createMatch(
  matchId: string,
  player1: { userId: string; username: string; displayName: string; deck: { cardId: string; quantity: number }[] },
  player2: { userId: string; username: string; displayName: string; deck: { cardId: string; quantity: number }[] },
): InternalMatchState {
  const p1Deck = buildDeck(player1.deck);
  const p2Deck = buildDeck(player2.deck);

  const drawCards = (deck: GameCard[], count: number): [GameCard[], GameCard[]] => {
    const hand = deck.slice(0, count);
    const remaining = deck.slice(count);
    return [hand, remaining];
  };

  const [p1Hand, p1Remaining] = drawCards(p1Deck, HAND_SIZE);
  const [p2Hand, p2Remaining] = drawCards(p2Deck, HAND_SIZE);

  return {
    id: matchId,
    status: 'active',
    players: [
      {
        userId: player1.userId,
        username: player1.username,
        displayName: player1.displayName,
        health: STARTING_HEALTH,
        mana: STARTING_MANA,
        maxMana: STARTING_MANA,
        deck: p1Remaining,
        hand: p1Hand,
        field: [],
        graveyard: [],
      },
      {
        userId: player2.userId,
        username: player2.username,
        displayName: player2.displayName,
        health: STARTING_HEALTH,
        mana: STARTING_MANA,
        maxMana: STARTING_MANA,
        deck: p2Remaining,
        hand: p2Hand,
        field: [],
        graveyard: [],
      },
    ],
    currentTurn: Math.random() < 0.5 ? 0 : 1,
    turnNumber: 1,
    winnerId: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    actionLog: ['Match started'],
  };
}

function checkWinner(state: InternalMatchState): string | null {
  for (const player of state.players) {
    if (player.health <= 0) {
      return state.players.find((p) => p.health > 0)?.userId ?? null;
    }
    if (player.deck.length === 0 && player.hand.length === 0 && player.field.length === 0) {
      return state.players.find((p) => p !== player)?.userId ?? null;
    }
  }
  return null;
}

function startNextTurn(state: InternalMatchState): void {
  const next = state.currentTurn;
  const player = state.players[next];
  player.maxMana = Math.min(player.maxMana + 1, MAX_MANA);
  player.mana = player.maxMana;

  if (player.deck.length > 0) {
    const drawn = player.deck.shift();
    if (drawn) player.hand.push(drawn);
  }

  state.actionLog.push(`Turn ${state.turnNumber}: ${player.displayName}'s turn`);
}

function applyCardAbility(state: InternalMatchState, playerIdx: 0 | 1, card: GameCard): void {
  const opponent = state.players[playerIdx === 0 ? 1 : 0];
  const player = state.players[playerIdx];

  switch (card.cardId) {
    case 'flame-drake':
      opponent.health -= 1;
      state.actionLog.push(`${card.definition.name} deals 1 damage to ${opponent.displayName}`);
      break;
    case 'abyssal-leviathan':
      player.health = Math.min(player.health + 3, STARTING_HEALTH);
      state.actionLog.push(`${card.definition.name} heals ${player.displayName} for 3`);
      break;
    default:
      break;
  }
}

export function applyAction(state: InternalMatchState, userId: string, action: GameAction): InternalMatchState {
  if (state.status !== 'active') {
    throw new Error('Match is not active');
  }

  const playerIdx = state.players[0].userId === userId ? 0 : state.players[1].userId === userId ? 1 : -1;
  if (playerIdx === -1) throw new Error('Player not in match');
  if (playerIdx !== state.currentTurn) throw new Error('Not your turn');

  const player = state.players[playerIdx as 0 | 1];
  const opponent = state.players[playerIdx === 0 ? 1 : 0];

  switch (action.type) {
    case 'play_card': {
      const handIdx = player.hand.findIndex((c) => c.instanceId === action.cardInstanceId);
      if (handIdx === -1) throw new Error('Card not in hand');
      const card = player.hand[handIdx];
      if (player.mana < card.definition.cost) throw new Error('Not enough mana');
      if (player.field.length >= 5) throw new Error('Field is full');

      player.mana -= card.definition.cost;
      player.hand.splice(handIdx, 1);
      player.field.push(card);
      applyCardAbility(state, playerIdx as 0 | 1, card);
      state.actionLog.push(`${player.displayName} plays ${card.definition.name}`);
      break;
    }
    case 'attack': {
      const attackerIdx = player.field.findIndex((c) => c.instanceId === action.attackerInstanceId);
      if (attackerIdx === -1) throw new Error('Attacker not on field');

      const attacker = player.field[attackerIdx];

      if (action.targetInstanceId) {
        const targetIdx = opponent.field.findIndex((c) => c.instanceId === action.targetInstanceId);
        if (targetIdx === -1) throw new Error('Target not on field');
        const target = opponent.field[targetIdx];

        target.definition = { ...target.definition, defense: target.definition.defense - attacker.definition.attack };
        attacker.definition = { ...attacker.definition, defense: attacker.definition.defense - target.definition.attack };

        if (target.definition.defense <= 0) {
          opponent.field.splice(targetIdx, 1);
          opponent.graveyard.push(target);
        }
        if (attacker.definition.defense <= 0) {
          player.field.splice(attackerIdx, 1);
          player.graveyard.push(attacker);
        }
        state.actionLog.push(`${attacker.definition.name} attacks ${target.definition.name}`);
      } else {
        opponent.health -= attacker.definition.attack;
        state.actionLog.push(`${attacker.definition.name} attacks ${opponent.displayName} directly`);
      }
      break;
    }
    case 'end_turn': {
      state.currentTurn = (state.currentTurn === 0 ? 1 : 0) as 0 | 1;
      state.turnNumber += 1;
      startNextTurn(state);
      break;
    }
    default:
      throw new Error('Unknown action');
  }

  const winner = checkWinner(state);
  if (winner) {
    state.winnerId = winner;
    state.status = 'finished';
    state.finishedAt = new Date().toISOString();
    state.actionLog.push(`Match won by ${state.players.find((p) => p.userId === winner)?.displayName}`);
  }

  return state;
}

export function toPublicMatchState(state: InternalMatchState): MatchState {
  const toPlayer = (p: PlayerState): MatchPlayer => ({
    userId: p.userId,
    username: p.username,
    displayName: p.displayName,
    health: p.health,
    mana: p.mana,
    deckRemaining: p.deck.length,
  });

  return {
    id: state.id,
    status: state.status,
    players: [toPlayer(state.players[0]), toPlayer(state.players[1])],
    currentTurn: state.currentTurn,
    turnNumber: state.turnNumber,
    winnerId: state.winnerId,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
  };
}

export function calculateRatingChange(winnerRating: number, loserRating: number, isDraw = false): { winnerChange: number; loserChange: number } {
  const K = 32;
  const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));

  if (isDraw) {
    const change = Math.round(K * (0.5 - expectedWinner));
    return { winnerChange: change, loserChange: -change };
  }

  const winnerChange = Math.round(K * (1 - expectedWinner));
  const loserChange = -winnerChange;
  return { winnerChange, loserChange };
}
