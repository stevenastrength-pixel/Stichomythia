import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Conversation, Character } from '@/types';
import { Button } from '@/components/ui/button';
import { Loader2, Volume2 } from 'lucide-react';
import { AudioTurnRow } from './AudioTurnRow';
import { ConversationPlayer } from './ConversationPlayer';

interface Props {
  conversation: Conversation;
  characters: Character[];
  onConversationUpdate: (conv: Conversation) => void;
}

export function AudioTab({ conversation, characters, onConversationUpdate }: Props) {
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState({ done: 0, total: 0 });
  const [activeTurnIndex, setActiveTurnIndex] = useState(-1);
  const turnRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const charMap = new Map(characters.map(c => [c.id, c]));
  const allTurns = conversation.segments.flatMap(s => s.turns);
  const approvedCount = allTurns.filter(t => t.status === 'approved' || t.status === 'edited').length;
  const renderedCount = allTurns.filter(t => t.status === 'rendered').length;
  const totalDurationMs = allTurns.reduce(
    (acc, t) => acc + (t.audioDurationMs ?? 0) + (t.status === 'rendered' ? t.pauseAfterMs : 0),
    0,
  );

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec}s`;
  };

  const handleRenderAll = async () => {
    setRendering(true);
    setRenderProgress({ done: 0, total: approvedCount });

    const res = await fetch('/api/tts/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id }),
    });

    if (!res.body) { setRendering(false); return; }

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
          switch (currentEvent) {
            case 'render_start':
              setRenderProgress({ done: 0, total: data.totalTurns });
              break;
            case 'turn_rendered':
              setRenderProgress(prev => ({ ...prev, done: data.progress }));
              break;
            case 'render_complete':
            case 'error':
              break;
          }
        }
      }
    }

    const updated = await api.conversations.get(conversation.id);
    onConversationUpdate(updated);
    setRendering(false);
  };

  const handleRerender = async (turnId: string) => {
    await api.tts.rerenderTurn(conversation.id, turnId);
    const updated = await api.conversations.get(conversation.id);
    onConversationUpdate(updated);
  };

  const handleTurnChange = (turnIndex: number) => {
    setActiveTurnIndex(turnIndex);
    const el = turnRefs.current.get(turnIndex);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 p-4 border-b space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleRenderAll} disabled={rendering || approvedCount === 0}>
            {rendering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Rendering {renderProgress.done}/{renderProgress.total}
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 mr-2" />
                Render All Approved
              </>
            )}
          </Button>

          <div className="text-sm text-muted-foreground space-x-4">
            <span>{renderedCount}/{allTurns.length} rendered</span>
            <span>{formatDuration(totalDurationMs)}</span>
          </div>
        </div>

        {rendering && renderProgress.total > 0 && (
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${(renderProgress.done / renderProgress.total) * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {allTurns.map((turn, i) => (
          <div
            key={turn.id}
            ref={(el) => { if (el) turnRefs.current.set(i, el); }}
          >
            <AudioTurnRow
              turn={turn}
              character={charMap.get(turn.characterId)}
              isActive={i === activeTurnIndex}
              onRerender={() => handleRerender(turn.id)}
            />
          </div>
        ))}
      </div>

      <ConversationPlayer
        turns={allTurns}
        characters={charMap}
        onTurnChange={handleTurnChange}
      />
    </div>
  );
}
