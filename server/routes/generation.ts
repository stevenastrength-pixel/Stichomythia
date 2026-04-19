import { Router } from 'express';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { readJson, writeJson, getConversationsDir, getCharactersDir } from '../utils/files.js';
import { generateSegment, createLabelMap, reverseLabelMap, parseSegmentResponse, buildSegmentPrompt } from '../services/anthropic.js';
import { analyzeSegment } from '../services/analysis.js';
import { buildFirstSegmentDirection, buildNextSegmentDirection, buildAIDirection, AI_DIRECTOR_INTERVAL } from '../services/director.js';
import { createBatch, getBatchStatus, getBatchResults } from '../services/batch.js';
import { processMemoryAfterSegment } from '../services/memory.js';

interface Character {
  id: string;
  color: string;
  personality: string;
  speechStyle: string;
  interests: string[];
  quirks: string[];
  emotionalProfile: {
    temperament: string;
    triggers: Array<{ topic: string; reaction: string; intensity: string; description: string }>;
    recoverySpeed: string;
  };
  voice: { edgeTtsVoice: string; rate: string; pitch: string };
  systemPrompt?: string;
}

interface Turn {
  id: string;
  segmentId: string;
  conversationId: string;
  sequenceNumber: number;
  characterId: string;
  text: string;
  moodTag: string;
  audioFile?: string;
  audioDurationMs?: number;
  pauseAfterMs: number;
  status: 'draft' | 'edited' | 'approved' | 'rendered';
}

interface EmotionalSummary {
  emotionalStates: Record<string, { emotion: string; intensity: number; valence: number; note: string }>;
  unresolvedThreads: string[];
  topicsCovered: string[];
  suggestedNextDirection: string;
}

interface Segment {
  id: string;
  conversationId: string;
  sequenceNumber: number;
  turns: Turn[];
  directorInput: {
    emotionalLandscape: Record<string, string>;
    suggestions: string[];
    topicSeeds: string[];
    targetTurnCount: number;
  };
  emotionalSummary: EmotionalSummary;
  rawResponse: string;
  generationMode: 'live' | 'batch';
  batchId?: string;
  createdAt: string;
  status: 'draft' | 'approved' | 'rendered';
}

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

interface Conversation {
  id: string;
  name: string;
  characterIds: string[];
  segments: Segment[];
  memories: MemoryBlock[];
  settings: {
    model: string;
    generationMode: string;
    turnsPerSegment: number;
    memorySummaryInterval: number;
    topicSeeds: string[];
    pauseRange: { minMs: number; maxMs: number };
    longPauseChance: number;
  };
  createdAt: string;
  updatedAt: string;
  totalTurns: number;
  totalDurationMs?: number;
  status: string;
}

interface PauseContext {
  text: string;
  moodTag: string;
  characterLabel: string;
  prevText?: string;
  prevMoodTag?: string;
  prevCharacterLabel?: string;
}

