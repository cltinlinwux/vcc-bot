import { useEffect, useState } from 'react';
import type { CardDefinition } from '@vcc/shared';
import { api } from '../lib/api';

const elementColors: Record<string, string> = {
  fire: 'border-vcc-fire text-vcc-fire',
  water: 'border-vcc-water text-vcc-water',
  earth: 'border-vcc-earth text-vcc-earth',
  air: 'border-vcc-air text-vcc-air',
  neutral: 'border-vcc-neutral text-vcc-neutral',
};

const rarityColors: Record<string, string> = {
  common: 'text-gray-400',
  uncommon: 'text-green-400',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
  legendary: 'text-vcc-gold',
};

export function CardsPage() {
  const [cards, setCards] = useState<CardDefinition[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<CardDefinition[]>('/api/game/cards')
      .then(setCards)
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? cards : cards.filter((c) => c.element === filter);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-2">Card Catalog</h1>
      <p className="text-vcc-muted mb-8">{cards.length} cards available</p>

      <div className="flex flex-wrap gap-2 mb-8">
        {['all', 'fire', 'water', 'earth', 'air', 'neutral'].map((el) => (
          <button
            key={el}
            onClick={() => setFilter(el)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === el ? 'bg-vcc-gold/20 text-vcc-gold border border-vcc-gold/50' : 'bg-vcc-surface text-vcc-muted hover:text-vcc-text border border-vcc-border'
            }`}
          >
            {el.charAt(0).toUpperCase() + el.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-vcc-muted py-16">Loading cards...</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((card) => (
            <div
              key={card.id}
              className={`card-surface border-l-4 ${elementColors[card.element]?.split(' ')[0] ?? 'border-vcc-border'} hover:scale-[1.02] transition-transform overflow-hidden`}
            >
              <img
                src={card.imageUrl}
                alt={card.name}
                className="w-full h-32 object-cover rounded-lg mb-3 bg-vcc-surface"
                loading="lazy"
              />
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-display font-bold">{card.name}</h3>
                <span className={`text-xs font-medium capitalize ${rarityColors[card.rarity]}`}>{card.rarity}</span>
              </div>
              <p className="text-sm text-vcc-muted mb-3 line-clamp-2">{card.description}</p>
              <div className="flex gap-4 text-sm">
                <span className={elementColors[card.element]}>{card.element}</span>
                <span>ATK {card.attack}</span>
                <span>DEF {card.defense}</span>
                <span>Cost {card.cost}</span>
              </div>
              {card.ability && (
                <p className="mt-2 text-xs text-vcc-gold/80 italic">{card.ability}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
