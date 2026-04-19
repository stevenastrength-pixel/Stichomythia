import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuid } from 'uuid';
import { getAudioDir, ensureDir, readJson, writeJson, getConversationsDir, getCharactersDir } from '../utils/files.js';
import { renderTurnsWithThrottle, renderTurn } from '../services/tts.js';

const execFileAsync = promisify(execFile);

interface Character {
  id: string;
  voice: { edgeTtsVoice: string; rate: string; pitch: string };
}

interface Turn {
  id: string;
  characterId: string;
  text: string;
  moodTag: string;
  audioFile?: string;
  audioDurationMs?: number;
  pauseAfterMs: number;
  status: string;
}

interface Segment {
  id: string;
  turns: Turn[];
  status: string;
}

interface Conversation {
  id: string;
  characterIds: string[];
  segments: Segment[];
  updatedAt: string;
  totalDurationMs?: number;
  status: string;
}

export const ttsRouter = Router();

async function runListVoices(): Promise<string> {
  const { exec: execCb } = await import('child_process');
  const tryCmd = (cmd: string): Promise<string> =>
    new Promise((resolve, reject) => {
      execCb(cmd, { timeout: 15000 }, (err, stdout) => err ? reject(err) : resolve(stdout));
    });

  try { return await tryCmd('edge-tts --list-voices'); } catch {}
  try { return await tryCmd('python -m edge_tts --list-voices'); } catch {}
  return await tryCmd('python3 -m edge_tts --list-voices');
}

ttsRouter.get('/voices', async (_req, res) => {
  try {
    const stdout = await runListVoices();

    const voices: Array<{
      name: string;
      gender: string;
      locale: string;
      friendlyName: string;
    }> = [];

    const lines = stdout.split('\n');
    let current: Record<string, string> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Name:')) {
        if (current.Name) {
          if (current.Name.startsWith('en-')) {
            voices.push({
              name: current.Name,
              gender: current.Gender ?? '',
              locale: current.Locale ?? current.Name.split('-').slice(0, 2).join('-'),
              friendlyName:
                current.FriendlyName ?? current.Name.split('-').pop()?.replace('Neural', '') ?? '',
            });
          }
        }
        current = {};
        current.Name = trimmed.replace('Name: ', '').trim();
      } else if (trimmed.startsWith('Gender:')) {
        current.Gender = trimmed.replace('Gender: ', '').trim();
      } else if (trimmed.startsWith('Locale:')) {
        current.Locale = trimmed.replace('Locale: ', '').trim();
      } else if (trimmed.startsWith('FriendlyName:')) {
        current.FriendlyName = trimmed.replace('FriendlyName: ', '').trim();
      }
    }

    if (current.Name?.startsWith('en-')) {
      voices.push({
        name: current.Name,
        gender: current.Gender ?? '',
        locale: current.Locale ?? '',
        friendlyName: current.FriendlyName ?? '',
      });
    }

    res.json(voices);
  } catch (err) {
    res.status(500).json({ error: `Failed to list voices: ${err}` });
  }
});

ttsRouter.post('/preview', async (req, res) => {
  const { text, voice, rate, pitch } = req.body;
  if (!text || !voice) {
    res.status(400).json({ error: 'text and voice are required' });
    return;
  }

  const tempDir = path.join(getAudioDir(), 'previews');
  await ensureDir(tempDir);
  const filename = `preview-${uuid()}.mp3`;
  const outputPath = path.join(tempDir, filename);

  try {
    const result = await renderTurn({
      text,
      voice,
      rate: rate ?? '+0%',
      pitch: pitch ?? '+0Hz',
      conversationId: 'previews',
      turnId: `preview-${uuid()}`,
    });

    if (!result.success) {
      res.status(500).json({ error: `TTS failed: ${result.error}` });
      return;
    }

    const fullPath = path.join(getAudioDir(), 'previews', path.basename(result.audioFile));
    const audioData = await fs.readFile(fullPath);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioData);

    fs.unlink(fullPath).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: `TTS failed: ${err}` });
  }
});