function generatePause(ctx: PauseContext): number {
  const mood = ctx.moodTag.toLowerCase();
  const text = ctx.text;
  const wordCount = text.split(/\s+/).length;
  const prevText = ctx.prevText ?? '';
  const prevWordCount = prevText.split(/\s+/).length;
  const sameSpeakerAsPrev = ctx.prevCharacterLabel === ctx.characterLabel;
  const isFirstTurn = !ctx.prevText;

  const isQuestion = prevText.trimEnd().endsWith('?');
  const isShortInterjection = wordCount <= 4;
  const isAgreement = /^(yeah|yep|right|exactly|totally|true|sure|mhm|mmhm|oh|ha|hah|haha|nah|nope|no way)/i.test(text.trim());
  const isInterruption = /^(wait|hold on|no no|but |actually,|well,|ok but)/i.test(text.trim());
  const prevWasShort = prevWordCount <= 4;

  let base: number;

  if (isFirstTurn) {
    base = 400;
  } else if (isInterruption) {
    base = 80 + Math.random() * 100;
  } else if (isAgreement && isShortInterjection) {
    base = 120 + Math.random() * 180;
  } else if (isQuestion && isShortInterjection) {
    base = 150 + Math.random() * 200;
  } else if (isQuestion) {
    base = 200 + Math.random() * 300;
  } else if (sameSpeakerAsPrev) {
    base = 250 + Math.random() * 250;
  } else if (prevWasShort && isShortInterjection) {
    base = 150 + Math.random() * 200;
  } else {
    base = 300 + Math.random() * 400;
  }

  if (mood.includes('excited') || mood.includes('eager') || mood.includes('enthusiastic')) {
    base *= 0.6;
  } else if (mood.includes('amused') || mood.includes('playful') || mood.includes('laughing')) {
    base *= 0.7;
  } else if (mood.includes('annoyed') || mood.includes('irritated') || mood.includes('angry') || mood.includes('defensive')) {
    base *= 0.5;
  } else if (mood.includes('thoughtful') || mood.includes('pensive') || mood.includes('considering') || mood.includes('reflective')) {
    base *= 1.8;
  } else if (mood.includes('hesitant') || mood.includes('uncertain') || mood.includes('nervous')) {
    base *= 1.6;
  } else if (mood.includes('uncomfortable') || mood.includes('awkward')) {
    base *= 2.0;
  } else if (mood.includes('sad') || mood.includes('melancholy') || mood.includes('wistful')) {
    base *= 1.4;
  } else if (mood.includes('shocked') || mood.includes('stunned') || mood.includes('surprised')) {
    base *= 1.5;
  }

  if (wordCount > 30) {
    base *= 1.3;
  }

  base *= 0.9 + Math.random() * 0.2;

  return Math.round(Math.max(60, Math.min(base, 3500)));
}

function getRecentTurns(segments: Segment[], count: number): string[] {
  const allTurns: string[] = [];
  for (const seg of segments) {
    for (const turn of seg.turns) {
      const labelMap = createLabelMap([] as string[]);
      const reverseMap = reverseLabelMap(labelMap);
      const label = Object.entries(reverseMap).find(([, id]) => id === turn.characterId)?.[0] ?? 'Person ?';
      allTurns.push(`[${label}] (${turn.moodTag}): ${turn.text}`);
    }
  }
  return allTurns.slice(-count);
}

function getRecentTurnsWithLabelMap(segments: Segment[], count: number, labelMap: Map<string, string>): string[] {
  const reverseMap = reverseLabelMap(labelMap);
  const allTurns: string[] = [];
  for (const seg of segments) {
    for (const turn of seg.turns) {
      let label = 'Person ?';
      for (const [id, lbl] of labelMap) {
        if (id === turn.characterId) { label = lbl; break; }
      }
      allTurns.push(`[${label}] (${turn.moodTag}): ${turn.text}`);
    }
  }
  return allTurns.slice(-count);
}

export const generationRouter = Router();

