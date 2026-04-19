import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Monitor, AppWindow, Globe, Music, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}

function getAppIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('spotify') || lower.includes('music') || lower.includes('itunes')) return Music;
  if (lower.includes('chrome') || lower.includes('firefox') || lower.includes('edge') || lower.includes('brave') || lower.includes('opera')) return Globe;
  if (lower.includes('entire system') || lower.includes('screen')) return Monitor;
  if (lower.includes('discord') || lower.includes('teams') || lower.includes('zoom') || lower.includes('slack')) return Radio;
  return AppWindow;
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

  const screens = sources.filter(s => s.type === 'screen');
  const windows = sources.filter(s => s.type === 'window');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-heading text-gold-light tracking-wider">Audio Sources</h3>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading} className="border-gold/20 hover:bg-gold-muted">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="space-y-1">
        {screens.map(source => {
          const Icon = getAppIcon(source.name);
          const selected = selectedId === source.id;
          return (
            <button
              key={source.id}
              onClick={() => onSelect(source.id)}
              disabled={disabled}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                selected
                  ? 'border-gold bg-gold-muted/30 glow-gold'
                  : 'border-gold/10 bg-card/50 hover:border-gold/30 hover:bg-card'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${selected ? 'text-gold' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${selected ? 'text-gold-light' : 'text-foreground'}`}>
                  {source.name}
                </span>
                <p className="text-[10px] text-muted-foreground">Captures all audio from your system</p>
              </div>
            </button>
          );
        })}
      </div>

      {windows.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-gold/10" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Applications</span>
            <div className="h-px flex-1 bg-gold/10" />
          </div>

          <div className="space-y-1">
            {windows.map(source => {
              const Icon = getAppIcon(source.name);
              const selected = selectedId === source.id;
              return (
                <button
                  key={source.id}
                  onClick={() => onSelect(source.id)}
                  disabled={disabled}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left ${
                    selected
                      ? 'border-gold bg-gold-muted/30 glow-gold'
                      : 'border-transparent hover:border-gold/10 hover:bg-card/80'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-gold' : 'text-muted-foreground'}`} />
                  <span className={`text-sm truncate ${selected ? 'text-gold-light' : 'text-foreground'}`}>
                    {source.name}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {sources.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No audio sources found. Click Refresh to scan.
        </p>
      )}
    </div>
  );
}