ttsRouter.post('/render', async (req, res) => {
  const { conversationId, segmentIds, throttleMs = 750 } = req.body;

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

    const charMap = new Map<string, Character>();
    for (const charId of conversation.characterIds) {
      const char = await readJson<Character>(path.join(getCharactersDir(), `${charId}.json`));
      if (char) charMap.set(char.id, char);
    }

    const targetSegments = segmentIds
      ? conversation.segments.filter(s => segmentIds.includes(s.id))
      : conversation.segments;

    const turnsToRender = targetSegments
      .flatMap(s => s.turns)
      .filter(t => t.status === 'approved' || t.status === 'edited');

    if (turnsToRender.length === 0) {
      sendEvent('error', { message: 'No approved turns to render' });
      res.end();
      return;
    }

    sendEvent('render_start', { totalTurns: turnsToRender.length });

    conversation.status = 'rendering';
    await writeJson(convPath, conversation);

    const renderOptions = turnsToRender.map(turn => {
      const char = charMap.get(turn.characterId);
      return {
        text: turn.text,
        voice: char?.voice.edgeTtsVoice ?? 'en-US-GuyNeural',
        rate: char?.voice.rate ?? '+0%',
        pitch: char?.voice.pitch ?? '+0Hz',
        conversationId,
        turnId: turn.id,
      };
    });

    await renderTurnsWithThrottle(renderOptions, throttleMs, (result, index, total) => {
      for (const seg of conversation.segments) {
        const turn = seg.turns.find(t => t.id === result.turnId);
        if (turn) {
          if (result.success) {
            turn.audioFile = result.audioFile;
            turn.audioDurationMs = result.durationMs;
            turn.status = 'rendered';
          }
          break;
        }
      }

      sendEvent('turn_rendered', {
        turnId: result.turnId,
        audioFile: result.audioFile,
        durationMs: result.durationMs,
        success: result.success,
        error: result.error,
        progress: index + 1,
        total,
      });
    });

    let totalDuration = 0;
    let allRendered = true;
    for (const seg of conversation.segments) {
      let segRendered = true;
      for (const turn of seg.turns) {
        if (turn.audioDurationMs) totalDuration += turn.audioDurationMs + turn.pauseAfterMs;
        if (turn.status !== 'rendered') segRendered = false;
      }
      if (segRendered && seg.turns.length > 0) seg.status = 'rendered';
      if (!segRendered) allRendered = false;
    }

    conversation.totalDurationMs = totalDuration;
    if (allRendered) conversation.status = 'rendered';
    else conversation.status = 'generated';
    conversation.updatedAt = new Date().toISOString();
    await writeJson(convPath, conversation);

    sendEvent('render_complete', {
      totalRendered: renderOptions.length,
      totalDurationMs: totalDuration,
    });
  } catch (err) {
    sendEvent('error', { message: String(err) });
  }

  res.end();
});

ttsRouter.post('/rerender-turn', async (req, res) => {
  const { conversationId, turnId } = req.body;

  const convPath = path.join(getConversationsDir(), `${conversationId}.json`);
  const conversation = await readJson<Conversation>(convPath);
  if (!conversation) { res.status(404).json({ error: 'Not found' }); return; }

  let targetTurn: Turn | undefined;
  for (const seg of conversation.segments) {
    targetTurn = seg.turns.find(t => t.id === turnId);
    if (targetTurn) break;
  }
  if (!targetTurn) { res.status(404).json({ error: 'Turn not found' }); return; }

  const char = await readJson<Character>(
    path.join(getCharactersDir(), `${targetTurn.characterId}.json`),
  );

  const { renderTurn } = await import('../services/tts.js');
  const result = await renderTurn({
    text: targetTurn.text,
    voice: char?.voice.edgeTtsVoice ?? 'en-US-GuyNeural',
    rate: char?.voice.rate ?? '+0%',
    pitch: char?.voice.pitch ?? '+0Hz',
    conversationId,
    turnId,
  });

  if (result.success) {
    targetTurn.audioFile = result.audioFile;
    targetTurn.audioDurationMs = result.durationMs;
    targetTurn.status = 'rendered';
    conversation.updatedAt = new Date().toISOString();
    await writeJson(convPath, conversation);
  }

  res.json(result);
});
