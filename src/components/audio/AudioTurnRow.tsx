import type { Turn, Character } from '@/types';
import { Button } from '@/components/ui/button';
import { Play, RotateCw, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';

interface Props {
  turn: Turn;
  character?: Character;
  isActive: boolean;
  onRerender: () => void;
}

export function AudioTurnRow({ turn, character, isActive, onRerender }: Props) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = async () => {
    if (!turn.audioFile) return;

    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    const audio = new Audio(turn.audioFile);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    setPlaying(true);
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '--';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div
      className={`flex items-center gap-3 py-2 px-3 rounded-md transition-colors ${
        isActive ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/30'
      }`}
    >
      <div
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: character?.color ?? '#888' }}
      />

      <span className="text-xs text-muted-foreground w-8">({turn.moodTag.slice(0, 8)})</span>

      <span className="text-sm flex-1 min-w-0 truncate">{turn.text}</span>

      <span className="text-xs text-muted-foreground w-12 text-right">
        {formatDuration(turn.audioDurationMs)}
      </span>

      <div className="flex gap-1 shrink-0">
        {turn.audioFile ? (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handlePlay}>
            <Play className={`w-3 h-3 ${playing ? 'text-primary' : ''}`} />
          </Button>
        ) : (
          <div className="h-7 w-7 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">--</span>
          </div>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onRerender}>
          <RotateCw className="w-3 h-3" />
        </Button>
      </div>

      <span className={`text-xs w-16 text-right ${
        turn.status === 'rendered' ? 'text-green-500' :
        turn.status === 'approved' ? 'text-blue-400' :
        'text-muted-foreground'
      }`}>
        {turn.status}
      </span>
    </div>
  );
}
