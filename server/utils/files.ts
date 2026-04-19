import fs from 'fs/promises';
import path from 'path';
import os from 'os';

function getAppDataRoot(): string {
  if (process.env.STICHOMYTHIA_DATA) return process.env.STICHOMYTHIA_DATA;
  const docs = process.platform === 'win32'
    ? path.join(os.homedir(), 'Documents')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Documents')
      : os.homedir();
  return path.join(docs, 'Stichomythia');
}

function getLegacyDataRoot(): string {
  const appData = process.env.APPDATA
    || (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  return path.join(appData, 'stichomythia-data');
}

const DATA_DIR = getAppDataRoot();
const EXPORTS_DIR = path.join(DATA_DIR, 'exports');

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function migrateFromLegacy(): Promise<void> {
  const legacyDir = getLegacyDataRoot();
  try {
    await fs.access(legacyDir);
  } catch {
    return;
  }

  try {
    await fs.access(path.join(DATA_DIR, 'settings.json'));
    return;
  } catch {}

  console.log(`[server] Migrating data from ${legacyDir} to ${DATA_DIR}`);
  await ensureDir(DATA_DIR);
  const entries = await fs.readdir(legacyDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(legacyDir, entry.name);
    const dest = path.join(DATA_DIR, entry.name);
    await fs.cp(src, dest, { recursive: true });
  }
  console.log(`[server] Migration complete`);
}

export async function ensureDataDirs(): Promise<void> {
  await migrateFromLegacy();
  await Promise.all([
    ensureDir(path.join(DATA_DIR, 'characters')),
    ensureDir(path.join(DATA_DIR, 'conversations')),
    ensureDir(path.join(DATA_DIR, 'audio')),
    ensureDir(EXPORTS_DIR),
  ]);
  console.log(`[server] Data directory: ${DATA_DIR}`);
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export function getCharactersDir(): string {
  return path.join(DATA_DIR, 'characters');
}

export function getConversationsDir(): string {
  return path.join(DATA_DIR, 'conversations');
}

export function getAudioDir(): string {
  return path.join(DATA_DIR, 'audio');
}

export function getExportsDir(): string {
  return EXPORTS_DIR;
}

export function getSettingsPath(): string {
  return path.join(DATA_DIR, 'settings.json');
}

export function getSpeakersPath(): string {
  return path.join(DATA_DIR, 'speakers.json');
}