generationRouter.post('/generate', async (req, res) => {
  const { conversationId, segmentCount = 1 } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
    const conversation = await readJson<Conversation>(convPath);
    if (!conversation) {
      sendEvent('error', { message: 'Conversation not found' });
      res.end();
      return;
    }

    const characters: Character[] = [];
    for (const charId of conversation.characterIds) {
      const char = await readJson<Character>(path.join(getCharactersDir(), `${charId}.json`));
      if (char) characters.push(char);
    }

    if (characters.length < 2) {
      sendEvent('error', { message: 'Need at least 2 characters' });
      res.end();
      return;
    }

    const labelMap = createLabelMap(conversation.characterIds);
    const reverseMap = reverseLabelMap(labelMap);

    conversation.status = 'generating';
    await writeJson(convPath, conversation);
    sendEvent('status', { status: 'generating' });

    for (let i = 0; i < segmentCount; i++) {
      const segNum = conversation.segments.length;
      sendEvent('segment_start', { segmentIndex: i, segmentNumber: segNum });

      let directorInput;
      if (segNum === 0) {
        directorInput = buildFirstSegmentDirection(
          conversation.settings.topicSeeds,
          conversation.settings.turnsPerSegment,
        );
      } else {
        const prevSegment = conversation.segments[segNum - 1];
        const coveredTopics = conversation.segments.flatMap(s => s.emotionalSummary.topicsCovered);
        const useAIDirector = segNum > 0 && segNum % AI_DIRECTOR_INTERVAL === 0;

        if (useAIDirector) {
          try {
            const memories = conversation.memories.map(m => ({
              summary: m.summary,
              tier: m.tier,
            }));
            directorInput = await buildAIDirection(
              characters, labelMap, prevSegment.emotionalSummary,
              memories, coveredTopics, segNum, conversation.settings.turnsPerSegment,
            );
            sendEvent('director', { type: 'ai', segmentNumber: segNum });
          } catch (err) {
            console.error('AI director failed, falling back to template:', err);
            directorInput = buildNextSegmentDirection(
              prevSegment.emotionalSummary, conversation.settings.topicSeeds,
              coveredTopics, conversation.settings.turnsPerSegment, segNum,
            );
          }
        } else {
          directorInput = buildNextSegmentDirection(
            prevSegment.emotionalSummary,
            conversation.settings.topicSeeds,
            coveredTopics,
            conversation.settings.turnsPerSegment,
            segNum,
          );
        }
      }

      const memories = conversation.memories.map(m => ({
        summary: m.summary,
        tier: m.tier,
      }));

      const recentTurns = getRecentTurnsWithLabelMap(conversation.segments, 10, labelMap);

      let chunkBuffer = '';
      const result = await generateSegment({
        characters,
        labelMap,
        memories,
        recentTurns,
        directorInput,
        model: conversation.settings.model,
        onChunk: (text) => {
          chunkBuffer += text;
          sendEvent('chunk', { text, segmentIndex: i });
        },
      });

      sendEvent('segment_parsing', { segmentIndex: i });

      const segmentId = uuid();
      const turns: Turn[] = result.turns.map((t, idx) => {
        const prev = result.turns[idx - 1];
        return {
          id: uuid(),
          segmentId,
          conversationId,
          sequenceNumber: conversation.totalTurns + idx,
          characterId: reverseMap.get(t.characterLabel) ?? conversation.characterIds[0],
          text: t.text,
          moodTag: t.moodTag,
          pauseAfterMs: generatePause({
            text: t.text,
            moodTag: t.moodTag,
            characterLabel: t.characterLabel,
            prevText: prev?.text,
            prevMoodTag: prev?.moodTag,
            prevCharacterLabel: prev?.characterLabel,
          }),
          status: 'draft' as const,
        };
      });

      sendEvent('segment_analyzing', { segmentIndex: i, turnCount: turns.length });

      const emotionalSummary = await analyzeSegment(result.raw);

      const segment: Segment = {
        id: segmentId,
        conversationId,
        sequenceNumber: segNum,
        turns,
        directorInput,
        emotionalSummary,
        rawResponse: result.raw,
        generationMode: 'live',
        createdAt: new Date().toISOString(),
        status: 'draft',
      };

      conversation.segments.push(segment);
      conversation.totalTurns += turns.length;
      conversation.updatedAt = new Date().toISOString();

      const updatedMemories = await processMemoryAfterSegment(
        conversation.segments,
        conversation.memories,
        conversation.settings.memorySummaryInterval,
      );
      if (updatedMemories) {
        conversation.memories = updatedMemories;
        sendEvent('memory_updated', { memoryCount: updatedMemories.length });
      }

      await writeJson(convPath, conversation);

      sendEvent('segment_complete', {
        segmentIndex: i,
        segment: {
          id: segment.id,
          sequenceNumber: segment.sequenceNumber,
          turnCount: turns.length,
          emotionalSummary: segment.emotionalSummary,
        },
        turns,
      });
    }

    conversation.status = 'generated';
    await writeJson(convPath, conversation);
    sendEvent('complete', {
      totalSegments: conversation.segments.length,
      totalTurns: conversation.totalTurns,
      memoryCount: conversation.memories.length,
    });
  } catch (err) {
    sendEvent('error', { message: String(err) });
  }

  res.end();
});

generationRouter.post('/approve-segment/:conversationId/:segmentId', async (req, res) => {
  const { conversationId, segmentId } = req.params;
  const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
  const conversation = await readJson<Conversation>(convPath);
  if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }

  const segment = conversation.segments.find(s => s.id === segmentId);
  if (!segment) { res.status(404).json({ error: 'Segment not found' }); return; }

  segment.status = 'approved';
  for (const turn of segment.turns) {
    if (turn.status === 'draft') turn.status = 'approved';
  }

  conversation.updatedAt = new Date().toISOString();
  await writeJson(convPath, conversation);
  res.json({ success: true });
});

