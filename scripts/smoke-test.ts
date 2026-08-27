const API = process.env.API_URL ?? 'http://localhost:3001';

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
    ...options,
  });
}

async function smokeTest(): Promise<void> {
  const health = await request('/health');
  if (!health.ok) throw new Error('Health check failed');
  const healthData = await health.json();
  if (healthData.status !== 'ok') throw new Error(`Health status: ${healthData.status}`);
  console.log('  Health check: OK');

  const cards = await request('/api/game/cards');
  if (!cards.ok) throw new Error('Cards endpoint failed');
  const cardsData = await cards.json();
  if (!Array.isArray(cardsData.data) || cardsData.data.length === 0) throw new Error('No cards returned');
  console.log(`  Cards catalog: ${cardsData.data.length} cards`);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@vcc.game', password: 'demo1234' }),
  });
  if (!login.ok) throw new Error('Demo login failed — run db:seed first');
  const loginData = await login.json();
  const token = loginData.data.tokens.accessToken;
  console.log('  Demo login: OK');

  const me = await request('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!me.ok) throw new Error('Auth me failed');
  console.log('  Auth token: OK');

  const decks = await request('/api/game/decks', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!decks.ok) throw new Error('Decks endpoint failed');
  console.log('  Decks: OK');

  const leaderboard = await request('/api/game/leaderboard');
  if (!leaderboard.ok) throw new Error('Leaderboard failed');
  console.log('  Leaderboard: OK');

  console.log('Smoke test passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  smokeTest().catch((err) => {
    console.error('Smoke test failed:', err.message);
    console.error('Note: Start backend first with: npm run dev -w @vcc/backend');
    process.exit(1);
  });
}

export { smokeTest };
