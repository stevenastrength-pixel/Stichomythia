import { ChevronUp, ChevronDown } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useAudioEngine } from '@/contexts/AudioEngineContext';
import { ChannelStrip } from './ChannelStrip';
import { MasterStrip } from './MasterStrip';

export function SpeakerHub() {
  const {
    speakers,
    connectionStatus,
    batteryLevels,
    mixerState,
    mixerExpanded,
    setMixerExpanded,
    setMasterVolume,
  } = useAudioEngine();

  if (speakers.length === 0) return null;

  const connectedCount = [...connectionStatus.values()].filter(Boolean).length;

  return (
    <div className="border-t border-gold/15 bg-card/95 backdrop-blur-sm shrink-0">
      {mixerExpanded ? (
        <div>
          <button
            onClick={() => setMixerExpanded(false)}
            className="flex items-center gap-1.5 h-7 px-3 w-full text-left hover:bg-gold/5 transition-colors"
          >
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] font-heading tracking-wider uppercase text-muted-foreground">Mixer</span>
            <span className="text-[9px] text-muted-foreground ml-1">
              {connectedCount}/{speakers.length} connected
            </span>
          </button>

          <div className="flex items-stretch border-t border-gold/5">
            {speakers.map((speaker, i) => (
              <ChannelStrip key={speaker.id} speaker={speaker} index={i} />
            ))}
            <MasterStrip />
          </div>
        </div>
      ) : (
        <div className="flex items-center h-9 px-3 gap-3">
          <button
            onClick={() => setMixerExpanded(true)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-gold-light transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span className="text-[9px] font-heading tracking-wider uppercase">Mixer</span>
          </button>

          <div className="flex items-center gap-2">
            {speakers.map(s => {
              const bat = batteryLevels.get(s.id);
              return (
                <div key={s.id} className="flex items-center gap-1">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      connectionStatus.get(s.id) ? 'bg-green-500 connection-dot-connected' : 'bg-red-500/80'
                    }`}
                  />
                  <span className="text-[8px] text-muted-foreground">{s.label}</span>
                  {bat != null && (
                    <span className={`text-[7px] font-mono ${bat <= 20 ? 'text-red-400' : bat <= 40 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                      {bat}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[9px] text-muted-foreground">Master</span>
            <Slider
              value={[mixerState.masterVolume]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([v]) => setMasterVolume(v)}
              className="w-20"
            />
          </div>
        </div>
      )}
    </div>
  );
}
