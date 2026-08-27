import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { DECK_SIZE, MAX_COPIES_PER_CARD } from '@vcc/shared';
import type { CardDefinition, Deck, DeckCard } from '@vcc/shared';

const elementBorders: Record<string, string> = {
  fire: 'border-vcc-fire',
  water: 'border-vcc-water',
  earth: 'border-vcc-earth',
  air: 'border-vcc-air',
  neutral: 'border-vcc-neutral',
};

const elementText: Record<string, string> = {
  fire: 'text-vcc-fire',
  water: 'text-vcc-water',
  earth: 'text-vcc-earth',
  air: 'text-vcc-air',
  neutral: 'text-vcc-neutral',
};

function deckSize(cards: DeckCard[]): number {
  return cards.reduce((sum, entry) => sum + entry.quantity, 0);
}

interface DeckListItemProps {
  deck: Deck;
  cardName: (cardId: string) => string;
}

function DeckListItem({ deck, cardName }: DeckListItemProps) {
  return (
    <div className="card-surface">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-display font-bold">{deck.name}</h3>
        {deck.isDefault && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-vcc-gold/20 text-vcc-gold border border-vcc-gold/40">
            Default
          </span>
        )}
      </div>
      <p className="text-sm text-vcc-muted mb-3">{deckSize(deck.cards)} cards</p>
      <ul className="space-y-1 text-sm">
        {deck.cards.map((entry) => (
          <li key={entry.cardId} className="flex justify-between gap-2">
            <span className="truncate">{cardName(entry.cardId)}</span>
            <span className="text-vcc-muted shrink-0">x{entry.quantity}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface BuilderCardProps {
  card: CardDefinition;
  quantity: number;
  canAdd: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

function BuilderCard({ card, quantity, canAdd, onAdd, onRemove }: BuilderCardProps) {
  return (
    <div
      className={`p-4 rounded-lg border border-vcc-border bg-vcc-card border-l-4 ${
        elementBorders[card.element] ?? 'border-vcc-border'
      } ${quantity > 0 ? 'ring-1 ring-vcc-gold/40' : ''}`}
    >
      <div className="flex justify-between items-start gap-2 mb-1">
        <h4 className="font-display font-bold text-sm">{card.name}</h4>
        <span className={`text-xs capitalize shrink-0 ${elementText[card.element] ?? 'text-vcc-muted'}`}>
          {card.element}
        </span>
      </div>
      <p className="text-xs text-vcc-muted mb-2">
        ATK {card.attack} · DEF {card.defense} · Cost {card.cost}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRemove}
          disabled={quantity === 0}
          aria-label={`Remove one ${card.name} from deck`}
          className="w-8 h-8 rounded-lg border border-vcc-border bg-vcc-surface font-bold
                     hover:border-vcc-gold/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          &minus;
        </button>
        <span
          className={`w-10 text-center font-bold ${quantity > 0 ? 'text-vcc-gold' : 'text-vcc-muted'}`}
          aria-label={`${quantity} of ${MAX_COPIES_PER_CARD} copies of ${card.name} in deck`}
        >
          {quantity}/{MAX_COPIES_PER_CARD}
        </span>
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          aria-label={`Add one ${card.name} to deck`}
          className="w-8 h-8 rounded-lg border border-vcc-border bg-vcc-surface font-bold
                     hover:border-vcc-gold/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function DecksPage() {
  const { token } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<CardDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<CardDefinition[]>('/api/game/cards'),
      api<Deck[]>('/api/game/decks', { token }),
    ])
      .then(([cardData, deckData]) => {
        setCards(cardData);
        setDecks(deckData);
      })
      .catch((err) => setServerError(err instanceof Error ? err.message : 'Failed to load decks'))
      .finally(() => setLoading(false));
  }, [token]);

  const cardMap = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const cardName = (cardId: string) => cardMap.get(cardId)?.name ?? cardId;

  const totalCards = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + q, 0),
    [quantities],
  );

  const validationError = useMemo(() => {
    if (!name.trim()) return 'Enter a deck name.';
    if (totalCards !== DECK_SIZE) {
      return `Deck must contain exactly ${DECK_SIZE} cards (currently ${totalCards}).`;
    }
    return null;
  }, [name, totalCards]);

  const setQuantity = (cardId: string, quantity: number) => {
    setSuccess('');
    setQuantities((prev) => {
      const next = { ...prev };
      if (quantity <= 0) {
        delete next[cardId];
      } else {
        next[cardId] = Math.min(quantity, MAX_COPIES_PER_CARD);
      }
      return next;
    });
  };

  const saveDeck = async () => {
    if (!token || validationError) return;
    setSaving(true);
    setServerError('');
    setSuccess('');
    try {
      const deckCards: DeckCard[] = Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([cardId, quantity]) => ({ cardId, quantity }));
      const deck = await api<Deck>('/api/game/decks', {
        method: 'POST',
        token,
        body: { name: name.trim(), cards: deckCards },
      });
      setDecks((prev) => [...prev, deck]);
      setName('');
      setQuantities({});
      setSuccess(`Deck "${deck.name}" saved.`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Failed to save deck');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-2">Deck Builder</h1>
      <p className="text-vcc-muted mb-8">
        Build a deck of exactly {DECK_SIZE} cards, up to {MAX_COPIES_PER_CARD} copies per card.
      </p>

      {serverError && (
        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 flex justify-between items-center gap-4">
          <span>{serverError}</span>
          <button
            type="button"
            onClick={() => setServerError('')}
            className="text-red-400/70 hover:text-red-300 font-bold"
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-vcc-muted py-16">Loading decks...</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          <section aria-labelledby="your-decks-heading">
            <h2 id="your-decks-heading" className="font-display text-xl font-bold mb-4">
              Your Decks
            </h2>
            {decks.length === 0 ? (
              <p className="text-vcc-muted text-sm">You have no decks yet. Build one below.</p>
            ) : (
              <div className="space-y-4">
                {decks.map((deck) => (
                  <DeckListItem key={deck.id} deck={deck} cardName={cardName} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="new-deck-heading" className="lg:col-span-2">
            <h2 id="new-deck-heading" className="font-display text-xl font-bold mb-4">
              New Deck
            </h2>
            <form
              className="card-surface space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void saveDeck();
              }}
            >
              <div>
                <label htmlFor="deck-name" className="block text-sm font-medium text-vcc-muted mb-2">
                  Deck name
                </label>
                <input
                  id="deck-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setSuccess('');
                    setName(e.target.value);
                  }}
                  maxLength={50}
                  placeholder="e.g. Fire Rush"
                  className="input-field"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-vcc-muted">Card catalog ({cards.length} cards)</span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold ${
                    totalCards === DECK_SIZE
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-vcc-surface text-vcc-muted border border-vcc-border'
                  }`}
                >
                  {totalCards} / {DECK_SIZE} cards
                </span>
              </div>

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {cards.map((card) => {
                  const quantity = quantities[card.id] ?? 0;
                  return (
                    <BuilderCard
                      key={card.id}
                      card={card}
                      quantity={quantity}
                      canAdd={quantity < MAX_COPIES_PER_CARD && totalCards < DECK_SIZE}
                      onAdd={() => setQuantity(card.id, quantity + 1)}
                      onRemove={() => setQuantity(card.id, quantity - 1)}
                    />
                  );
                })}
              </div>

              <p aria-live="polite" role="status" className="text-sm min-h-5">
                {success ? (
                  <span className="text-green-400">{success}</span>
                ) : validationError ? (
                  <span className="text-amber-400">{validationError}</span>
                ) : (
                  <span className="text-green-400">Deck is valid and ready to save.</span>
                )}
              </p>

              <div className="flex justify-end">
                <button type="submit" disabled={!!validationError || saving} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                  {saving ? 'Saving...' : 'Save Deck'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
