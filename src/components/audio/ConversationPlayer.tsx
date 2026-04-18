import { useState, useEffect, useRef, useCallback } from 'react';
import type { Turn, Character } from '@/types';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

interface Props {
  turns: Turn[];
  characters: Map<string, Character>;
  onTurnChange?: (turnIndex: number) => void;
}

export function ConversationPlayer({ turns, characters, onTurnChange }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const renderedTurns = turns.filter(t => t.audioFile);
  const currentTurn = renderedTurns[currentIndex];
  const char = currentTurn ? characters.get(currentTurn.characterId) : undefined;

  const totalDurationMs = renderedTurns.reduce(
    (acc, t) => acc + (t.audioDurationMs ?? 3000) + t.pauseAfterMs,
    0,
  );

  const elapsedMs = renderedTurns
    .slice(0, currentIndex)
    .reduce((acc, t) => acc + (t.audioDurationMs ?? 3000) + t.pauseAfterMs, 0) + progress;

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const playTurn = useCallback(async (index: number) => {
    if (index >= renderedTurns.length) {
      setPlaying(false);
      return;
    }

    const turn = renderedTurns[index];
    if (!turn.audioFile) return;

    setCurrentIndex(index);
    onTurnChange?.(turns.indexOf(turn));

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    const audio = new Audio(turn.audioFile);
    audioRef.current = audio;

    audio.ontimeupdate = () => {
      setProgress(audio.currentTime * 1000);
    };

    audio.onended = () => {
      pauseTimerRef.current = setTimeout(() => {
        playTurn(index + 1);
      }, turn.pauseAfterMs);
    };

    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }, [renderedTurns, turns, onTurnChange]);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

  const handlePlay = () => {
    if (playing) {
      audioRef.current?.pause();
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      setPlaying(false);
    } else {
      setPlaying(true);
      playTurn(currentIndex);
    }
  };

  const handleSkipBack = () => {
    const newIndex = Math.max(0, currentIndex - 1);
    if (playing) {
      playTurn(newIndex);
    } else {
      setCurrentIndex(newIndex);
      setProgress(0);
      onTurnChange?.(turns.indexOf(renderedTurns[newIndex]));
    }
  };

  const handleSkipForward = () => {
    const newIndex = Math.min(renderedTurns.length - 1, currentIndex + 1);
    if (playing) {
      playTurn(newIndex);
    } else {
      setCurrentIndex(newIndex);
      setProgress(0);
      onTurnChange?.(turns.indexOf(renderedTurns[newIndex]));
    }
  };

  const handleSeek = (value: number[]) => {
    const targetMs = value[0];
    let accumulated = 0;
    for (let i = 0; i < renderedTurns.length; i++) {
      const turnDuration = (renderedTurns[i].audioDurationMs ?? 3000) + renderedTurns[i].pauseAfterMs;
      if (accumulated + turnDuration > targetMs) {
        if (playing) {
          playTurn(i);
        } else {
          setCurrentIndex(i);
          setProgress(0);
          onTurnChange?.(turns.indexOf(renderedTurns[i]));
        }
        break;
      }
      accumulated += turnDuration;
    }
  };

  if (renderedTurns.length === 0) return null;

  return (
    <div className="border-t bg-background px-6 py-3 space-y-2">
      {currentTurn && (
        <div className="flex items-center gap-2 text-sm">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: char?.color ?? '#888' }}
          />
          <span className="truncate text-muted-foreground">
            &ldquo;{currentTurn.text.slice(0, 80)}{currentTurn.text.length > 80 ? '...' : ''}&rdquo;
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSkipBack}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handlePlay}>
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSkipForward}>
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>

        <span className="text-xs text-muted-foreground w-12 text-right">
          {formatTime(elapsedMs)}
        </span>

        <Slider
          value={[elapsedMs]}
          min={0}
          max={totalDurationMs || 1}
          step={1000}
          onValueChange={handleSeek}
          className="flex-1"
        />

        <span className="text-xs text-muted-foreground w-12">
          {formatTime(totalDurationMs)}
        </span>

        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} / {renderedTurns.length}
        </span>
      </div>
    </div>
  );
}
