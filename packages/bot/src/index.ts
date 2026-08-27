import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { BOT_COMMANDS, APP_FULL_NAME } from '@vcc/shared';

const API_URL = process.env.VITE_API_URL ?? 'http://localhost:3001';

type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

async function apiCall<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Read at call time so the token can be set/rotated without a rebuild.
    // Required by the backend in production; optional in dev/test.
    const serviceToken = process.env.BOT_SERVICE_TOKEN;
    if (serviceToken) headers.Authorization = `Bearer ${serviceToken}`;

    const res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as { data?: T; error?: string; code?: string } | null;
    if (!res.ok) {
      return { ok: false, code: json?.code ?? 'HTTP_ERROR', error: json?.error ?? `Request failed (${res.status})` };
    }
    return { ok: true, data: json?.data as T };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', error: 'Could not reach the VCC API' };
  }
}

const commands = [
  new SlashCommandBuilder().setName(BOT_COMMANDS.START).setDescription(`Start ${APP_FULL_NAME} bot`),
  new SlashCommandBuilder()
    .setName(BOT_COMMANDS.LINK)
    .setDescription('Link your VCC account')
    .addStringOption((o) => o.setName('code').setDescription('8-character link code from profile').setRequired(true)),
  new SlashCommandBuilder().setName(BOT_COMMANDS.UNLINK).setDescription('Unlink your VCC account from Discord'),
  new SlashCommandBuilder().setName(BOT_COMMANDS.PLAY).setDescription('Join matchmaking queue'),
  new SlashCommandBuilder().setName(BOT_COMMANDS.STATS).setDescription('View your stats'),
  new SlashCommandBuilder().setName(BOT_COMMANDS.LEADERBOARD).setDescription('View top players'),
  new SlashCommandBuilder().setName(BOT_COMMANDS.HELP).setDescription('Show available commands'),
].map((c) => c.toJSON());

async function handleLink(interaction: ChatInputCommandInteraction): Promise<void> {
  const code = interaction.options.getString('code', true);
  const result = await apiCall<{ platform: string }>('/api/bot/link', {
    method: 'POST',
    body: {
      code: code.toUpperCase(),
      platform: 'discord',
      platformUserId: interaction.user.id,
      platformUsername: interaction.user.username,
    },
  });

  if (result.ok) {
    await interaction.reply({ content: 'Account linked successfully! Use /play to join matches.', ephemeral: true });
  } else {
    await interaction.reply({ content: 'Link failed. Check your code and try again.', ephemeral: true });
  }
}

export async function handleUnlink(interaction: ChatInputCommandInteraction): Promise<void> {
  const result = await apiCall<{ unlinked: boolean }>('/api/bot/unlink', {
    method: 'POST',
    body: { platform: 'discord', platformUserId: interaction.user.id },
  });

  if (result.ok) {
    await interaction.reply({
      content: 'Your Discord account has been unlinked. Use /link with a new code from your profile to link again.',
      ephemeral: true,
    });
    return;
  }

  const content =
    result.code === 'NOT_LINKED'
      ? 'Your Discord account is not linked, so there is nothing to unlink.'
      : `Could not unlink: ${result.error}`;
  await interaction.reply({ content, ephemeral: true });
}

export async function handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
  const result = await apiCall<{ matched: boolean; matchId?: string }>('/api/bot/queue/join', {
    method: 'POST',
    body: { platform: 'discord', platformUserId: interaction.user.id },
  });

  if (!result.ok) {
    const content =
      result.code === 'NOT_LINKED'
        ? 'Your Discord account is not linked yet. Get a code from your profile page and use /link <code>.'
        : `Could not join the queue: ${result.error}`;
    await interaction.reply({ content, ephemeral: true });
    return;
  }

  if (result.data.matched) {
    await interaction.reply({
      content: `Match found! Open the web app to play now. Match ID: \`${result.data.matchId}\``,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: 'You are in the matchmaking queue. You will be matched as soon as an opponent joins — keep the web app open.',
      ephemeral: true,
    });
  }
}

export async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
  const result = await apiCall<{
    displayName: string;
    username: string;
    rating: number;
    wins: number;
    losses: number;
    draws: number;
  }>(`/api/bot/user/discord/${interaction.user.id}`);

  if (!result.ok) {
    const content =
      result.code === 'NOT_LINKED'
        ? 'Your Discord account is not linked yet. Get a code from your profile page and use /link <code>.'
        : `Could not fetch stats: ${result.error}`;
    await interaction.reply({ content, ephemeral: true });
    return;
  }

  const stats = result.data;
  const totalGames = stats.wins + stats.losses + stats.draws;
  const winRate = totalGames > 0 ? Math.round((stats.wins / totalGames) * 100) : 0;

  const embed = new EmbedBuilder()
    .setTitle(`${APP_FULL_NAME} — ${stats.displayName}`)
    .setColor(0x22c55e)
    .addFields(
      { name: 'Rating', value: `${stats.rating}`, inline: true },
      { name: 'Wins', value: `${stats.wins}`, inline: true },
      { name: 'Losses', value: `${stats.losses}`, inline: true },
      { name: 'Draws', value: `${stats.draws}`, inline: true },
      { name: 'Win rate', value: `${winRate}%`, inline: true },
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const result = await apiCall<{ rank: number; displayName: string; rating: number; wins: number; losses: number }[]>(
    '/api/game/leaderboard',
  );

  if (!result.ok || result.data.length === 0) {
    await interaction.reply('No players on the leaderboard yet.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${APP_FULL_NAME} — Leaderboard`)
    .setColor(0xfbbf24)
    .setDescription(
      result.data.slice(0, 10).map((e) => `#${e.rank} **${e.displayName}** — ${e.rating} (${e.wins}W/${e.losses}L)`).join('\n'),
    );

  await interaction.reply({ embeds: [embed] });
}

async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle(`${APP_FULL_NAME} — Commands`)
    .setColor(0x3b82f6)
    .addFields(
      { name: '/link <code>', value: 'Link your web account (get code from profile page)' },
      { name: '/unlink', value: 'Remove the link between Discord and your web account' },
      { name: '/play', value: 'Join matchmaking (requires linked account)' },
      { name: '/stats', value: 'View your rating and record' },
      { name: '/leaderboard', value: 'Top 10 players' },
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function startBot(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log('DISCORD_BOT_TOKEN not set — bot disabled. Set token in .env to enable.');
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', () => {
    console.log(`Discord bot logged in as ${client.user?.tag}`);
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
      case BOT_COMMANDS.START:
        await interaction.reply(`Welcome to ${APP_FULL_NAME}! Use /help for commands.`);
        break;
      case BOT_COMMANDS.LINK:
        await handleLink(interaction);
        break;
      case BOT_COMMANDS.UNLINK:
        await handleUnlink(interaction);
        break;
      case BOT_COMMANDS.PLAY:
        await handlePlay(interaction);
        break;
      case BOT_COMMANDS.STATS:
        await handleStats(interaction);
        break;
      case BOT_COMMANDS.LEADERBOARD:
        await handleLeaderboard(interaction);
        break;
      case BOT_COMMANDS.HELP:
        await handleHelp(interaction);
        break;
    }
  });

  const rest = new REST().setToken(token);
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (clientId) {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Slash commands registered.');
  }

  await client.login(token);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startBot().catch(console.error);
}
