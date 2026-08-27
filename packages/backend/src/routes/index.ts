import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { linkCodeLimiter } from '../middleware/rateLimits.js';
import { registerSchema, loginSchema, createDeckSchema, linkBotSchema, botQueueJoinSchema } from '../schemas/index.js';
import {
  createUser,
  findUserByEmail,
  findUserByUsername,
  verifyPassword,
  toProfile,
  findUserById,
  getLeaderboard,
} from '../services/user.service.js';
import { signToken } from '../middleware/auth.js';
import { createDeck, createStarterDeck, getUserDecks } from '../services/deck.service.js';
import { joinQueue, leaveQueue, getMatchHistory } from '../services/match.service.js';
import { generateLinkCode, linkBotAccount, getUserBotLinks, findBotLink } from '../services/bot.service.js';
import { getStarterDeck, CARD_DEFINITIONS } from '@vcc/shared';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), (req, res) => {
  if (findUserByEmail(req.body.email)) {
    res.status(409).json({ error: 'Email already registered', code: 'EMAIL_EXISTS' });
    return;
  }
  if (findUserByUsername(req.body.username)) {
    res.status(409).json({ error: 'Username taken', code: 'USERNAME_EXISTS' });
    return;
  }

  const user = createUser(req.body);
  createStarterDeck(user.id, getStarterDeck());
  const token = signToken({ userId: user.id, username: user.username, role: user.role });

  res.status(201).json({
    data: {
      user: toProfile(user),
      tokens: { accessToken: token, expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
    },
  });
});

authRouter.post('/login', validateBody(loginSchema), (req, res) => {
  const user = verifyPassword(req.body.email, req.body.password);
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    return;
  }

  const token = signToken({ userId: user.id, username: user.username, role: user.role });
  res.json({
    data: {
      user: toProfile(user),
      tokens: { accessToken: token, expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
    },
  });
});

authRouter.get('/me', authMiddleware, (req, res) => {
  const user = findUserById(req.auth!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    return;
  }
  res.json({ data: toProfile(user) });
});

export const gameRouter = Router();

gameRouter.get('/cards', (_req, res) => {
  res.json({ data: CARD_DEFINITIONS });
});

gameRouter.get('/leaderboard', (_req, res) => {
  const entries = getLeaderboard().map((u, i) => ({
    rank: i + 1,
    userId: u.id,
    username: u.username,
    displayName: u.displayName,
    rating: u.rating,
    wins: u.wins,
    losses: u.losses,
  }));
  res.json({ data: entries });
});

gameRouter.get('/decks', authMiddleware, (req, res) => {
  res.json({ data: getUserDecks(req.auth!.userId) });
});

gameRouter.post('/decks', authMiddleware, validateBody(createDeckSchema), (req, res) => {
  try {
    const deck = createDeck(req.auth!.userId, req.body.name, req.body.cards);
    res.status(201).json({ data: deck });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message, code: 'DECK_INVALID' });
  }
});

gameRouter.post('/queue/join', authMiddleware, (req, res) => {
  const result = joinQueue(req.auth!.userId);
  res.json({ data: result });
});

gameRouter.post('/queue/leave', authMiddleware, (req, res) => {
  leaveQueue(req.auth!.userId);
  res.json({ data: { left: true } });
});

gameRouter.get('/history', authMiddleware, (req, res) => {
  res.json({ data: getMatchHistory(req.auth!.userId) });
});

export const botRouter = Router();

botRouter.post('/link-code', authMiddleware, (req, res) => {
  const code = generateLinkCode(req.auth!.userId);
  res.json({ data: { code, expiresInMinutes: 15 } });
});

botRouter.post('/link', linkCodeLimiter, validateBody(linkBotSchema), (req, res) => {
  try {
    const link = linkBotAccount(req.body);
    res.json({ data: link });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message, code: 'LINK_FAILED' });
  }
});

botRouter.get('/links', authMiddleware, (req, res) => {
  res.json({ data: getUserBotLinks(req.auth!.userId) });
});

const BOT_PLATFORMS = ['discord', 'telegram'] as const;

function isBotPlatform(value: string): value is (typeof BOT_PLATFORMS)[number] {
  return (BOT_PLATFORMS as readonly string[]).includes(value);
}

botRouter.get('/user/:platform/:platformUserId', (req, res) => {
  const { platform, platformUserId } = req.params;
  if (!isBotPlatform(platform)) {
    res.status(400).json({ error: `Invalid platform. Must be one of: ${BOT_PLATFORMS.join(', ')}`, code: 'INVALID_PLATFORM' });
    return;
  }

  const link = findBotLink(platform, platformUserId);
  if (!link) {
    res.status(404).json({ error: 'No linked account for this platform user', code: 'NOT_LINKED' });
    return;
  }

  const user = findUserById(link.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    return;
  }

  res.json({ data: { ...toProfile(user), platformUsername: link.platformUsername, linkedAt: link.linkedAt } });
});

botRouter.post('/queue/join', validateBody(botQueueJoinSchema), (req, res) => {
  const link = findBotLink(req.body.platform, req.body.platformUserId);
  if (!link) {
    res.status(404).json({ error: 'No linked account for this platform user', code: 'NOT_LINKED' });
    return;
  }

  const result = joinQueue(link.userId);
  res.json({ data: result });
});
