import { ChevronUp, ChevronDown } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useAudioEngine } from '@/contexts/AudioEngineContext';
import { ChannelStrip } from './ChannelStrip';
import { MasterStrip } from './MasterStrip';

export function SpeakerHub() {
  const {
    speakers,
    connectionStatus,
    mixerState,
    mixerExpanded,
    setMixerExpanded,
    setMasterVolume,
  } = useAudioEngine();

  if (speakers.length === 0) return null;

  const connectedCount = [...connectionStatus.values()].filter(Boolean).length;

  return (
    <div className="border-t border-gold/15 bg-card/95 backdrop-blur-sm shrink-0 transition-all duration-300">
      {mixerExpanded ? (
        <div className="flex items-stretch">
          <button
            onClick={() => setMixerExpanded(false)}
            className="px-2 flex items-center text-muted-foreground hover:text-gold-light transition-colors border-r border-gold/10"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {speakers.map((speaker, i) => (
            <ChannelStrip key={speaker.id} speaker={speaker} index={i} />
          ))}

          <MasterStrip />
        </div>
      ) : (
        <div className="flex items-center h-10 px-3 gap-3">
          <button
            onClick={() => setMixerExpanded(true)}
            className="flex items-center text-muted-foreground hover:text-gold-light transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5">
            {speakers.map(s => (
              <div
                key={s.id}
                className={`w-2 h-2 rounded-full ${
                  connectionStatus.get(s.id) ? 'bg-green-500 connection-dot-connected' : 'bg-red-500'
                }`}
                title={s.label}
              />
            ))}
          </div>

          <span className="text-[10px] text-muted-foreground">
            {connectedCount}/{speakers.length} connected
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-muted-foreground">Master</span>
            <Slider
              value={[mixerState.masterVolume]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([v]) => setMasterVolume(v)}
              className="w-24"
            />
          </div>
        </div>
      )}
    </div>
  );
}
