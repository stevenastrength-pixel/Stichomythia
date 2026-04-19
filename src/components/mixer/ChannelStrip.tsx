import { useState, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Volume2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LevelMeter } from './LevelMeter';
import { EQControl } from './EQControl';
import type { Speaker, EQBandSettings } from '@/types';
import { useAudioEngine } from '@/contexts/AudioEngineContext';

interface Props {
  speaker: Speaker;
  index: number;
}

export function ChannelStrip({ speaker, index }: Props) {
  const {
    engine,
    connectionStatus,
    mixerState,
    setVolume,
    toggleMute,
    toggleSolo,
    setEQ,
    playTestTone,
  } = useAudioEngine();
  const [testing, setTesting] = useState(false);

  const connected = connectionStatus.get(speaker.id) ?? false;
  const channelState = mixerState.channels.find(c => c.speakerId === speaker.id);
  const volume = channelState?.volume ?? 1;
  const muted = channelState?.muted ?? false;
  const soloed = channelState?.soloed ?? false;
  const eq = channelState?.eq ?? [];

  const getLevel = useCallback(() => engine.getLevel(speaker.id), [engine, speaker.id]);

  const handleTest = async () => {
    setTesting(true);
    await playTestTone(speaker.id, index);
    setTesting(false);
  };

  const dbValue = volume > 0 ? (20 * Math.log10(volume)).toFixed(1) : '-inf';

  return (
    <div className={`flex flex-col items-center gap-1 px-2 py-2 min-w-[72px] ${soloed ? 'channel-soloed rounded-lg' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-green-500 connection-dot-connected' : 'bg-red-500'}`} />
        <span className="text-[10px] font-medium text-foreground truncate max-w-[56px]">
          {speaker.label}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <LevelMeter getLevel={getLevel} height={64} />
        <div className="h-16 flex items-center">
          <Slider
            orientation="vertical"
            value={[volume]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([v]) => setVolume(speaker.id, v)}
            className="h-16"
          />
        </div>
      </div>

      <span className="text-[9px] text-muted-foreground font-mono">{dbValue}dB</span>

      <div className="flex gap-0.5">
        <button
          onClick={() => toggleMute(speaker.id)}
          className={`w-6 h-5 rounded text-[9px] font-bold transition-colors ${
            muted
              ? 'bg-red-500/80 text-white'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
          }`}
        >
          M
        </button>
        <button
          onClick={() => toggleSolo(speaker.id)}
          className={`w-6 h-5 rounded text-[9px] font-bold transition-colors ${
            soloed
              ? 'bg-gold text-black'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
          }`}
        >
          S
        </button>
      </div>

      <div className="flex gap-0.5">
        <Popover>
          <PopoverTrigger asChild>
            <button className="text-[9px] px-1.5 h-5 rounded bg-muted/50 text-muted-foreground hover:bg-muted hover:text-gold-light transition-colors">
              EQ
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-56 border-gold/15 bg-card">
            <EQControl
              bands={eq}
              onChange={(bandIndex, settings) => setEQ(speaker.id, bandIndex, settings)}
            />
          </PopoverContent>
        </Popover>
        <button
          onClick={handleTest}
          disabled={testing || !connected}
          className="h-5 px-1 rounded bg-muted/50 text-muted-foreground hover:bg-muted hover:text-gold-light transition-colors disabled:opacity-30"
        >
          <Volume2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
