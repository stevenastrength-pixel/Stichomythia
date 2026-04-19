import { useState } from 'react';
import { Monitor } from 'lucide-react';
import { SourceSelector } from '@/components/system/SourceSelector';
import { CaptureControls } from '@/components/system/CaptureControls';

export function SystemAudio() {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gold/10 px-5 py-3 gradient-dark-gold">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-gold" />
          <h1 className="text-base font-heading tracking-wider">System Audio</h1>
          <span className="text-xs text-muted-foreground">
            Capture audio from any application and route it through your speakers
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <SourceSelector
          selectedId={selectedSource}
          onSelect={setSelectedSource}
          disabled={false}
        />
        <CaptureControls sourceId={selectedSource} />
      </div>
    </div>
  );
}
