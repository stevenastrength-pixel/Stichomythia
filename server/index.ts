import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env' });
}
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { ensureDataDirs, getAudioDir } from './utils/files.js';
import { charactersRouter } from './routes/characters.js';
import { conversationsRouter } from './routes/conversations.js';
import { settingsRouter } from './routes/settings.js';
import { ttsRouter } from './routes/tts.js';
import { generationRouter } from './routes/generation.js';
import { exportRouter } from './routes/export.js';
import { speakersRouter } from './routes/speakers.js';
import { mixerRouter } from './routes/mixer.js';
import { tracksRouter } from './routes/tracks.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/characters', charactersRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/generation', generationRouter);
app.use('/api/export', exportRouter);
app.use('/api/speakers', speakersRouter);
app.use('/api/mixer', mixerRouter);
app.use('/api/tracks', tracksRouter);

app.use('/audio', express.static(getAudioDir()));

function findDistDir(): string | null {
  const candidates = [
    process.env.RESOURCES_PATH ? path.join(process.env.RESOURCES_PATH, 'dist') : '',
    path.resolve('dist'),
    path.resolve('..', 'dist'),
    path.join(path.dirname(process.argv[1] || __filename), '..', 'dist'),
    path.join(path.dirname(process.argv[1] || __filename), 'dist'),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'index.html'))) {
        return dir;
      }
    } catch {}
  }
  return null;
}

const distPath = findDistDir();
if (distPath) {
  console.log(`[server] Serving frontend from: ${distPath}`);
  app.use(express.static(distPath));
  app.get('{*path}', (_req, res, next) => {
    if (_req.path.startsWith('/api') || _req.path.startsWith('/audio')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.log('[server] No dist directory found — frontend not served (dev mode uses Vite)');
}

async function start() {
  await ensureDataDirs();
  app.listen(PORT, () => {
    console.log(`Stichomythia server running on http://localhost:${PORT}`);
  });
}

start();
