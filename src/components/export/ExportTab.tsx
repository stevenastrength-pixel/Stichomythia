import { useState } from 'react';
import type { Conversation, Character } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Download, Check, X } from 'lucide-react';

interface ExportEvent {
  event: string;
  data: Record<string, unknown>;
}

interface Props {
  conversation: Conversation;
  characters: Character[];
}

export function ExportTab({ conversation, characters }: Props) {
  const [exporting, setExporting] = useState(false);
  const [log, setLog] = useState<ExportEvent[]>([]);
  const [result, setResult] = useState<{
    exportDir: string;
    totalFiles: number;
    totalDurationMs: number;
  } | null>(null);
  const renderedTurns = conversation.segments
    .flatMap(s => s.turns)
    .filter(t => t.status === 'rendered');
  const totalDurationMs = renderedTurns.reduce(
    (acc, t) => acc + (t.audioDurationMs ?? 0) + t.pauseAfterMs,
    0,
  );

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec}s`;
  };

  const handleExport = async () => {
    setExporting(true);
    setLog([]);
    setResult(null);

    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: conversation.id,
      }),
    });

    if (!res.body) { setExporting(false); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7);
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          setLog(prev => [...prev, { event: currentEvent, data }]);

          if (currentEvent === 'done') {
            setResult(data);
          }
        }
      }
    }

    setExporting(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-muted-foreground">
              <p>Total turns: {renderedTurns.length}</p>
              <p>Total duration: {formatDuration(totalDurationMs)}</p>
            </div>
            <Button onClick={handleExport} disabled={exporting || renderedTurns.length === 0}>
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export Package
                </>
              )}
            </Button>
          </div>

          {log.length > 0 && (
            <div className="bg-muted/30 rounded-md p-3 max-h-48 overflow-y-auto text-xs font-mono space-y-1">
              {log.map((entry, i) => (
                <div key={i} className="flex gap-2">
                  {entry.event === 'error' || entry.event === 'mixdown_error' || entry.event === 'copy_error' ? (
                    <X className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                  ) : entry.event === 'done' || entry.event === 'mixdown_complete' || entry.event === 'export_complete' ? (
                    <Check className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <Loader2 className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                  )}
                  <span className="text-muted-foreground">
                    {entry.event === 'export_start' && `Starting export: ${entry.data.totalTurns} turns`}
                    {entry.event === 'copy_progress' && `Copying audio: ${entry.data.copied}/${entry.data.total}`}
                    {entry.event === 'writing_manifest' && 'Writing manifest.json'}
                    {entry.event === 'mixdown_start' && 'Generating mix-down MP3 via ffmpeg...'}
                    {entry.event === 'mixdown_complete' && 'Mix-down complete'}
                    {entry.event === 'mixdown_error' && `Mix-down failed: ${entry.data.error}`}
                    {entry.event === 'export_complete' && `Export complete: ${entry.data.filesCopied} files`}
                    {entry.event === 'done' && 'Done!'}
                    {entry.event === 'error' && `Error: ${entry.data.message}`}
                    {entry.event === 'copy_error' && `Copy error: ${entry.data.error}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              Export Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total turns:</span>
              <span>{result.totalFiles}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total duration:</span>
              <span>{formatDuration(result.totalDurationMs)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Location:</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {result.exportDir}
              </code>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
