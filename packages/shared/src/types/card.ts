export type CardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type CardElement = 'fire' | 'water' | 'earth' | 'air' | 'neutral';

export interface CardDefinition {
  id: string;
  name: string;
  description: string;
  rarity: CardRarity;
  element: CardElement;
  attack: number;
  defense: number;
  cost: number;
  ability: string | null;
  imageUrl: string;
}

export interface UserCard {
  id: string;
  userId: string;
  cardId: string;
  quantity: number;
  acquiredAt: string;
}

export interface DeckCard {
  cardId: string;
  quantity: number;
}

export interface Deck {
  id: string;
  userId: string;
  name: string;
  cards: DeckCard[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DECK_SIZE = 30;
export const MAX_COPIES_PER_CARD = 3;
export const HAND_SIZE = 5;
export const STARTING_HEALTH = 30;
export const STARTING_MANA = 1;
export const MAX_MANA = 10;
