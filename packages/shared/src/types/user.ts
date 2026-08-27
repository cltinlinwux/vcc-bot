export type UserRole = 'player' | 'admin';

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  updatedAt: string;
}

export type UserProfile = Pick<
  User,
  'id' | 'username' | 'displayName' | 'avatarUrl' | 'rating' | 'wins' | 'losses' | 'draws'
>;

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}

export interface BotLink {
  id: string;
  userId: string;
  platform: 'discord' | 'telegram';
  platformUserId: string;
  platformUsername: string;
  linkedAt: string;
}
