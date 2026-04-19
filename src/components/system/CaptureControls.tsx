import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Radio, Square } from 'lucide-react';
import { useAudioEngine } from '@/contexts/AudioEngineContext';

interface Props {
  sourceId: string | null;
}

export function CaptureControls({ sourceId }: Props) {
  const { engine, speakers } = useAudioEngine();
  const [capturing, setCapturing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([]);

  const startCapture = useCallback(async () => {
    if (!sourceId) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
        },
      } as any,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: 1,
          maxHeight: 1,
          maxFrameRate: 1,
        },
      } as any,
    });

    stream.getVideoTracks().forEach(t => {
      t.stop();
      stream.removeTrack(t);
    });

    streamRef.current = stream;
    sourceNodesRef.current = [];

    for (const speaker of speakers) {
      const node = engine.createSourceFromStream(speaker.id, stream);
      if (node) sourceNodesRef.current.push(node);
    }

    setCapturing(true);
  }, [sourceId, engine, speakers]);

  const stopCapture = useCallback(() => {
    for (const node of sourceNodesRef.current) {
      try { node.disconnect(); } catch {}
    }
    sourceNodesRef.current = [];

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    setCapturing(false);
  }, []);

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg border-gold/10 bg-card/50">
      {capturing ? (
        <>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-400 font-medium">Capturing</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Audio routed to {speakers.length} speaker{speakers.length !== 1 ? 's' : ''}
          </span>
          <Button size="sm" variant="outline" onClick={stopCapture} className="ml-auto border-red-500/30 text-red-400 hover:bg-red-500/10">
            <Square className="w-3.5 h-3.5 mr-1.5" />
            Stop
          </Button>
        </>
      ) : (
        <>
          <span className="text-sm text-muted-foreground">
            {sourceId ? 'Ready to capture' : 'Select a source above'}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={startCapture}
            disabled={!sourceId}
            className="ml-auto border-gold/20 hover:bg-gold-muted"
          >
            <Radio className="w-3.5 h-3.5 mr-1.5" />
            Start Capture
          </Button>
        </>
      )}
    </div>
  );
}
