import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuid } from 'uuid';
import { getAudioDir, ensureDir } from '../utils/files.js';

const execFileAsync = promisify(execFile);

interface RenderOptions {
  text: string;
  voice: string;
  rate: string;
  pitch: string;
  conversationId: string;
  turnId: string;
}

interface RenderResult {
  turnId: string;
  audioFile: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    // MP3 at ~128kbps: bytes / (128000/8) * 1000 = rough ms estimate
    // More accurate: use file size and assume ~128kbps bitrate
    return Math.round((stats.size / 16000) * 1000);
  } catch {
    return 3000;
  }
}

async function renderWithRetry(
  args: string[],
  outputPath: string,
  maxRetries: number = 3,
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await execFileAsync('edge-tts', args, { timeout: 30000 });
      const stats = await fs.stat(outputPath);
      if (stats.size > 0) return;
      throw new Error('Empty output file');
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      const delay = 1000 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

export async function renderTurn(options: RenderOptions): Promise<RenderResult> {
  const audioDir = path.join(getAudioDir(), options.conversationId);
  await ensureDir(audioDir);

  const filename = `${options.turnId}.mp3`;
  const outputPath = path.join(audioDir, filename);

  try {
    const args = [
      '--voice', options.voice,
      '--rate', options.rate,
      '--pitch', options.pitch,
      '--text', options.text,
      '--write-media', outputPath,
    ];

    await renderWithRetry(args, outputPath);

    const durationMs = await getAudioDuration(outputPath);

    return {
      turnId: options.turnId,
      audioFile: `/audio/${options.conversationId}/${filename}`,
      durationMs,
      success: true,
    };
  } catch (err) {
    return {
      turnId: options.turnId,
      audioFile: '',
      durationMs: 0,
      success: false,
      error: String(err),
    };
  }
}

export async function renderTurnsWithThrottle(
  turns: Array<RenderOptions>,
  throttleMs: number,
  onProgress: (result: RenderResult, index: number, total: number) => void,
): Promise<RenderResult[]> {
  const results: RenderResult[] = [];

  for (let i = 0; i < turns.length; i++) {
    const result = await renderTurn(turns[i]);
    results.push(result);
    onProgress(result, i, turns.length);

    if (i < turns.length - 1) {
      await new Promise(r => setTimeout(r, throttleMs));
    }
  }

  return results;
}
