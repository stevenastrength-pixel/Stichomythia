import { Router } from 'express';
import { readJson, writeJson, getMixerPath } from '../utils/files.js';

interface MixerConfig {
  masterVolume: number;
  channels: Array<{
    speakerId: string;
    volume: number;
    muted: boolean;
    soloed: boolean;
    eq: Array<{
      frequency: number;
      gain: number;
      Q: number;
      type: string;
    }>;
    compressorEnabled: boolean;
  }>;
}

export const mixerRouter = Router();

mixerRouter.get('/', async (_req, res) => {
  const config = await readJson<MixerConfig>(getMixerPath());
  res.json(config ?? { masterVolume: 1, channels: [] });
});

mixerRouter.put('/', async (req, res) => {
  const config: MixerConfig = {
    masterVolume: req.body.masterVolume ?? 1,
    channels: req.body.channels ?? [],
  };
  await writeJson(getMixerPath(), config);
  res.json(config);
});
