import { useState, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Volume2, Battery, BatteryLow, BatteryMedium, BatteryFull } from 'lucide-react';
import { LevelMeter } from './LevelMeter';
import type { Speaker, EQBandSettings } from '@/types';
import { useAudioEngine } from '@/contexts/AudioEngineContext';

interface Props {
  speaker: Speaker;
  index: number;
}

const BAND_LABELS = ['Low', 'Lo‑M', 'Mid', 'Hi‑M', 'High'];
const COMPACT_SLIDER = '[&_[data-slot=slider-thumb]]:size-2 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:after:inset-0';

export function ChannelStrip({ speaker, index }: Props) {
  const {
    engine,
    connectionStatus,
    batteryLevels,
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

  const dbValue = volume > 0 ? (20 * Math.log10(volume)).toFixed(1) : '-∞';
  const battery = batteryLevels.get(speaker.id);

  const BatteryIcon = battery == null ? null
    : battery <= 20 ? BatteryLow
    : battery <= 60 ? BatteryMedium
    : BatteryFull;

  const batteryColor = battery == null ? ''
    : battery <= 20 ? 'text-red-400'
    : battery <= 40 ? 'text-yellow-400'
    : 'text-green-400/70';

  return (
    <div className={`flex-1 flex flex-col border-r border-gold/10 last:border-r-0 px-2 py-1 min-w-0 ${soloed ? 'bg-gold/5' : ''}`}>
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-green-500 connection-dot-connected' : 'bg-red-500/80'}`} />
        <span className="text-[10px] font-heading tracking-wider text-foreground truncate">
          {speaker.label}
        </span>
        {battery != null && BatteryIcon && (
          <span className={`flex items-center gap-0.5 ${batteryColor}`}>
            <BatteryIcon className="w-3 h-3" />
            <span className="text-[7px] font-mono">{battery}%</span>
          </span>
        )}
        <div className="flex gap-px ml-auto shrink-0">
          <button
            onClick={() => toggleMute(speaker.id)}
            className={`w-4 h-3.5 rounded-sm text-[7px] font-bold transition-colors ${
              muted ? 'bg-red-500/80 text-white' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            M
          </button>
          <button
            onClick={() => toggleSolo(speaker.id)}
            className={`w-4 h-3.5 rounded-sm text-[7px] font-bold transition-colors ${
              soloed ? 'bg-gold text-black' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            S
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !connected}
            className="w-4 h-3.5 rounded-sm bg-muted/50 text-muted-foreground hover:bg-muted hover:text-gold-light transition-colors disabled:opacity-30 flex items-center justify-center"
          >
            <Volume2 className="w-2 h-2" />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 items-center mt-0.5">
        <LevelMeter getLevel={getLevel} width={4} height={36} />

        <div className="flex flex-col items-center shrink-0 w-9">
          <Slider
            value={[volume]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([v]) => setVolume(speaker.id, v)}
            className={`w-9 ${COMPACT_SLIDER}`}
          />
          <span className="text-[7px] text-muted-foreground font-mono leading-tight">{dbValue}</span>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          {eq.map((band: EQBandSettings, i: number) => (
            <div key={i} className="flex items-center gap-0.5 h-2.5">
              <span className="text-[6px] text-muted-foreground w-5 shrink-0 text-right leading-none">{BAND_LABELS[i]}</span>
              <Slider
                value={[band.gain]}
                min={-12}
                max={12}
                step={0.5}
                onValueChange={([v]) => setEQ(speaker.id, i, { gain: v })}
                className={`flex-1 ${COMPACT_SLIDER}`}
              />
              <span className="text-[6px] text-muted-foreground w-3 shrink-0 font-mono leading-none">
                {band.gain > 0 ? '+' : ''}{band.gain.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
