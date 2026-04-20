import { Button } from '@/components/ui/button';
import { Play, Pause, Square, Repeat, SkipForward, Loader2, Volume2 } from 'lucide-react';

type BufferState = 'idle' | 'buffering' | 'ready';

interface Props {
  playing: boolean;
  looping: boolean;
  hasQueue: boolean;
  bufferState: BufferState;
  bufferElapsed: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onNext: () => void;
  disabled: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function StemTransport({
  playing,
  looping,
  hasQueue,
  bufferState,
  bufferElapsed,
  onPlay,
  onPause,
  onStop,
  onToggleLoop,
  onNext,
  disabled,
}: Props) {
  const isBuffering = bufferState === 'buffering';

  return (
    <div className="flex items-center gap-3 p-3 border-t border-gold/10 bg-card/80">
      <div className="flex items-center gap-1">
        {playing || isBuffering ? (
          <Button size="sm" variant="outline" onClick={onPause} disabled={disabled || isBuffering} className="border-gold/20 hover:bg-gold-muted">
            <Pause className="w-4 h-4" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onPlay} disabled={disabled} className="border-gold/20 hover:bg-gold-muted">
            <Play className="w-4 h-4" />
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onStop} disabled={disabled && !isBuffering} className="border-gold/20 hover:bg-gold-muted">
          <Square className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onNext}
          disabled={!hasQueue}
          className="border-gold/20 hover:bg-gold-muted"
          title="Next in queue"
        >
          <SkipForward className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onToggleLoop}
          disabled={disabled}
          className={`border-gold/20 ${looping ? 'bg-gold-muted text-gold glow-gold-text' : 'hover:bg-gold-muted'}`}
        >
          <Repeat className="w-4 h-4" />
        </Button>
      </div>

      {isBuffering ? (
        <div className="flex items-center gap-2 flex-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" />
          <span className="text-xs text-gold font-mono">
            Buffering speakers... {formatTime(bufferElapsed)}
          </span>
        </div>
      ) : playing ? (
        <div className="flex items-center gap-2 flex-1">
          <Volume2 className="w-3.5 h-3.5 text-gold animate-pulse" />
          <span className="text-xs text-gold font-mono">Playing</span>
        </div>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}