generationRouter.post('/approve-all/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
  const conversation = await readJson<Conversation>(convPath);
  if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }

  for (const segment of conversation.segments) {
    segment.status = 'approved';
    for (const turn of segment.turns) {
      if (turn.status === 'draft') turn.status = 'approved';
    }
  }

  conversation.updatedAt = new Date().toISOString();
  await writeJson(convPath, conversation);
  res.json({ success: true });
});

generationRouter.put('/turn/:conversationId/:turnId', async (req, res) => {
  const { conversationId, turnId } = req.params;
  const { text } = req.body;
  const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
  const conversation = await readJson<Conversation>(convPath);
  if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }

  for (const segment of conversation.segments) {
    const turn = segment.turns.find(t => t.id === turnId);
    if (turn) {
      turn.text = text;
      turn.status = 'edited';
      conversation.updatedAt = new Date().toISOString();
      await writeJson(convPath, conversation);
      res.json(turn);
      return;
    }
  }

  res.status(404).json({ error: 'Turn not found' });
});

generationRouter.delete('/turn/:conversationId/:turnId', async (req, res) => {
  const { conversationId, turnId } = req.params;
  const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
  const conversation = await readJson<Conversation>(convPath);
  if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }

  for (const segment of conversation.segments) {
    const idx = segment.turns.findIndex(t => t.id === turnId);
    if (idx !== -1) {
      segment.turns.splice(idx, 1);
      for (let j = idx; j < segment.turns.length; j++) {
        segment.turns[j].sequenceNumber--;
      }
      conversation.totalTurns--;
      conversation.updatedAt = new Date().toISOString();
      await writeJson(convPath, conversation);
      res.json({ success: true });
      return;
    }
  }

  res.status(404).json({ error: 'Turn not found' });
});

generationRouter.post('/reroll-segment/:conversationId/:segmentId', async (req, res) => {
  const { conversationId, segmentId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
    const conversation = await readJson<Conversation>(convPath);
    if (!conversation) { sendEvent('error', { message: 'Not found' }); res.end(); return; }

    const segIdx = conversation.segments.findIndex(s => s.id === segmentId);
    if (segIdx === -1) { sendEvent('error', { message: 'Segment not found' }); res.end(); return; }

    const characters: Character[] = [];
    for (const charId of conversation.characterIds) {
      const char = await readJson<Character>(path.join(getCharactersDir(), `${charId}.json`));
      if (char) characters.push(char);
    }

    const labelMap = createLabelMap(conversation.characterIds);
    const reverseMap = reverseLabelMap(labelMap);
    const oldSegment = conversation.segments[segIdx];
    const directorInput = oldSegment.directorInput;

    const priorSegments = conversation.segments.slice(0, segIdx);
    const memories = conversation.memories
      .filter(m => m.coversSegments[1] < segIdx)
      .map(m => ({ summary: m.summary, tier: m.tier }));
    const recentTurns = getRecentTurnsWithLabelMap(priorSegments, 10, labelMap);

    const removedTurnCount = oldSegment.turns.length;

    sendEvent('segment_start', { segmentIndex: 0, segmentNumber: segIdx });

    const result = await generateSegment({
      characters,
      labelMap,
      memories,
      recentTurns,
      directorInput,
      model: conversation.settings.model,
      onChunk: (text) => sendEvent('chunk', { text, segmentIndex: 0 }),
    });

    const newSegmentId = uuid();
    const baseSeqNum = oldSegment.turns[0]?.sequenceNumber ?? 0;
    const turns: Turn[] = result.turns.map((t, idx) => {
      const prev = result.turns[idx - 1];
      return {
        id: uuid(),
        segmentId: newSegmentId,
        conversationId,
        sequenceNumber: baseSeqNum + idx,
        characterId: reverseMap.get(t.characterLabel) ?? conversation.characterIds[0],
        text: t.text,
        moodTag: t.moodTag,
        pauseAfterMs: generatePause({
          text: t.text,
          moodTag: t.moodTag,
          characterLabel: t.characterLabel,
          prevText: prev?.text,
          prevMoodTag: prev?.moodTag,
          prevCharacterLabel: prev?.characterLabel,
        }),
        status: 'draft' as const,
      };
    });

    const emotionalSummary = await analyzeSegment(result.raw);

    const newSegment: Segment = {
      id: newSegmentId,
      conversationId,
      sequenceNumber: segIdx,
      turns,
      directorInput,
      emotionalSummary,
      rawResponse: result.raw,
      generationMode: 'live',
      createdAt: new Date().toISOString(),
      status: 'draft',
    };

    conversation.segments[segIdx] = newSegment;
    conversation.totalTurns += turns.length - removedTurnCount;

    let seqCounter = 0;
    for (const seg of conversation.segments) {
      for (const turn of seg.turns) {
        turn.sequenceNumber = seqCounter++;
      }
    }
    conversation.totalTurns = seqCounter;

    conversation.updatedAt = new Date().toISOString();
    await writeJson(convPath, conversation);

    sendEvent('segment_complete', {
      segmentIndex: 0,
      segment: {
        id: newSegment.id,
        sequenceNumber: newSegment.sequenceNumber,
        turnCount: turns.length,
        emotionalSummary: newSegment.emotionalSummary,
      },
      turns,
    });

    sendEvent('complete', {
      totalSegments: conversation.segments.length,
      totalTurns: conversation.totalTurns,
    });
  } catch (err) {
    sendEvent('error', { message: String(err) });
  }

  res.end();
});

