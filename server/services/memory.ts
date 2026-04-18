import { summarizeForMemory, compressMemory } from './analysis.js';

interface MemoryBlock {
  coversSegments: [number, number];
  coversTurns: [number, number];
  summary: string;
  keyTopics: string[];
  emotionalHighlights: string[];
  runningJokes: string[];
  tier: 'recent' | 'mid' | 'old';
  createdAt: string;
}

interface Segment {
  sequenceNumber: number;
  turns: Array<{ sequenceNumber: number; text: string }>;
  rawResponse: string;
}

const TIER_WORD_COUNTS = {
  recent: 200,
  mid: 80,
  old: 30,
};

export function shouldCreateMemory(segmentCount: number, interval: number): boolean {
  return segmentCount > 0 && segmentCount % interval === 0;
}

export async function createMemoryBlock(
  segments: Segment[],
  startSegIdx: number,
  endSegIdx: number,
): Promise<MemoryBlock> {
  const targetSegments = segments.slice(startSegIdx, endSegIdx + 1);
  const dialogues = targetSegments.map(s => s.rawResponse);

  const firstTurn = targetSegments[0]?.turns[0]?.sequenceNumber ?? 0;
  const lastSeg = targetSegments[targetSegments.length - 1];
  const lastTurn = lastSeg?.turns[lastSeg.turns.length - 1]?.sequenceNumber ?? 0;

  const result = await summarizeForMemory(dialogues, TIER_WORD_COUNTS.recent);

  return {
    coversSegments: [startSegIdx, endSegIdx],
    coversTurns: [firstTurn, lastTurn],
    summary: result.summary,
    keyTopics: result.keyTopics,
    emotionalHighlights: result.emotionalHighlights,
    runningJokes: result.runningJokes,
    tier: 'recent',
    createdAt: new Date().toISOString(),
  };
}

export async function retiereMemories(memories: MemoryBlock[]): Promise<MemoryBlock[]> {
  if (memories.length <= 3) return memories;

  const updated = [...memories];

  for (let i = 0; i < updated.length; i++) {
    const blocksFromEnd = updated.length - i;
    let targetTier: MemoryBlock['tier'];

    if (blocksFromEnd <= 3) {
      targetTier = 'recent';
    } else if (blocksFromEnd <= 8) {
      targetTier = 'mid';
    } else {
      targetTier = 'old';
    }

    if (updated[i].tier !== targetTier) {
      const targetWords = TIER_WORD_COUNTS[targetTier];
      const compressed = await compressMemory(updated[i].summary, targetWords);
      updated[i] = {
        ...updated[i],
        summary: compressed,
        tier: targetTier,
      };
    }
  }

  return updated;
}

export async function processMemoryAfterSegment(
  segments: Segment[],
  existingMemories: MemoryBlock[],
  memorySummaryInterval: number,
): Promise<MemoryBlock[] | null> {
  const segmentCount = segments.length;

  if (!shouldCreateMemory(segmentCount, memorySummaryInterval)) {
    return null;
  }

  const lastMemoryEnd = existingMemories.length > 0
    ? existingMemories[existingMemories.length - 1].coversSegments[1]
    : -1;

  const startIdx = lastMemoryEnd + 1;
  const endIdx = segmentCount - 1;

  if (startIdx > endIdx) return null;

  const newBlock = await createMemoryBlock(segments, startIdx, endIdx);
  const allMemories = [...existingMemories, newBlock];

  return retiereMemories(allMemories);
}
