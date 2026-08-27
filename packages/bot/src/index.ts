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

async function apiCall<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as T;
  } catch {
    return null;
  }
}

const commands = [
  new SlashCommandBuilder().setName(BOT_COMMANDS.START).setDescription(`Start ${APP_FULL_NAME} bot`),
  new SlashCommandBuilder()
    .setName(BOT_COMMANDS.LINK)
    .setDescription('Link your VCC account')
    .addStringOption((o) => o.setName('code').setDescription('8-character link code from profile').setRequired(true)),
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

  if (result) {
    await interaction.reply({ content: 'Account linked successfully! Use /play to join matches.', ephemeral: true });
  } else {
    await interaction.reply({ content: 'Link failed. Check your code and try again.', ephemeral: true });
  }
}

async function handleLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const entries = await apiCall<{ rank: number; displayName: string; rating: number; wins: number; losses: number }[]>(
    '/api/game/leaderboard',
  );

  if (!entries || entries.length === 0) {
    await interaction.reply('No players on the leaderboard yet.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${APP_FULL_NAME} — Leaderboard`)
    .setColor(0xfbbf24)
    .setDescription(
      entries.slice(0, 10).map((e) => `#${e.rank} **${e.displayName}** — ${e.rating} (${e.wins}W/${e.losses}L)`).join('\n'),
    );

  await interaction.reply({ embeds: [embed] });
}

async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle(`${APP_FULL_NAME} — Commands`)
    .setColor(0x3b82f6)
    .addFields(
      { name: '/link <code>', value: 'Link your web account (get code from profile page)' },
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
      case BOT_COMMANDS.PLAY:
        await interaction.reply({ content: 'Queue joined! Open the web app to play your match.', ephemeral: true });
        break;
      case BOT_COMMANDS.STATS:
        await interaction.reply({ content: 'Link your account first with /link to view stats.', ephemeral: true });
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
