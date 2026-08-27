import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { APP_FULL_NAME } from '@vcc/shared';

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-vcc-gold/5 via-transparent to-transparent" />

      <section className="relative max-w-7xl mx-auto px-4 py-24 sm:py-32 text-center animate-fade-in">
        <h1 className="font-display text-5xl sm:text-7xl font-black mb-6 bg-gradient-to-r from-vcc-gold via-amber-300 to-vcc-gold bg-clip-text text-transparent">
          {APP_FULL_NAME}
        </h1>
        <p className="text-xl text-vcc-muted max-w-2xl mx-auto mb-10">
          Battle with elemental cards in real-time PvP matches. Build your deck, climb the leaderboard, and dominate the arena.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          {user ? (
            <Link to="/play" className="btn-primary text-lg">Enter Arena</Link>
          ) : (
            <>
              <Link to="/register" className="btn-primary text-lg">Start Playing</Link>
              <Link to="/cards" className="btn-secondary text-lg">Browse Cards</Link>
            </>
          )}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16 grid md:grid-cols-3 gap-8">
        {[
          { title: 'Elemental Combat', desc: 'Fire, Water, Earth, Air — master all elements and their unique abilities.', color: 'from-vcc-fire to-vcc-water' },
          { title: 'Ranked PvP', desc: 'Climb from 1000 rating to the top of the global leaderboard.', color: 'from-vcc-gold to-amber-500' },
          { title: 'Bot Companion', desc: 'Link your Discord account to play and check stats on the go.', color: 'from-vcc-air to-vcc-neutral' },
        ].map((feature) => (
          <div key={feature.title} className="card-surface animate-slide-up hover:border-vcc-gold/30 transition-colors group">
            <div className={`w-12 h-1 rounded bg-gradient-to-r ${feature.color} mb-4 group-hover:w-full transition-all duration-500`} />
            <h3 className="font-display text-xl font-bold mb-2">{feature.title}</h3>
            <p className="text-vcc-muted">{feature.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
