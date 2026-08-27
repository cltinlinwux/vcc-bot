import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { handlePlay, handleStats } from './index.js';

const originalFetch = globalThis.fetch;

interface ReplyPayload {
  content?: string;
  embeds?: EmbedBuilder[];
  ephemeral?: boolean;
}

function createInteraction(): { interaction: ChatInputCommandInteraction; replies: ReplyPayload[] } {
  const replies: ReplyPayload[] = [];
  const interaction = {
    user: { id: '123456789', username: 'tester' },
    reply: async (payload: ReplyPayload) => {
      replies.push(payload);
    },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, replies };
}

function mockApiResponse(status: number, body: unknown): void {
  globalThis.fetch = mock.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('handlePlay', () => {
  it('prompts to link when the account is not linked', async () => {
    mockApiResponse(404, { error: 'No linked account', code: 'NOT_LINKED' });
    const { interaction, replies } = createInteraction();

    await handlePlay(interaction);

    assert.equal(replies.length, 1);
    assert.match(replies[0].content!, /not linked/i);
    assert.match(replies[0].content!, /\/link/);
  });

  it('reports queued status when no opponent is waiting', async () => {
    mockApiResponse(200, { data: { matched: false } });
    const { interaction, replies } = createInteraction();

    await handlePlay(interaction);

    assert.equal(replies.length, 1);
    assert.match(replies[0].content!, /queue/i);
  });

  it('reports the match when an opponent is found', async () => {
    mockApiResponse(200, { data: { matched: true, matchId: 'match-42' } });
    const { interaction, replies } = createInteraction();

    await handlePlay(interaction);

    assert.equal(replies.length, 1);
    assert.match(replies[0].content!, /match found/i);
    assert.match(replies[0].content!, /match-42/);
  });

  it('reports API failures', async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    const { interaction, replies } = createInteraction();

    await handlePlay(interaction);

    assert.equal(replies.length, 1);
    assert.match(replies[0].content!, /could not join/i);
  });
});

describe('handleStats', () => {
  it('prompts to link when the account is not linked', async () => {
    mockApiResponse(404, { error: 'No linked account', code: 'NOT_LINKED' });
    const { interaction, replies } = createInteraction();

    await handleStats(interaction);

    assert.equal(replies.length, 1);
    assert.match(replies[0].content!, /not linked/i);
  });

  it('shows rating, wins and losses in an embed', async () => {
    mockApiResponse(200, {
      data: { displayName: 'Tester', username: 'tester', rating: 1042, wins: 7, losses: 3, draws: 0 },
    });
    const { interaction, replies } = createInteraction();

    await handleStats(interaction);

    assert.equal(replies.length, 1);
    const embed = replies[0].embeds?.[0];
    assert.ok(embed, 'expected an embed reply');
    const data = embed.toJSON();
    assert.match(data.title!, /Tester/);
    const fields = Object.fromEntries((data.fields ?? []).map((f) => [f.name, f.value]));
    assert.equal(fields['Rating'], '1042');
    assert.equal(fields['Wins'], '7');
    assert.equal(fields['Losses'], '3');
    assert.equal(fields['Win rate'], '70%');
  });
});
