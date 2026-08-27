import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric'),
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/\d/, 'Password must contain at least one number'),
  displayName: z.string().min(1).max(50).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createDeckSchema = z.object({
  name: z.string().min(1).max(50),
  cards: z.array(
    z.object({
      cardId: z.string(),
      quantity: z.number().int().min(1).max(3),
    }),
  ),
});

export const linkBotSchema = z.object({
  code: z.string().length(8),
  platform: z.enum(['discord', 'telegram']),
  platformUserId: z.string(),
  platformUsername: z.string(),
});

export const botQueueJoinSchema = z.object({
  platform: z.enum(['discord', 'telegram']),
  platformUserId: z.string().min(1),
});
