import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { ensureDir, getExportsDir, getAudioDir, readJson, getSettingsPath } from '../utils/files.js';

const execFileAsync = promisify(execFile);

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

interface Character {
  id: string;
  color: string;
  personality: string;
  voice: { edgeTtsVoice: string; rate: string; pitch: string };
}

interface ExportOptions {
  conversationId: string;
  conversationName: string;
  segments: Segment[];
  characters: Character[];
  characterIds: string[];
  ffmpegPath: string;
  onProgress: (event: string, data: unknown) => void;
}

export async function exportConversation(options: ExportOptions): Promise<{
  exportDir: string;
  totalFiles: number;
  totalDurationMs: number;
}> {
  const slug = options.conversationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const exportDir = path.join(getExportsDir(), slug);
  const audioExportDir = path.join(exportDir, 'audio');

  await ensureDir(exportDir);
  await ensureDir(audioExportDir);

  const renderedTurns = options.segments
    .flatMap(s => s.turns)
    .filter(t => t.status === 'rendered' && t.audioFile);

  if (renderedTurns.length === 0) {
    throw new Error('No rendered turns to export');
  }

  let totalDurationMs = 0;
  let filesCopied = 0;

  options.onProgress('export_start', { totalTurns: renderedTurns.length });

  for (let i = 0; i < renderedTurns.length; i++) {
    const turn = renderedTurns[i];
    const seqStr = String(i + 1).padStart(6, '0');
    const destFilename = `${seqStr}.mp3`;
    const destPath = path.join(audioExportDir, destFilename);

    const relativePath = turn.audioFile!.replace(/^\/audio\//, '');
    const srcPath = path.join(getAudioDir(), relativePath);
    try {
      await fs.copyFile(srcPath, destPath);
      filesCopied++;
      totalDurationMs += (turn.audioDurationMs ?? 0) + turn.pauseAfterMs;
    } catch (err) {
      options.onProgress('copy_error', { turnId: turn.id, error: String(err) });
    }

    if ((i + 1) % 10 === 0 || i === renderedTurns.length - 1) {
      options.onProgress('copy_progress', { copied: filesCopied, total: renderedTurns.length });
    }
  }

  let mixdownDone = false;
  {
    options.onProgress('mixdown_start', {});

    const listFilePath = path.join(exportDir, 'ffmpeg-list.txt');
    const lines: string[] = [];

    for (let i = 0; i < renderedTurns.length; i++) {
      const seqStr = String(i + 1).padStart(6, '0');
      const audioPath = path.join(audioExportDir, `${seqStr}.mp3`).replace(/\\/g, '/');
      lines.push(`file '${audioPath}'`);

      if (i < renderedTurns.length - 1) {
        const pauseSec = renderedTurns[i].pauseAfterMs / 1000;
        if (pauseSec > 0) {
          const silencePath = path.join(exportDir, `silence-${i}.mp3`).replace(/\\/g, '/');
          try {
            await execFileAsync(options.ffmpegPath, [
              '-y', '-f', 'lavfi', '-i',
              `anullsrc=r=44100:cl=mono`,
              '-t', pauseSec.toFixed(3),
              '-q:a', '9',
              silencePath,
            ], { timeout: 10000 });
            lines.push(`file '${silencePath}'`);
          } catch {
            // Skip silence on failure
          }
        }
      }
    }

    await fs.writeFile(listFilePath, lines.join('\n'));

    const mixdownPath = path.join(exportDir, 'mix-down.mp3');

    try {
      await execFileAsync(options.ffmpegPath, [
        '-y', '-f', 'concat', '-safe', '0',
        '-i', listFilePath,
        '-c:a', 'libmp3lame',
        '-q:a', '2',
        mixdownPath,
      ], { timeout: 600000 });
      mixdownDone = true;
      options.onProgress('mixdown_complete', {});
    } catch (err) {
      options.onProgress('mixdown_error', { error: String(err) });
    }

    // Clean up silence files and list
    const silenceFiles = (await fs.readdir(exportDir)).filter(f => f.startsWith('silence-'));
    for (const f of silenceFiles) {
      await fs.unlink(path.join(exportDir, f)).catch(() => {});
    }
    await fs.unlink(listFilePath).catch(() => {});
  }

  options.onProgress('export_complete', {
    exportDir,
    filesCopied,
    totalDurationMs,
    mixdown: mixdownDone,
  });

  return {
    exportDir,
    totalFiles: filesCopied,
    totalDurationMs,
  };
}
