import Anthropic from '@anthropic-ai/sdk';
import { readJson, getSettingsPath } from '../utils/files.js';

interface Character {
  id: string;
  personality: string;
  speechStyle: string;
  interests: string[];
  quirks: string[];
  emotionalProfile: {
    temperament: string;
    triggers: Array<{ topic: string; reaction: string; intensity: string; description: string }>;
    recoverySpeed: string;
  };
}

interface MemoryBlock {
  summary: string;
  tier: 'recent' | 'mid' | 'old';
}

let clientInstance: Anthropic | null = null;
let lastKey = '';

async function getClient(): Promise<Anthropic> {
  const key = process.env.ANTHROPIC_API_KEY
    || (await readJson<{ anthropicApiKey?: string }>(getSettingsPath()))?.anthropicApiKey
    || '';
  if (!clientInstance || key !== lastKey) {
    clientInstance = new Anthropic({ apiKey: key });
    lastKey = key;
  }
  return clientInstance;
}

export async function buildAIDirection(
  characters: Character[],
  labelMap: Map<string, string>,
  previousSummary: EmotionalSummary,
  memories: MemoryBlock[],
  coveredTopics: string[],
  segmentNumber: number,
  targetTurnCount: number,
): Promise<DirectorInput> {
  const client = await getClient();

  const charProfiles = characters.map(c => {
    const label = labelMap.get(c.id)!;
    return `${label}: ${c.personality}. Interests: ${c.interests.join(', ')}. Quirks: ${c.quirks.join(', ')}. Temperament: ${c.emotionalProfile.temperament}. Triggers: ${c.emotionalProfile.triggers.map(t => `${t.topic} (${t.reaction})`).join(', ') || 'none'}.`;
  }).join('\n');

  const memoryText = memories.length > 0
    ? memories.map(m => m.summary).join('\n\n')
    : 'No previous conversation history.';

  const emotionalState = Object.entries(previousSummary.emotionalStates)
    .map(([label, s]) => `${label}: ${s.emotion} (intensity ${s.intensity}, ${s.note || 'no note'})`)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: `You are the director of a naturalistic conversation between four people. Your job is to guide the next segment of their conversation by providing emotional landscape and creative suggestions.

You are NOT writing the conversation. You are writing stage direction — describing where the conversation should go emotionally, what dynamics should shift, what topics could come up, and what the pacing should feel like.

Think about:
- Character dynamics that should evolve (who's been too quiet? who's dominating? any tension building?)
- Narrative pacing (has it been intense? time for a breather? time to escalate?)
- Callbacks to earlier moments that could resurface naturally
- Topics that would be interesting for THESE specific characters given their personalities and triggers
- Emotional arcs — not every segment needs conflict, but the conversation should feel like it's going somewhere

Return a JSON object:
{
  "emotionalLandscape": { "Person A": "description", "Person B": "description", ... },
  "suggestions": ["suggestion 1", "suggestion 2", ...]
}

Keep suggestions to 2-4 items. Write them as natural nudges, not rigid commands. The AI writing the conversation can ignore them if the flow calls for it.

Return ONLY the JSON object.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Segment ${segmentNumber + 1} of the conversation. Each segment is about ${targetTurnCount} turns.

CHARACTER PROFILES:
${charProfiles}

CONVERSATION SO FAR (memory summaries):
${memoryText}

CURRENT EMOTIONAL STATE (end of last segment):
${emotionalState}

UNRESOLVED THREADS: ${previousSummary.unresolvedThreads.join(', ') || 'none'}

TOPICS ALREADY COVERED: ${coveredTopics.join(', ') || 'none'}

Write the direction for the next segment.`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        emotionalLandscape: parsed.emotionalLandscape ?? {},
        suggestions: parsed.suggestions ?? [],
        topicSeeds: [],
        targetTurnCount,
      };
    } catch {}
  }

  return buildNextSegmentDirection(previousSummary, [], coveredTopics, targetTurnCount, segmentNumber);
}

export const AI_DIRECTOR_INTERVAL = 3;

