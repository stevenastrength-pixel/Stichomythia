import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readJson, writeJson, getSettingsPath } from '../utils/files.js';

const execFileAsync = promisify(execFile);

interface AppSettings {
  anthropicApiKey: string;
  defaultModel: string;
  defaultGenerationMode: string;
  turnsPerSegment: number;
  memorySummaryInterval: number;
  ttsThrottleMs: number;
  defaultPauseRange: { minMs: number; maxMs: number };
  longPauseChance: number;
  dataDirectory: string;
  exportDirectory: string;
  ffmpegPath: string;
  setupComplete: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  anthropicApiKey: '',
  defaultModel: 'claude-opus-4-6',
  defaultGenerationMode: 'batch',
  turnsPerSegment: 60,
  memorySummaryInterval: 3,
  ttsThrottleMs: 750,
  defaultPauseRange: { minMs: 300, maxMs: 2000 },
  longPauseChance: 0.1,
  dataDirectory: './data',
  exportDirectory: './exports',
  ffmpegPath: 'ffmpeg',
  setupComplete: false,
};

export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res) => {
  const settings = await readJson<AppSettings>(getSettingsPath());
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && !merged.anthropicApiKey) {
    merged.anthropicApiKey = apiKey;
  }
  const safe = { ...merged, anthropicApiKey: merged.anthropicApiKey ? '••••••••' : '' };
  res.json(safe);
});

settingsRouter.put('/', async (req, res) => {
  const existing = (await readJson<AppSettings>(getSettingsPath())) ?? {};
  const updated = { ...DEFAULT_SETTINGS, ...existing, ...req.body };
  if (req.body.anthropicApiKey) {
    process.env.ANTHROPIC_API_KEY = req.body.anthropicApiKey;
  }
  await writeJson(getSettingsPath(), updated);
  const safe = { ...updated, anthropicApiKey: updated.anthropicApiKey ? '••••••••' : '' };
  res.json(safe);
});

settingsRouter.post('/verify-api-key', async (req, res) => {
  const key = req.body.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.json({ valid: false, error: 'No API key provided' });
    return;
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
    });
    if (response.ok) {
      res.json({ valid: true });
    } else {
      const body = await response.text();
      res.json({ valid: false, error: body });
    }
  } catch (err) {
    res.json({ valid: false, error: String(err) });
  }
});

settingsRouter.post('/verify-edge-tts', async (_req, res) => {
  const { exec } = await import('child_process');
  const tryCommand = (cmd: string): Promise<boolean> =>
    new Promise((resolve) => {
      exec(cmd, { timeout: 15000 }, (err) => resolve(!err));
    });

  const found =
    await tryCommand('edge-tts --list-voices') ||
    await tryCommand('python -m edge_tts --list-voices') ||
    await tryCommand('python3 -m edge_tts --list-voices');

  res.json(found
    ? { installed: true }
    : { installed: false, error: 'edge-tts not found. Install with: pip install edge-tts' }
  );
});

settingsRouter.post('/verify-ffmpeg', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    const version = stdout.split('\n')[0] ?? '';
    res.json({ installed: true, version });
  } catch {
    res.json({
      installed: false,
      error: 'ffmpeg not found. Install from https://ffmpeg.org/download.html',
    });
  }
});
