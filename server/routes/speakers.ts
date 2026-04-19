import { Router } from 'express';
import { readJson, writeJson, getSpeakersPath } from '../utils/files.js';

interface SpeakerConfig {
  speakers: Array<{
    id: string;
    deviceId: string;
    label: string;
    deviceLabel: string;
  }>;
  updatedAt: string;
}

export const speakersRouter = Router();

speakersRouter.get('/', async (_req, res) => {
  const config = await readJson<SpeakerConfig>(getSpeakersPath());
  res.json(config ?? { speakers: [], updatedAt: new Date().toISOString() });
});

speakersRouter.put('/', async (req, res) => {
  const config: SpeakerConfig = {
    speakers: req.body.speakers ?? [],
    updatedAt: new Date().toISOString(),
  };
  await writeJson(getSpeakersPath(), config);
  res.json(config);
});
