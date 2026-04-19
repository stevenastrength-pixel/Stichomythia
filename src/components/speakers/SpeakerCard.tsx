import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Volume2, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react';
import type { Speaker } from '@/types';

interface Props {
  speaker: Speaker;
  index: number;
  connected: boolean;
  onTest: () => Promise<void>;
  onUpdateLabel: (label: string) => void;
  onRemove: () => void;
}

export function SpeakerCard({ speaker, index, connected, onTest, onUpdateLabel, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(speaker.label);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try { await onTest(); } finally { setTesting(false); }
  };

  const handleSave = () => {
    onUpdateLabel(label);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${connected ? 'bg-green-500' : 'bg-red-500'}`} />

      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave}>
              <Check className="w-3 h-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium">{speaker.label}</p>
            <p className="text-xs text-muted-foreground">{speaker.deviceLabel}</p>
          </div>
        )}
      </div>

      <span className="text-xs text-muted-foreground shrink-0">
        {connected ? 'Connected' : 'Disconnected'}
      </span>

      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleTest} disabled={testing || !connected}>
        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)}>
        <Pencil className="w-4 h-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onRemove}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
