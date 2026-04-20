import { useState, useRef, useCallback, useEffect } from 'react';
import { Music } from 'lucide-react';
import { StemTrack } from '@/components/stems/StemTrack';
import { StemTransport } from '@/components/stems/StemTransport';
import { useAudioEngine } from '@/contexts/AudioEngineContext';

interface StemState {
  fileName: string | null;
  speakerId: string | null;
  rawBuffer: ArrayBuffer | null;
  duration: number;
  muted: boolean;
  soloed: boolean;
}

const STEM_COUNT = 4;

function createEmptyStem(): StemState {
  return { fileName: null, speakerId: null, rawBuffer: null, duration: 0, muted: false, soloed: false };
}

export function StemPlayer() {
  const { engine } = useAudioEngine();
  const [stems, setStems] = useState<StemState[]>(() =>
    Array.from({ length: STEM_COUNT }, createEmptyStem)
  );
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(false);
  const [position, setPosition] = useState(0);

  const sourcesRef = useRef<(AudioBufferSourceNode | null)[]>([null, null, null, null]);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const playingRef = useRef(false);

  const maxDuration = Math.max(...stems.map(s => s.duration), 0);
  const hasAnyStem = stems.some(s => s.rawBuffer !== null);

  const updateStem = useCallback((index: number, update: Partial<StemState>) => {
    setStems(prev => prev.map((s, i) => i === index ? { ...s, ...update } : s));
  }, []);

  const stopAllSources = useCallback(() => {
    for (let i = 0; i < STEM_COUNT; i++) {
      try { sourcesRef.current[i]?.stop(); } catch {}
      sourcesRef.current[i] = null;
    }
    cancelAnimationFrame(rafRef.current);
  }, []);

  const tickPosition = useCallback(() => {
    if (!playingRef.current) return;
    const elapsed = offsetRef.current + (performance.now() - startTimeRef.current) / 1000;
    setPosition(elapsed);
    if (elapsed >= maxDuration) {
      if (looping) {
        offsetRef.current = 0;
        startPlayback(0);
      } else {
        stopPlayback();
      }
      return;
    }
    rafRef.current = requestAnimationFrame(tickPosition);
  }, [maxDuration, looping]);

  const startPlayback = useCallback(async (fromOffset: number) => {
    stopAllSources();

    const anySoloed = stems.some(s => s.soloed);

    for (let i = 0; i < STEM_COUNT; i++) {
      const stem = stems[i];
      if (!stem.rawBuffer || !stem.speakerId) continue;
      if (stem.muted || (anySoloed && !stem.soloed)) continue;

      const ch = engine.channels.get(stem.speakerId);
      if (!ch) continue;

      const decoded = await ch.audioContext.decodeAudioData(stem.rawBuffer.slice(0));
      const source = ch.audioContext.createBufferSource();
      source.buffer = decoded;
      source.connect(ch.inputNode);

      const remaining = decoded.duration - fromOffset;
      if (remaining <= 0) continue;

      source.start(0, fromOffset);
      sourcesRef.current[i] = source;
    }

    startTimeRef.current = performance.now();
    offsetRef.current = fromOffset;
    playingRef.current = true;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tickPosition);
  }, [stems, engine, stopAllSources, tickPosition]);

  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    stopAllSources();
  }, [stopAllSources]);

  const handlePlay = useCallback(() => {
    startPlayback(offsetRef.current);
  }, [startPlayback]);

  const handlePause = useCallback(() => {
    const elapsed = offsetRef.current + (performance.now() - startTimeRef.current) / 1000;
    offsetRef.current = elapsed;
    playingRef.current = false;
    setPlaying(false);
    stopAllSources();
  }, [stopAllSources]);

  const handleStop = useCallback(() => {
    stopPlayback();
    offsetRef.current = 0;
    setPosition(0);
  }, [stopPlayback]);

  const handleSeek = useCallback((pos: number) => {
    offsetRef.current = pos;
    setPosition(pos);
    if (playingRef.current) {
      startPlayback(pos);
    }
  }, [startPlayback]);

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
      stopAllSources();
    };
  }, [stopAllSources]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gold/10 px-5 py-3 gradient-dark-gold">
        <div className="flex items-center gap-3">
          <Music className="w-5 h-5 text-gold" />
          <h1 className="text-base font-heading tracking-wider">Stem Player</h1>
          <span className="text-xs text-muted-foreground">
            Load up to 4 audio stems and play them in sync across your speakers
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4 flex flex-col gap-2">
        {stems.map((stem, i) => (
          <StemTrack
            key={i}
            index={i}
            speakerId={stem.speakerId}
            onSpeakerChange={(id) => updateStem(i, { speakerId: id || null })}
            onBufferLoaded={(buf, dur, name) => {
              updateStem(i, { rawBuffer: buf, duration: dur, fileName: name });
            }}
            onRemove={() => {
              if (playing) handleStop();
              updateStem(i, createEmptyStem());
            }}
            fileName={stem.fileName}
            position={position}
            duration={stem.duration}
            muted={stem.muted}
            soloed={stem.soloed}
            onToggleMute={() => updateStem(i, { muted: !stem.muted })}
            onToggleSolo={() => updateStem(i, { soloed: !stem.soloed })}
          />
        ))}

        {!hasAnyStem && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Music className="w-10 h-10 text-gold/20 mb-3" />
            <p className="text-sm text-muted-foreground">
              Drop audio files onto the tracks above to get started
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Assign each stem to a different speaker for isolated instrument playback
            </p>
          </div>
        )}
      </div>

      <StemTransport
        playing={playing}
        looping={looping}
        position={position}
        duration={maxDuration}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onSeek={handleSeek}
        onToggleLoop={() => setLooping(!looping)}
        disabled={!hasAnyStem}
      />
    </div>
  );
}
