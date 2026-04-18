import Anthropic from '@anthropic-ai/sdk';
import { readJson, getSettingsPath } from '../utils/files.js';

interface Character {
  id: string;
  color: string;
  personality: string;
  speechStyle: string;
  interests: string[];
  quirks: string[];
  emotionalProfile: {
    temperament: string;
    triggers: Array<{
      topic: string;
      reaction: string;
      intensity: string;
      description: string;
    }>;
    recoverySpeed: string;
  };
  voice: { edgeTtsVoice: string; rate: string; pitch: string };
  systemPrompt?: string;
}

interface MemoryBlock {
  summary: string;
  tier: 'recent' | 'mid' | 'old';
}

interface DirectorInput {
  emotionalLandscape: Record<string, string>;
  suggestions: string[];
  topicSeeds: string[];
  targetTurnCount: number;
}

interface ParsedTurn {
  characterLabel: string;
  moodTag: string;
  text: string;
}

async function getApiKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const settings = await readJson<{ anthropicApiKey?: string }>(getSettingsPath());
  if (settings?.anthropicApiKey) return settings.anthropicApiKey;
  throw new Error('No Anthropic API key configured');
}

let clientInstance: Anthropic | null = null;
let lastKey = '';

async function getClient(): Promise<Anthropic> {
  const key = await getApiKey();
  if (!clientInstance || key !== lastKey) {
    clientInstance = new Anthropic({ apiKey: key });
    lastKey = key;
  }
  return clientInstance;
}

function buildCharacterProfileBlock(characters: Character[], labelMap: Map<string, string>): string {
  const profiles: string[] = [];
  for (const char of characters) {
    const label = labelMap.get(char.id)!;
    const triggerLines = char.emotionalProfile.triggers
      .map(t => `    - ${t.topic}: ${t.description} (${t.reaction}, ${t.intensity})`)
      .join('\n');

    profiles.push(`[${label}]:
  Personality: ${char.personality}
  Speech style: ${char.speechStyle}
  Interests: ${char.interests.join(', ')}
  Quirks: ${char.quirks.join(', ')}
  Temperament: ${char.emotionalProfile.temperament}
  Recovery speed: ${char.emotionalProfile.recoverySpeed}
  Triggers:
${triggerLines || '    (none)'}`);
  }
  return profiles.join('\n\n');
}

function buildSystemPrompt(characters: Character[], labelMap: Map<string, string>): string {
  const profiles = buildCharacterProfileBlock(characters, labelMap);

  return `You are writing naturalistic conversation between four people sitting together.
They don't use names. They speak like real people — contractions, filler words, incomplete sentences, interruptions, small noises of acknowledgment.

Character profiles:

${profiles}

Rules:
- Format each turn as: [Person X] (mood-label): dialogue text
- Keep responses to 1-3 sentences most of the time. Occasionally longer for stories or passionate explanations.
- Use natural speech patterns: contractions, filler words, incomplete sentences.
- Never use names. Never break character.
- Show emotion through speech texture, not narration. Excited = faster, longer. Annoyed = clipped. Uncomfortable = hedging, trailing off.
- Characters should interrupt, overlap, go on tangents, tell anecdotes, agree, disagree, and react naturally.
- Vary who speaks — don't cycle through characters in order. Some characters talk more in stretches, some go quiet.`;
}

function buildUserMessage(
  memories: MemoryBlock[],
  recentTurns: string[],
  directorInput: DirectorInput,
): string {
  const parts: string[] = [];

  if (memories.length > 0) {
    const memoryText = memories
      .map(m => m.summary)
      .join('\n\n');
    parts.push(`== What's happened so far ==\n${memoryText}`);
  }

  if (recentTurns.length > 0) {
    parts.push(`== Recent conversation ==\n${recentTurns.join('\n')}`);
  }

  const landscapeLines = Object.entries(directorInput.emotionalLandscape)
    .map(([label, desc]) => `- ${label}: ${desc}`)
    .join('\n');

  const suggestionsText = directorInput.suggestions.length > 0
    ? `\nSuggestions (follow naturally, don't force):\n${directorInput.suggestions.map(s => `- ${s}`).join('\n')}`
    : '';

  const topicText = directorInput.topicSeeds.length > 0
    ? `\n- The topic could drift toward ${directorInput.topicSeeds[Math.floor(Math.random() * directorInput.topicSeeds.length)]} if it fits`
    : '';

  parts.push(`== Direction for this segment ==
Write the next ${directorInput.targetTurnCount} turns of conversation.

Current emotional landscape:
${landscapeLines || '- Everyone is relaxed and in a good mood'}
${suggestionsText}${topicText}

Write ONLY the conversation. No preamble, no summary, no commentary.`);

  return parts.join('\n\n');
}

const TURN_REGEX = /^\[Person ([A-D])\]\s*\(([^)]+)\):\s*(.+)$/;

export function parseSegmentResponse(raw: string): ParsedTurn[] {
  const turns: ParsedTurn[] = [];
  const lines = raw.split('\n');

  let currentTurn: ParsedTurn | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(TURN_REGEX);
    if (match) {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = {
        characterLabel: `Person ${match[1]}`,
        moodTag: match[2].trim(),
        text: match[3].trim(),
      };
    } else if (currentTurn) {
      currentTurn.text += ' ' + trimmed;
    }
  }
  if (currentTurn) turns.push(currentTurn);

  return turns;
}

export function buildSegmentPrompt(
  characters: Character[],
  labelMap: Map<string, string>,
  memories: MemoryBlock[],
  recentTurns: string[],
  directorInput: DirectorInput,
): { systemPrompt: string; userMessage: string } {
  return {
    systemPrompt: buildSystemPrompt(characters, labelMap),
    userMessage: buildUserMessage(memories, recentTurns, directorInput),
  };
}

export interface GenerateSegmentOptions {
  characters: Character[];
  labelMap: Map<string, string>;
  memories: MemoryBlock[];
  recentTurns: string[];
  directorInput: DirectorInput;
  model: string;
  onChunk?: (text: string) => void;
}

export async function generateSegment(options: GenerateSegmentOptions): Promise<{ raw: string; turns: ParsedTurn[] }> {
  const client = await getClient();
  const systemPrompt = buildSystemPrompt(options.characters, options.labelMap);
  const userMessage = buildUserMessage(options.memories, options.recentTurns, options.directorInput);

  const stream = client.messages.stream({
    model: options.model,
    max_tokens: 8192,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  let fullText = '';
  stream.on('text', (text) => {
    fullText += text;
    options.onChunk?.(text);
  });

  await stream.finalMessage();

  const turns = parseSegmentResponse(fullText);
  return { raw: fullText, turns };
}

export function createLabelMap(characterIds: string[]): Map<string, string> {
  const labels = ['Person A', 'Person B', 'Person C', 'Person D'];
  const map = new Map<string, string>();
  characterIds.forEach((id, i) => {
    if (i < labels.length) map.set(id, labels[i]);
  });
  return map;
}

export function reverseLabelMap(labelMap: Map<string, string>): Map<string, string> {
  const reverse = new Map<string, string>();
  for (const [id, label] of labelMap) {
    reverse.set(label, id);
  }
  return reverse;
}
