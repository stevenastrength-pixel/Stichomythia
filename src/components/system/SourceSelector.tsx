import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}

export function SourceSelector({ selectedId, onSelect, disabled }: Props) {
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    const result = await window.electronAPI.getDesktopSources();
    setSources(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!window.electronAPI) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Monitor className="w-8 h-8 text-gold/20 mb-2" />
        <p className="text-sm text-muted-foreground">
          System audio capture requires the desktop app
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Run Stichomythia as an Electron app to use this feature
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-heading text-gold-light tracking-wider">Audio Sources</h3>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading} className="border-gold/20 hover:bg-gold-muted">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {sources.map(source => (
          <button
            key={source.id}
            onClick={() => onSelect(source.id)}
            disabled={disabled}
            className={`flex flex-col items-center gap-2 p-2 rounded-lg border transition-all ${
              selectedId === source.id
                ? 'border-gold bg-gold-muted/30 glow-gold'
                : 'border-gold/10 bg-card/50 hover:border-gold/30 hover:bg-card'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <img
              src={source.thumbnail}
              alt={source.name}
              className="w-full aspect-video object-cover rounded"
            />
            <span className="text-[11px] text-foreground truncate w-full text-center">
              {source.name}
            </span>
          </button>
        ))}
      </div>

      {sources.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No audio sources found. Click Refresh to scan.
        </p>
      )}
    </div>
  );
}
