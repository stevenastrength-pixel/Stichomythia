import { Router } from 'express';
import path from 'path';
import { readJson, getConversationsDir, getCharactersDir, getSettingsPath } from '../utils/files.js';
import { exportConversation } from '../services/export.js';

interface Character {
  id: string;
  color: string;
  personality: string;
  voice: { edgeTtsVoice: string; rate: string; pitch: string };
}

interface Turn {
  id: string;
  sequenceNumber: number;
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
  sequenceNumber: number;
  turns: Turn[];
}

interface Conversation {
  id: string;
  name: string;
  characterIds: string[];
  segments: Segment[];
  updatedAt: string;
  status: string;
}

interface Settings {
  ffmpegPath: string;
}

export const exportRouter = Router();

exportRouter.post('/', async (req, res) => {
  const { conversationId } = req.body;

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

    const characters: Character[] = [];
    for (const charId of conversation.characterIds) {
      const char = await readJson<Character>(path.join(getCharactersDir(), `${charId}.json`));
      if (char) characters.push(char);
    }

    const settings = await readJson<Settings>(getSettingsPath());

    const result = await exportConversation({
      conversationId: conversation.id,
      conversationName: conversation.name,
      segments: conversation.segments,
      characters,
      characterIds: conversation.characterIds,
      ffmpegPath: settings?.ffmpegPath ?? 'ffmpeg',
      onProgress: sendEvent,
    });

    sendEvent('done', result);
  } catch (err) {
    sendEvent('error', { message: String(err) });
  }

  res.end();
});
