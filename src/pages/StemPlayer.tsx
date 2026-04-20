import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { Music, Plus, Save, Trash2, FolderOpen, ChevronRight, ArrowUp, ListMusic, X, GripVertical } from 'lucide-react';
import { StemSlotRow } from '@/components/stems/StemSlotRow';
import { StemTransport } from '@/components/stems/StemTransport';
import { useAudioEngine } from '@/contexts/AudioEngineContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { StemTrackConfig, StemSlot } from '@/types';

interface LoadedStem {
  id: string;
  slot: StemSlot;
  rawBuffer: ArrayBuffer | null;
  duration: number;
}

function createEmptySlot(): StemSlot {
  return { filePath: '', fileName: '', label: '', speakerId: null, volume: 1, muted: false, soloed: false };
}

function createEmptyLoaded(): LoadedStem {
  return { id: uuid(), slot: createEmptySlot(), rawBuffer: null, duration: 0 };
}

function hasNativeAudio(): boolean {
  return !!window.electronAPI?.nativeAudio;
}

function getNativeAudio(): NativeAudioAPI {
  return window.electronAPI!.nativeAudio;
}

async function decodeDuration(buffer: ArrayBuffer): Promise<number> {
  const offCtx = new OfflineAudioContext(2, 1, 44100);
  const decoded = await offCtx.decodeAudioData(buffer.slice(0));
  return decoded.duration;
}

async function extractPCM(buffer: ArrayBuffer): Promise<{ left: Float32Array; right: Float32Array }> {
  const offCtx = new OfflineAudioContext(2, 44100 * 600, 44100);
  const decoded = await offCtx.decodeAudioData(buffer.slice(0));
  const left = decoded.getChannelData(0);
  const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
  return {
    left: new Float32Array(left),
    right: new Float32Array(right),
  };
}