const TOPIC_DRIFTS = [
  'Someone brings up something completely unrelated that just popped into their head',
  'A random observation about their surroundings sparks a new tangent',
  'Someone shares a story from their week that has nothing to do with what they were talking about',
  'The conversation hits a natural lull and someone changes the subject entirely',
  'Someone remembers something they wanted to tell the group about',
  'A passing thought derails the current topic into something unexpected',
  'Someone asks the group a random question out of nowhere',
  'An old memory surfaces and someone shares it, shifting the whole conversation',
  'Someone brings up something they read, watched, or heard recently',
  'A small disagreement fizzles out and someone pivots to a lighter subject',
  'Someone mentions a plan or idea they have been thinking about',
  'The group gets into a hypothetical or "what would you do" scenario',
  'Someone confesses something minor or embarrassing, taking things in a new direction',
  'A joke or offhand comment accidentally opens up a deeper conversation',
  'Someone asks for advice about something unrelated to the current topic',
];

interface EmotionalSummary {
  emotionalStates: Record<string, {
    emotion: string;
    intensity: number;
    valence: number;
    note: string;
  }>;
  unresolvedThreads: string[];
  topicsCovered: string[];
  suggestedNextDirection: string;
}

interface DirectorInput {
  emotionalLandscape: Record<string, string>;
  suggestions: string[];
  topicSeeds: string[];
  targetTurnCount: number;
}

export function buildFirstSegmentDirection(
  topicSeeds: string[],
  targetTurnCount: number,
): DirectorInput {
  const suggestions: string[] = [];

  if (topicSeeds.length > 0) {
    suggestions.push(`Start the conversation around ${topicSeeds[0]} — someone brings it up naturally`);
    if (topicSeeds.length > 1) {
      suggestions.push(`The conversation could also touch on ${topicSeeds.slice(1).join(', ')}`);
    }
  } else {
    suggestions.push('Start with casual small talk — someone brings up something on their mind');
  }

  return {
    emotionalLandscape: {
      'Person A': 'relaxed, settling in',
      'Person B': 'upbeat, ready to chat',
      'Person C': 'calm, listening',
      'Person D': 'alert, in a good mood',
    },
    suggestions,
    topicSeeds,
    targetTurnCount,
  };
}

export function buildNextSegmentDirection(
  previousSummary: EmotionalSummary,
  topicSeeds: string[],
  coveredTopics: string[],
  targetTurnCount: number,
  segmentNumber: number = 1,
): DirectorInput {
  const emotionalLandscape: Record<string, string> = {};
  for (const [label, state] of Object.entries(previousSummary.emotionalStates)) {
    const intensityWord =
      state.intensity > 0.7 ? 'very' :
      state.intensity > 0.4 ? 'somewhat' :
      'mildly';
    const note = state.note ? ` — ${state.note}` : '';
    emotionalLandscape[label] = `${intensityWord} ${state.emotion}${note}`;
  }

  const suggestions: string[] = [];

  if (previousSummary.suggestedNextDirection && Math.random() > 0.3) {
    suggestions.push(previousSummary.suggestedNextDirection);
  }

  if (previousSummary.unresolvedThreads.length > 0 && Math.random() > 0.4) {
    const thread = previousSummary.unresolvedThreads[
      Math.floor(Math.random() * previousSummary.unresolvedThreads.length)
    ];
    suggestions.push(`The unresolved thread about "${thread}" could resurface`);
  }

  const driftChance = Math.min(0.8, 0.3 + segmentNumber * 0.1);
  if (Math.random() < driftChance) {
    const drift = TOPIC_DRIFTS[Math.floor(Math.random() * TOPIC_DRIFTS.length)];
    suggestions.push(`At some point in this segment: ${drift.toLowerCase()}`);
  }

  if (segmentNumber > 2 && Math.random() < 0.4) {
    suggestions.push('Let the conversation breathe — not every moment needs to be high-energy or meaningful. Sometimes people just chat about nothing for a bit.');
  }

  const seedsToUse = topicSeeds.filter(s => !coveredTopics.includes(s));

  return {
    emotionalLandscape,
    suggestions,
    topicSeeds: seedsToUse,
    targetTurnCount,
  };
}
