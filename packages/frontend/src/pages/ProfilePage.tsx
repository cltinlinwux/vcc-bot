import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { BotLink } from '@vcc/shared';

export function ProfilePage() {
  const { user, token } = useAuth();
  const [linkCode, setLinkCode] = useState('');
  const [botLinks, setBotLinks] = useState<BotLink[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<BotLink[]>('/api/bot/links', { token }).then(setBotLinks).catch(() => {});
  }, [token]);

  const generateCode = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api<{ code: string }>('/api/bot/link-code', { method: 'POST', token });
      setLinkCode(data.code);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const winRate = user.wins + user.losses > 0
    ? Math.round((user.wins / (user.wins + user.losses)) * 100)
    : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-8">Profile</h1>

      <div className="card-surface mb-6">
        <h2 className="font-display text-xl font-bold mb-1">{user.displayName}</h2>
        <p className="text-vcc-muted text-sm mb-6">@{user.username}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Rating" value={String(user.rating)} highlight />
          <Stat label="Wins" value={String(user.wins)} />
          <Stat label="Losses" value={String(user.losses)} />
          <Stat label="Win Rate" value={`${winRate}%`} />
        </div>
      </div>

      <div className="card-surface">
        <h3 className="font-display font-bold mb-4">Bot Link</h3>
        <p className="text-sm text-vcc-muted mb-4">
          Link your Discord or Telegram account to play via bot commands.
        </p>

        <button onClick={generateCode} disabled={loading} className="btn-secondary mb-4">
          {loading ? 'Generating...' : 'Generate Link Code'}
        </button>

        {linkCode && (
          <div className="p-4 bg-vcc-surface rounded-lg border border-vcc-gold/30 text-center">
            <p className="text-sm text-vcc-muted mb-1">Your link code (expires in 15 min)</p>
            <p className="font-display text-2xl font-bold text-vcc-gold tracking-widest">{linkCode}</p>
            <p className="text-xs text-vcc-muted mt-2">Use /link {linkCode} in Discord bot</p>
          </div>
        )}

        {botLinks.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-vcc-muted">Linked accounts:</p>
            {botLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2 text-sm">
                <span className="capitalize text-vcc-gold">{link.platform}</span>
                <span className="text-vcc-muted">{link.platformUsername}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center p-3 bg-vcc-surface rounded-lg">
      <p className="text-xs text-vcc-muted mb-1">{label}</p>
      <p className={`font-display font-bold text-lg ${highlight ? 'text-vcc-gold' : ''}`}>{value}</p>
    </div>
  );
}
