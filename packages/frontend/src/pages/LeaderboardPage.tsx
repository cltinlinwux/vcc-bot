import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { LeaderboardEntry } from '@vcc/shared';

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<LeaderboardEntry[]>('/api/game/leaderboard')
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-8">Leaderboard</h1>

      <div className="card-surface overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-vcc-muted">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-vcc-muted">No players yet. Be the first!</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-vcc-border text-left text-sm text-vcc-muted">
                <th className="p-4">#</th>
                <th className="p-4">Player</th>
                <th className="p-4">Rating</th>
                <th className="p-4">W/L</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.userId} className="border-b border-vcc-border/50 hover:bg-vcc-surface/50 transition-colors">
                  <td className="p-4 font-display font-bold text-vcc-gold">{entry.rank}</td>
                  <td className="p-4">{entry.displayName}</td>
                  <td className="p-4 font-bold">{entry.rating}</td>
                  <td className="p-4 text-vcc-muted">{entry.wins}/{entry.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