generationRouter.post('/batch', async (req, res) => {
  const { conversationId, segmentCount = 5 } = req.body;

  try {
    const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
    const conversation = await readJson<Conversation>(convPath);
    if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }

    const characters: Character[] = [];
    for (const charId of conversation.characterIds) {
      const char = await readJson<Character>(path.join(getCharactersDir(), `${charId}.json`));
      if (char) characters.push(char);
    }

    if (characters.length < 2) { res.status(400).json({ error: 'Need at least 2 characters' }); return; }

    const labelMap = createLabelMap(conversation.characterIds);

    const batchRequests = [];

    let simulatedSegments = [...conversation.segments];
    let simulatedTotalTurns = conversation.totalTurns;

    for (let i = 0; i < segmentCount; i++) {
      const segNum = simulatedSegments.length;

      let directorInput;
      if (segNum === 0) {
        directorInput = buildFirstSegmentDirection(
          conversation.settings.topicSeeds,
          conversation.settings.turnsPerSegment,
        );
      } else {
        const prevSegment = simulatedSegments[segNum - 1];
        const coveredTopics = simulatedSegments.flatMap(s => s.emotionalSummary?.topicsCovered ?? []);
        directorInput = buildNextSegmentDirection(
          prevSegment.emotionalSummary,
          conversation.settings.topicSeeds,
          coveredTopics,
          conversation.settings.turnsPerSegment,
          segNum,
        );
      }

      const memories = conversation.memories.map(m => ({
        summary: m.summary,
        tier: m.tier,
      }));

      const recentTurns = getRecentTurnsWithLabelMap(simulatedSegments, 10, labelMap);

      const { systemPrompt, userMessageParts } = buildSegmentPrompt(
        characters, labelMap, memories, recentTurns, directorInput,
      );

      batchRequests.push({
        custom_id: `seg-${segNum}-${uuid()}`,
        params: {
          model: conversation.settings.model,
          max_tokens: 16384,
          system: [{
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          }],
          messages: [{
            role: 'user' as const,
            content: userMessageParts as any,
          }],
        },
      });

      if (i === 0) break;
    }

    const batch = await createBatch(batchRequests);

    conversation.status = 'generating';
    conversation.updatedAt = new Date().toISOString();
    await writeJson(convPath, conversation);

    res.json({
      batchId: batch.id,
      requestCount: batchRequests.length,
      status: batch.processing_status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

generationRouter.get('/batch-status/:batchId', async (req, res) => {
  try {
    const status = await getBatchStatus(req.params.batchId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

generationRouter.post('/batch-results/:conversationId/:batchId', async (req, res) => {
  const { conversationId, batchId } = req.params;

  try {
    const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
    const conversation = await readJson<Conversation>(convPath);
    if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }

    const results = await getBatchResults(batchId);
    const labelMap = createLabelMap(conversation.characterIds);
    const reverseMap = reverseLabelMap(labelMap);

    const newSegments: Segment[] = [];

    for (const result of results) {
      if (result.result.type !== 'succeeded' || !result.result.message) continue;

      const raw = result.result.message.content
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text!)
        .join('');

      const parsed = parseSegmentResponse(raw);

      const segNum = conversation.segments.length + newSegments.length;
      const segmentId = uuid();

      const turns: Turn[] = parsed.map((t, idx) => {
        const prev = parsed[idx - 1];
        return {
          id: uuid(),
          segmentId,
          conversationId,
          sequenceNumber: conversation.totalTurns + newSegments.reduce((a, s) => a + s.turns.length, 0) + idx,
          characterId: reverseMap.get(t.characterLabel) ?? conversation.characterIds[0],
          text: t.text,
          moodTag: t.moodTag,
          pauseAfterMs: generatePause({
            text: t.text,
            moodTag: t.moodTag,
            characterLabel: t.characterLabel,
            prevText: prev?.text,
            prevMoodTag: prev?.moodTag,
            prevCharacterLabel: prev?.characterLabel,
          }),
          status: 'draft' as const,
        };
      });

      const emotionalSummary = await analyzeSegment(raw);

      newSegments.push({
        id: segmentId,
        conversationId,
        sequenceNumber: segNum,
        turns,
        directorInput: buildFirstSegmentDirection(conversation.settings.topicSeeds, conversation.settings.turnsPerSegment),
        emotionalSummary,
        rawResponse: raw,
        generationMode: 'batch',
        batchId,
        createdAt: new Date().toISOString(),
        status: 'draft',
      });
    }

    conversation.segments.push(...newSegments);
    conversation.totalTurns += newSegments.reduce((a, s) => a + s.turns.length, 0);
    conversation.status = 'generated';
    conversation.updatedAt = new Date().toISOString();
    await writeJson(convPath, conversation);

    res.json({
      segmentsAdded: newSegments.length,
      totalSegments: conversation.segments.length,
      totalTurns: conversation.totalTurns,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

generationRouter.post('/reroll-with-direction/:conversationId/:segmentId', async (req, res) => {
  const { conversationId, segmentId } = req.params;
  const { directorInput: newDirection } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
    const conversation = await readJson<Conversation>(convPath);
    if (!conversation) { sendEvent('error', { message: 'Not found' }); res.end(); return; }

    const segIdx = conversation.segments.findIndex(s => s.id === segmentId);
    if (segIdx === -1) { sendEvent('error', { message: 'Segment not found' }); res.end(); return; }

    const characters: Character[] = [];
    for (const charId of conversation.characterIds) {
      const char = await readJson<Character>(path.join(getCharactersDir(), `${charId}.json`));
      if (char) characters.push(char);
    }

    const labelMap = createLabelMap(conversation.characterIds);
    const reverseMap = reverseLabelMap(labelMap);

    const priorSegments = conversation.segments.slice(0, segIdx);
    const memories = conversation.memories
      .filter(m => m.coversSegments[1] < segIdx)
      .map(m => ({ summary: m.summary, tier: m.tier }));
    const recentTurns = getRecentTurnsWithLabelMap(priorSegments, 10, labelMap);

    const oldSegment = conversation.segments[segIdx];
    const removedTurnCount = oldSegment.turns.length;

    sendEvent('segment_start', { segmentIndex: 0, segmentNumber: segIdx });

    const result = await generateSegment({
      characters,
      labelMap,
      memories,
      recentTurns,
      directorInput: newDirection,
      model: conversation.settings.model,
      onChunk: (text) => sendEvent('chunk', { text, segmentIndex: 0 }),
    });

    const newSegmentId = uuid();
    const baseSeqNum = oldSegment.turns[0]?.sequenceNumber ?? 0;
    const turns: Turn[] = result.turns.map((t, idx) => {
      const prev = result.turns[idx - 1];
      return {
        id: uuid(),
        segmentId: newSegmentId,
        conversationId,
        sequenceNumber: baseSeqNum + idx,
        characterId: reverseMap.get(t.characterLabel) ?? conversation.characterIds[0],
        text: t.text,
        moodTag: t.moodTag,
        pauseAfterMs: generatePause({
          text: t.text,
          moodTag: t.moodTag,
          characterLabel: t.characterLabel,
          prevText: prev?.text,
          prevMoodTag: prev?.moodTag,
          prevCharacterLabel: prev?.characterLabel,
        }),
        status: 'draft' as const,
      };
    });

    const emotionalSummary = await analyzeSegment(result.raw);

    const newSegment: Segment = {
      id: newSegmentId,
      conversationId,
      sequenceNumber: segIdx,
      turns,
      directorInput: newDirection,
      emotionalSummary,
      rawResponse: result.raw,
      generationMode: 'live',
      createdAt: new Date().toISOString(),
      status: 'draft',
    };

    conversation.segments[segIdx] = newSegment;

    let seqCounter = 0;
    for (const seg of conversation.segments) {
      for (const turn of seg.turns) {
        turn.sequenceNumber = seqCounter++;
      }
    }
    conversation.totalTurns = seqCounter;
    conversation.updatedAt = new Date().toISOString();
    await writeJson(convPath, conversation);

    sendEvent('segment_complete', {
      segmentIndex: 0,
      segment: {
        id: newSegment.id,
        sequenceNumber: newSegment.sequenceNumber,
        turnCount: turns.length,
        emotionalSummary: newSegment.emotionalSummary,
      },
      turns,
    });

    sendEvent('complete', {
      totalSegments: conversation.segments.length,
      totalTurns: conversation.totalTurns,
    });
  } catch (err) {
    sendEvent('error', { message: String(err) });
  }

  res.end();
});

generationRouter.delete('/segments-from/:conversationId/:segmentId', async (req, res) => {
  const { conversationId, segmentId } = req.params;
  const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
  const conversation = await readJson<Conversation>(convPath);
  if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }

  const segIdx = conversation.segments.findIndex(s => s.id === segmentId);
  if (segIdx === -1) { res.status(404).json({ error: 'Segment not found' }); return; }

  conversation.segments = conversation.segments.slice(0, segIdx);

  let seqCounter = 0;
  for (const seg of conversation.segments) {
    for (const turn of seg.turns) {
      turn.sequenceNumber = seqCounter++;
    }
  }
  conversation.totalTurns = seqCounter;

  conversation.memories = conversation.memories.filter(m => m.coversSegments[1] < segIdx);

  conversation.updatedAt = new Date().toISOString();
  conversation.status = conversation.segments.length > 0 ? 'generated' : 'draft';
  await writeJson(convPath, conversation);
  res.json({ success: true, totalSegments: conversation.segments.length, totalTurns: conversation.totalTurns });
});

generationRouter.post('/recalculate-pauses/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
  const conversation = await readJson<Conversation>(convPath);
  if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }

  const allTurns = conversation.segments.flatMap(s => s.turns);
  const labelMap = createLabelMap(conversation.characterIds);

  for (let i = 0; i < allTurns.length; i++) {
    const turn = allTurns[i];
    const prev = allTurns[i - 1];
    turn.pauseAfterMs = generatePause({
      text: turn.text,
      moodTag: turn.moodTag,
      characterLabel: labelMap.get(turn.characterId) ?? 'Person ?',
      prevText: prev?.text,
      prevMoodTag: prev?.moodTag,
      prevCharacterLabel: prev ? (labelMap.get(prev.characterId) ?? 'Person ?') : undefined,
    });
  }

  let totalDuration = 0;
  for (const seg of conversation.segments) {
    for (const turn of seg.turns) {
      if (turn.audioDurationMs) totalDuration += turn.audioDurationMs + turn.pauseAfterMs;
    }
  }
  conversation.totalDurationMs = totalDuration;
  conversation.updatedAt = new Date().toISOString();
  await writeJson(convPath, conversation);

  res.json({ success: true, totalTurns: allTurns.length, totalDurationMs: totalDuration });
});

generationRouter.get('/memories/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
  const conversation = await readJson<Conversation>(convPath);
  if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(conversation.memories);
});

generationRouter.post('/trigger-memory/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
  const conversation = await readJson<Conversation>(convPath);
  if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }

  if (conversation.segments.length === 0) {
    res.json({ success: false, message: 'No segments to summarize' });
    return;
  }

  const updatedMemories = await processMemoryAfterSegment(
    conversation.segments,
    conversation.memories,
    1,
  );

  if (updatedMemories) {
    conversation.memories = updatedMemories;
    conversation.updatedAt = new Date().toISOString();
    await writeJson(convPath, conversation);
    res.json({ success: true, memoryCount: updatedMemories.length, memories: updatedMemories });
  } else {
    res.json({ success: false, message: 'No new segments to summarize' });
  }
});