export function StemPlayer() {
  const { engine, speakers } = useAudioEngine();

  const [tracks, setTracks] = useState<StemTrackConfig[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [trackName, setTrackName] = useState('');
  const [stems, setStems] = useState<LoadedStem[]>([createEmptyLoaded()]);
  const [dirty, setDirty] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(false);
  const [position, setPosition] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);

  const [browseFiles, setBrowseFiles] = useState<{ name: string; path: string }[]>([]);
  const [browseSubdirs, setBrowseSubdirs] = useState<{ name: string; path: string }[]>([]);
  const [browseCurrent, setBrowseCurrent] = useState('');
  const [nativeSpeakersReady, setNativeSpeakersReady] = useState(false);
  const [bufferState, setBufferState] = useState<'idle' | 'buffering' | 'ready'>('idle');
  const [bufferElapsed, setBufferElapsed] = useState(0);

  const playingRef = useRef(false);
  const stemsRef = useRef(stems);
  stemsRef.current = stems;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  const hasAnyStem = stems.some(s => s.rawBuffer !== null);

  // Open native audio speakers on mount
  useEffect(() => {
    if (!hasNativeAudio() || speakers.length === 0) return;
    const na = getNativeAudio();
    Promise.all(
      speakers.map(s => na.openSpeaker(s.id, s.deviceLabel))
    ).then(() => {
      setNativeSpeakersReady(true);
      console.log('[stems] native audio speakers opened');
    });
  }, [speakers]);

  // Listen for position updates and playback end from native audio
  useEffect(() => {
    if (!hasNativeAudio()) return;
    const na = getNativeAudio();
    const cleanupEnd = na.onEnded(() => {
      playingRef.current = false;
      setPlaying(false);
      setPosition(0);
      setBufferState('idle');
      const q = queueRef.current;
      if (q.length > 0) {
        advanceQueueRef.current?.();
      }
    });
    const cleanupStarted = na.onStarted(() => {
      playingRef.current = true;
      setPlaying(true);
      setBufferState('idle');
    });
    const cleanupBuf = na.onBufferState((state, elapsed) => {
      setBufferState(state);
      setBufferElapsed(elapsed);
    });
    return () => { cleanupEnd(); cleanupStarted(); cleanupBuf(); };
  }, []);

  useEffect(() => {
    api.tracks.list().then(setTracks).catch(() => {});
  }, []);

  // Send stems to native audio when they change
  const syncStemsToNative = useCallback(async (stemsToSync: LoadedStem[]) => {
    if (!hasNativeAudio()) return;
    const na = getNativeAudio();

    for (const stem of stemsToSync) {
      if (!stem.rawBuffer) continue;
      const pcm = await extractPCM(stem.rawBuffer);
      await na.loadStem(stem.id, pcm.left.buffer as ArrayBuffer, pcm.right.buffer as ArrayBuffer);
      if (stem.slot.speakerId) {
        await na.assignStem(stem.id, stem.slot.speakerId);
      }
      await na.setStemVolume(stem.id, stem.slot.volume);
      await na.setStemMuted(stem.id, stem.slot.muted);
      await na.setStemSoloed(stem.id, stem.slot.soloed);
    }
  }, []);

  const loadTrackStems = useCallback(async (track: StemTrackConfig): Promise<LoadedStem[]> => {
    const loaded: LoadedStem[] = [];
    for (const stemSlot of track.stems) {
      if (stemSlot.filePath) {
        try {
          const resp = await fetch(api.tracks.fileUrl(stemSlot.filePath));
          const buf = await resp.arrayBuffer();
          const duration = await decodeDuration(buf);
          const slotWithLabel = { ...stemSlot, label: stemSlot.label || stemSlot.fileName.replace(/\.[^.]+$/, '') };
          loaded.push({ id: uuid(), slot: slotWithLabel, rawBuffer: buf, duration });
        } catch {
          loaded.push({ id: uuid(), slot: { ...stemSlot, label: stemSlot.label || '', fileName: stemSlot.fileName + ' (missing)' }, rawBuffer: null, duration: 0 });
        }
      }
    }
    if (loaded.length === 0) loaded.push(createEmptyLoaded());
    return loaded;
  }, []);

  const stopPlayback = useCallback(async () => {
    playingRef.current = false;
    setPlaying(false);
    if (hasNativeAudio()) {
      await getNativeAudio().stop();
    }
    engine.resumeAll();
  }, [engine]);

  const startPlayback = useCallback(async (stemsToPlay: LoadedStem[], fromOffset: number) => {
    if (!hasNativeAudio()) return;
    engine.suspendAll();
    const na = getNativeAudio();
    await syncStemsToNative(stemsToPlay);
    await na.setLooping(false);
    await na.play(fromOffset);
    playingRef.current = true;
    setPlaying(true);
  }, [engine, syncStemsToNative]);

  const advanceQueueRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const advanceQueue = useCallback(async () => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const nextId = q[0];
    setQueue(prev => prev.slice(1));
    const track = tracksRef.current.find(t => t.id === nextId);
    if (!track) return;
    setActiveTrackId(track.id);
    setTrackName(track.name);
    setDirty(false);
    const loaded = await loadTrackStems(track);
    setStems(loaded);
    setPosition(0);
    await startPlayback(loaded, 0);
  }, [loadTrackStems, startPlayback]);
  advanceQueueRef.current = advanceQueue;

  const loadTrack = useCallback(async (track: StemTrackConfig) => {
    if (playingRef.current) await stopPlayback();
    setActiveTrackId(track.id);
    setTrackName(track.name);
    setDirty(false);
    const loaded = await loadTrackStems(track);
    setStems(loaded);
    setPosition(0);
  }, [loadTrackStems, stopPlayback]);

  const addStem = useCallback(() => {
    setStems(prev => [...prev, createEmptyLoaded()]);
    setDirty(true);
  }, []);

  const removeStem = useCallback(async (index: number) => {
    if (playingRef.current) await stopPlayback();
    setStems(prev => {
      const removed = prev[index];
      if (removed && hasNativeAudio()) {
        getNativeAudio().unloadStem(removed.id);
      }
      const next = prev.filter((_, i) => i !== index);
      return next.length === 0 ? [createEmptyLoaded()] : next;
    });
    setDirty(true);
  }, [stopPlayback]);

  const updateSlot = useCallback(async (index: number, update: Partial<StemSlot>) => {
    const stem = stemsRef.current[index];
    setStems(prev => prev.map((s, i) =>
      i === index ? { ...s, slot: { ...s.slot, ...update } } : s
    ));
    setDirty(true);

    if (hasNativeAudio() && stem?.rawBuffer) {
      const na = getNativeAudio();
      if (update.speakerId !== undefined) {
        if (update.speakerId) await na.assignStem(stem.id, update.speakerId);
      }
      if (update.volume !== undefined) await na.setStemVolume(stem.id, update.volume);
      if (update.muted !== undefined) await na.setStemMuted(stem.id, update.muted);
      if (update.soloed !== undefined) await na.setStemSoloed(stem.id, update.soloed);
    }
  }, []);

  const loadStemAudio = useCallback(async (index: number, buffer: ArrayBuffer, filePath: string, fileName: string) => {
    try {
      const duration = await decodeDuration(buffer);
      const label = fileName.replace(/\.[^.]+$/, '');
      const defaultSpeaker = speakers.length > 0 ? speakers[0].id : null;

      setStems(prev => prev.map((s, i) => {
        if (i !== index) return s;
        return {
          ...s,
          slot: { ...s.slot, filePath, fileName, label: s.slot.label || label, speakerId: s.slot.speakerId || defaultSpeaker },
          rawBuffer: buffer,
          duration,
        };
      }));
      setDirty(true);

      if (hasNativeAudio()) {
        const na = getNativeAudio();
        const stemId = stemsRef.current[index]?.id;
        if (stemId) {
          const pcm = await extractPCM(buffer);
          await na.loadStem(stemId, pcm.left.buffer as ArrayBuffer, pcm.right.buffer as ArrayBuffer);
          const speakerId = stemsRef.current[index]?.slot.speakerId || defaultSpeaker;
          if (speakerId) await na.assignStem(stemId, speakerId);
        }
      }
    } catch (err) {
      console.error('Failed to load audio:', err);
    }
  }, [speakers]);

  const loadBufferIntoSlot = useCallback(async (index: number, buffer: ArrayBuffer, fileName: string) => {
    const uploaded = await api.tracks.upload(buffer, fileName);
    await loadStemAudio(index, buffer, uploaded.filePath, fileName);
  }, [loadStemAudio]);

  const loadFileFromServer = useCallback(async (index: number, filePath: string, fileName: string) => {
    const resp = await fetch(api.tracks.fileUrl(filePath));
    const buf = await resp.arrayBuffer();
    await loadStemAudio(index, buf, filePath, fileName);
  }, [loadStemAudio]);

  const handleSave = useCallback(async () => {
    const current = stemsRef.current;
    const stemSlots = current.filter(s => s.rawBuffer !== null).map(s => s.slot);
    const name = trackName || 'Untitled Track';
    if (activeTrackId) {
      const updated = await api.tracks.update(activeTrackId, { name, stems: stemSlots });
      setTracks(prev => prev.map(t => t.id === activeTrackId ? updated : t));
    } else {
      const track: StemTrackConfig = {
        id: uuid(),
        name,
        stems: stemSlots,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const created = await api.tracks.create(track);
      setTracks(prev => [...prev, created]);
      setActiveTrackId(created.id);
    }
    setDirty(false);
  }, [activeTrackId, trackName]);

  const handleNew = useCallback(async () => {
    if (playingRef.current) await stopPlayback();
    setActiveTrackId(null);
    setTrackName('');
    setStems([createEmptyLoaded()]);
    setDirty(false);
    setPosition(0);
  }, [stopPlayback]);

  const handleDelete = useCallback(async (id: string) => {
    await api.tracks.delete(id);
    setTracks(prev => prev.filter(t => t.id !== id));
    setQueue(prev => prev.filter(qid => qid !== id));
    if (activeTrackId === id) handleNew();
  }, [activeTrackId, handleNew]);

  const addToQueue = useCallback((trackId: string) => {
    setQueue(prev => [...prev, trackId]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  const playTrack = useCallback(async (track: StemTrackConfig) => {
    if (playingRef.current) await stopPlayback();
    setActiveTrackId(track.id);
    setTrackName(track.name);
    setDirty(false);
    const loaded = await loadTrackStems(track);
    setStems(loaded);
    setPosition(0);
    await startPlayback(loaded, 0);
  }, [loadTrackStems, stopPlayback, startPlayback]);

  const openFolder = useCallback(async (folderPath: string) => {
    try {
      const result = await api.tracks.browse(folderPath);
      setBrowseFiles(result.files);
      setBrowseSubdirs(result.subdirs);
      setBrowseCurrent(result.current);
    } catch {
      console.error('Cannot browse:', folderPath);
    }
  }, []);

  const promptFolder = useCallback(() => {
    if (window.electronAPI?.selectFolder) {
      window.electronAPI.selectFolder().then((folder: string | null) => {
        if (folder) openFolder(folder);
      });
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        const folderPath = (file as unknown as { path: string }).path;
        const dir = folderPath.substring(0, folderPath.lastIndexOf('\\')) || folderPath.substring(0, folderPath.lastIndexOf('/'));
        if (dir) openFolder(dir);
      }
    };
    input.click();
  }, [openFolder]);

  const handlePlay = useCallback(async () => {
    if (!hasNativeAudio()) return;
    engine.suspendAll();
    await syncStemsToNative(stemsRef.current);
    await getNativeAudio().play(position);
  }, [engine, position, syncStemsToNative]);

  const handlePause = useCallback(async () => {
    playingRef.current = false;
    setPlaying(false);
    if (hasNativeAudio()) {
      const state = await getNativeAudio().getState();
      setPosition(state.position);
      await getNativeAudio().pause();
    }
    engine.resumeAll();
  }, [engine]);

  const handleStop = useCallback(async () => {
    await stopPlayback();
    setPosition(0);
  }, [stopPlayback]);

  const handleNext = useCallback(async () => {
    if (queueRef.current.length > 0) {
      await stopPlayback();
      advanceQueueRef.current?.();
    }
  }, [stopPlayback]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (playingRef.current) handlePause();
        else if (hasAnyStem) handlePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePlay, handlePause, hasAnyStem]);

  useEffect(() => {
    return () => {
      if (hasNativeAudio()) getNativeAudio().stop();
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gold/10 px-5 py-3 gradient-dark-gold shrink-0">
        <div className="flex items-center gap-3">
          <Music className="w-5 h-5 text-gold" />
          <h1 className="text-base font-heading tracking-wider">Stem Workstation</h1>
          {hasNativeAudio() && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${nativeSpeakersReady ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {nativeSpeakersReady ? 'Native Audio' : 'Initializing...'}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Track Library & Queue */}
        <div className="w-56 border-r border-gold/10 flex flex-col shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gold/10">
            <span className="text-xs font-heading text-gold-light tracking-wider">Tracks</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleNew}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {tracks.map(t => (
              <div
                key={t.id}
                className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-colors group ${
                  t.id === activeTrackId ? 'bg-gold-muted text-gold' : 'text-muted-foreground hover:bg-card/80 hover:text-foreground'
                }`}
                onClick={() => loadTrack(t)}
                onDoubleClick={() => playTrack(t)}
              >
                <Music className="w-3 h-3 shrink-0" />
                <span className="text-xs truncate flex-1">{t.name}</span>
                <span className="text-[10px] text-muted-foreground">{t.stems.filter(s => s.filePath).length}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); addToQueue(t.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-gold transition-all"
                  title="Add to queue"
                >
                  <ListMusic className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {tracks.length === 0 && (
              <p className="text-[10px] text-muted-foreground px-3 py-4 text-center">No saved tracks</p>
            )}
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div className="border-t border-gold/10">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-heading text-gold-light tracking-wider">
                  Queue ({queue.length})
                </span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setQueue([])}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              <div className="overflow-y-auto max-h-36">
                {queue.map((trackId, i) => {
                  const track = tracks.find(t => t.id === trackId);
                  return (
                    <div key={`${trackId}-${i}`} className="flex items-center gap-1.5 px-3 py-1 text-muted-foreground group">
                      <GripVertical className="w-3 h-3 shrink-0 text-gold/30" />
                      <span className="text-[10px] text-gold/50 w-3 shrink-0">{i + 1}</span>
                      <span className="text-[10px] truncate flex-1">{track?.name ?? 'Unknown'}</span>
                      <button
                        onClick={() => removeFromQueue(i)}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Folder browser */}
          <div className="border-t border-gold/10">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-heading text-gold-light tracking-wider">Files</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={promptFolder}>
                <FolderOpen className="w-3.5 h-3.5" />
              </Button>
            </div>
            {browseCurrent && (
              <div className="overflow-y-auto max-h-48">
                <div className="px-3 pb-1">
                  <p className="text-[9px] text-muted-foreground truncate" title={browseCurrent}>{browseCurrent}</p>
                </div>
                <button
                  onClick={() => {
                    const parent = browseCurrent.replace(/[/\\][^/\\]+$/, '');
                    if (parent && parent !== browseCurrent) openFolder(parent);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 w-full text-left text-[10px] text-muted-foreground hover:bg-card/80"
                >
                  <ArrowUp className="w-3 h-3" /> ..
                </button>
                {browseSubdirs.map(d => (
                  <button
                    key={d.path}
                    onClick={() => openFolder(d.path)}
                    className="flex items-center gap-1.5 px-3 py-1 w-full text-left text-[10px] text-muted-foreground hover:bg-card/80 truncate"
                  >
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    {d.name}
                  </button>
                ))}
                {browseFiles.map(f => (
                  <button
                    key={f.path}
                    onClick={() => {
                      const emptyIdx = stemsRef.current.findIndex(s => !s.rawBuffer);
                      if (emptyIdx >= 0) {
                        loadFileFromServer(emptyIdx, f.path, f.name);
                      } else {
                        const newStem = createEmptyLoaded();
                        const newIndex = stemsRef.current.length;
                        setStems(prev => [...prev, newStem]);
                        loadFileFromServer(newIndex, f.path, f.name);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 w-full text-left text-[10px] hover:bg-gold-muted/50 hover:text-gold truncate"
                  >
                    <Music className="w-3 h-3 shrink-0 text-gold/50" />
                    {f.name}
                  </button>
                ))}
                {browseFiles.length === 0 && browseSubdirs.length === 0 && (
                  <p className="text-[10px] text-muted-foreground px-3 py-2 text-center">Empty folder</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gold/10 shrink-0">
            <Input
              value={trackName}
              onChange={(e) => { setTrackName(e.target.value); setDirty(true); }}
              placeholder="Track name..."
              className="h-7 text-sm max-w-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={!dirty && !!activeTrackId}
              className="border-gold/20 hover:bg-gold-muted"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {activeTrackId ? 'Save' : 'Save New'}
            </Button>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {stems.filter(s => s.rawBuffer).length} stems loaded
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {stems.map((stem, i) => (
              <StemSlotRow
                key={stem.id}
                index={i}
                slot={stem.slot}
                hasBuffer={stem.rawBuffer !== null}
                onUpdateSlot={(update) => updateSlot(i, update)}
                onLoadBuffer={(buf, name) => loadBufferIntoSlot(i, buf, name)}
                onRemove={() => removeStem(i)}
              />
            ))}

            <button
              onClick={addStem}
              className="flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-gold/20 text-xs text-muted-foreground hover:text-gold-light hover:border-gold/40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Stem
            </button>
          </div>

          <StemTransport
            playing={playing}
            looping={looping}
            hasQueue={queue.length > 0}
            bufferState={bufferState}
            bufferElapsed={bufferElapsed}
            onPlay={handlePlay}
            onPause={handlePause}
            onStop={handleStop}
            onToggleLoop={() => {
              const newLooping = !looping;
              setLooping(newLooping);
              if (hasNativeAudio()) getNativeAudio().setLooping(newLooping);
            }}
            onNext={handleNext}
            disabled={!hasAnyStem}
          />
        </div>
      </div>
    </div>
  );
}
