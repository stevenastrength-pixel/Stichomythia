import { useState, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Volume2, BatteryLow, BatteryMedium, BatteryFull, SlidersHorizontal } from 'lucide-react';
import { LevelMeter } from '@/components/mixer/LevelMeter';
import { useAudioEngine } from '@/contexts/AudioEngineContext';
import type { EQBandSettings } from '@/types';

const BAND_LABELS = ['Low Shelf', 'Low-Mid', 'Mid', 'Hi-Mid', 'High Shelf'];

function FullChannelStrip({ speakerId, index }: { speakerId: string; index: number }) {
  const {
    engine,
    speakers,
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

  const speaker = speakers.find(s => s.id === speakerId);
  if (!speaker) return null;

  const connected = connectionStatus.get(speakerId) ?? false;
  const battery = batteryLevels.get(speakerId);
  const channelState = mixerState.channels.find(c => c.speakerId === speakerId);
  const volume = channelState?.volume ?? 1;
  const muted = channelState?.muted ?? false;
  const soloed = channelState?.soloed ?? false;
  const eq = channelState?.eq ?? [];

  const getLevel = useCallback(() => engine.getLevel(speakerId), [engine, speakerId]);

  const handleTest = async () => {
    setTesting(true);
    await playTestTone(speakerId, index);
    setTesting(false);
  };

  const dbValue = volume > 0 ? (20 * Math.log10(volume)).toFixed(1) : '-∞';

  const BatteryIcon = battery == null ? null
    : battery <= 20 ? BatteryLow
    : battery <= 60 ? BatteryMedium
    : BatteryFull;

  const batteryColor = battery == null ? ''
    : battery <= 20 ? 'text-red-400'
    : battery <= 40 ? 'text-yellow-400'
    : 'text-green-400/70';

  return (
    <div className={`flex-1 rounded-lg border p-4 flex flex-col gap-3 min-w-0 ${
      soloed ? 'border-gold/30 bg-gold/5' : 'border-gold/10 bg-card/50'
    }`}>
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full shrink-0 ${connected ? 'bg-green-500 connection-dot-connected' : 'bg-red-500/80'}`} />
        <span className="text-sm font-heading tracking-wider text-foreground truncate">
          {speaker.label}
        </span>
        {battery != null && BatteryIcon && (
          <span className={`flex items-center gap-1 ${batteryColor}`}>
            <BatteryIcon className="w-4 h-4" />
            <span className="text-xs font-mono">{battery}%</span>
          </span>
        )}
        <span className={`text-xs ml-auto ${connected ? 'text-green-400/70' : 'text-red-400/70'}`}>
          {connected ? 'Connected' : 'Offline'}
        </span>
      </div>

      <div className="text-[10px] text-muted-foreground truncate">
        {speaker.deviceLabel}
      </div>

      <div className="flex items-end gap-4">
        <LevelMeter getLevel={getLevel} width={10} height={120} />

        <div className="flex flex-col items-center gap-1 w-16">
          <Slider
            orientation="vertical"
            value={[volume]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([v]) => setVolume(speakerId, v)}
            className="h-28"
          />
          <span className="text-xs text-muted-foreground font-mono">{dbValue}dB</span>
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={() => toggleMute(speakerId)}
            className={`w-10 h-7 rounded text-xs font-bold transition-colors ${
              muted ? 'bg-red-500/80 text-white' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            M
          </button>
          <button
            onClick={() => toggleSolo(speakerId)}
            className={`w-10 h-7 rounded text-xs font-bold transition-colors ${
              soloed ? 'bg-gold text-black' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            S
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !connected}
            className="w-10 h-7 rounded bg-muted/50 text-muted-foreground hover:bg-muted hover:text-gold-light transition-colors disabled:opacity-30 flex items-center justify-center"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="border-t border-gold/10 pt-3">
        <p className="text-[10px] font-heading tracking-wider text-gold/60 uppercase mb-2">Parametric EQ</p>
        <div className="space-y-2">
          {eq.map((band: EQBandSettings, i: number) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{BAND_LABELS[i]}</span>
                <span>{band.frequency}Hz</span>
                <span className="font-mono w-10 text-right">{band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)}dB</span>
              </div>
              <Slider
                value={[band.gain]}
                min={-12}
                max={12}
                step={0.5}
                onValueChange={([v]) => setEQ(speakerId, i, { gain: v })}
                className="w-full"
              />
              {band.type === 'peaking' && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground">Q</span>
                  <Slider
                    value={[band.Q]}
                    min={0.1}
                    max={10}
                    step={0.1}
                    onValueChange={([v]) => setEQ(speakerId, i, { Q: v })}
                    className="flex-1"
                  />
                  <span className="text-[9px] text-muted-foreground font-mono w-6 text-right">{band.Q.toFixed(1)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Mixer() {
  const { speakers, mixerState, setMasterVolume } = useAudioEngine();
  const masterVolume = mixerState.masterVolume;
  const masterDb = masterVolume > 0 ? (20 * Math.log10(masterVolume)).toFixed(1) : '-∞';

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gold/10 px-5 py-3 gradient-dark-gold shrink-0">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-5 h-5 text-gold" />
          <h1 className="text-base font-heading tracking-wider">Mixer</h1>
          <span className="text-xs text-muted-foreground">{speakers.length} channels</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex gap-4 items-stretch">
          {speakers.map((speaker, i) => (
            <FullChannelStrip key={speaker.id} speakerId={speaker.id} index={i} />
          ))}

          <div className="w-24 shrink-0 rounded-lg border border-gold/15 bg-card/50 p-4 flex flex-col items-center gap-3">
            <span className="text-xs font-heading tracking-wider text-gold/60 uppercase">Master</span>
            <Slider
              orientation="vertical"
              value={[masterVolume]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([v]) => setMasterVolume(v)}
              className="h-28"
            />
            <span className="text-xs text-muted-foreground font-mono">{masterDb}dB</span>
          </div>
        </div>
      </div>
    </div>
  );
}
