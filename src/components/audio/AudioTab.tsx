import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import type { Conversation, Character, Speaker } from '@/types';
import { Button } from '@/components/ui/button';
import { CheckCheck, Loader2, Volume2, AlertTriangle, Timer, RefreshCw } from 'lucide-react';
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
  const [approving, setApproving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const turnRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.speakers.get().then(config => setSpeakers(config.speakers));
  }, []);

  const speakerDeviceMap = useMemo(() => {
    if (!conversation.speakerMap || speakers.length === 0) return undefined;
    const map = new Map<string, string>();
    for (const [charId, speakerId] of Object.entries(conversation.speakerMap)) {
      const speaker = speakers.find(s => s.id === speakerId);
      if (speaker) map.set(charId, speaker.deviceId);
    }
    return map.size > 0 ? map : undefined;
  }, [conversation.speakerMap, speakers]);

  const charMap = new Map(characters.map(c => [c.id, c]));
  const allTurns = conversation.segments.flatMap(s => s.turns);
  const draftCount = allTurns.filter(t => t.status === 'draft').length;
  const approvedCount = allTurns.filter(t => t.status === 'approved' || t.status === 'edited').length;
  const renderedCount = allTurns.filter(t => t.status === 'rendered').length;
  const totalDurationMs = allTurns.reduce(
    (acc, t) => acc + (t.audioDurationMs ?? 0) + (t.status === 'rendered' ? t.pauseAfterMs : 0),
    0,
  );

  const stuckRendering = conversation.status === 'rendering' && !rendering;

  const refreshConversation = useCallback(async () => {
    const updated = await api.conversations.get(conversation.id);
    onConversationUpdate(updated);
    return updated;
  }, [conversation.id, onConversationUpdate]);

  useEffect(() => {
    if (conversation.status !== 'rendering' || rendering) return;

    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        await new Promise(r => setTimeout(r, 3000));
        if (cancelled) break;
        const updated = await api.conversations.get(conversation.id);
        onConversationUpdate(updated);
        if (updated.status !== 'rendering') break;
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [conversation.status, conversation.id, rendering, onConversationUpdate]);

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec}s`;
  };

  const handleApproveAll = async () => {
    setApproving(true);
    try {
      await api.generation.approveAll(conversation.id);
      await refreshConversation();
    } catch (err) {
      console.error('Failed to approve all:', err);
    }
    setApproving(false);
  };

  const handleRenderAll = (rerender = false) => doRender(rerender);

  const doRender = async (rerenderAll = false) => {
    setRendering(true);
    setRenderProgress({ done: 0, total: rerenderAll ? allTurns.length : approvedCount });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch('/api/tts/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, rerenderAll }),
        signal: abort.signal,
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
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Render error:', err);
      }
    }

    abortRef.current = null;
    await refreshConversation();
    setRendering(false);
  };

  const handleRecalculatePauses = async () => {
    setRecalculating(true);
    try {
      await api.generation.recalculatePauses(conversation.id);
      await refreshConversation();
    } catch (err) {
      console.error('Failed to recalculate pauses:', err);
    }
    setRecalculating(false);
  };

  const handleResumeRender = async () => {
    await refreshConversation();
    if (approvedCount > 0) {
      handleRenderAll();
    }
  };

  const handleRerender = async (turnId: string) => {
    await api.tts.rerenderTurn(conversation.id, turnId);
    await refreshConversation();
  };

  const handleTurnChange = (turnIndex: number) => {
    setActiveTurnIndex(turnIndex);
    const el = turnRefs.current.get(turnIndex);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 p-4 border-b space-y-3">
        {stuckRendering && (
          <div className="flex items-center gap-3 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-sm">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
            <span className="text-yellow-200">
              Rendering may have been interrupted. {renderedCount}/{allTurns.length} turns rendered so far.
            </span>
            <Button size="sm" variant="outline" onClick={handleResumeRender} className="ml-auto shrink-0">
              Resume Rendering
            </Button>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {draftCount > 0 && (
            <Button variant="outline" onClick={handleApproveAll} disabled={approving || rendering}>
              {approving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCheck className="w-4 h-4 mr-2" />
                  Approve All ({draftCount})
                </>
              )}
            </Button>
          )}

          <Button onClick={() => handleRenderAll(false)} disabled={rendering || approvedCount === 0}>
            {rendering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Rendering {renderProgress.done}/{renderProgress.total}
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 mr-2" />
                Render All Approved ({approvedCount})
              </>
            )}
          </Button>

          {renderedCount > 0 && (
            <Button variant="outline" onClick={() => handleRenderAll(true)} disabled={rendering}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-render All ({renderedCount})
            </Button>
          )}

          <Button variant="outline" onClick={handleRecalculatePauses} disabled={recalculating || rendering || allTurns.length === 0}>
            {recalculating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Recalculating...
              </>
            ) : (
              <>
                <Timer className="w-4 h-4 mr-2" />
                Recalculate Pauses
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
        speakerDeviceMap={speakerDeviceMap}
        onTurnChange={handleTurnChange}
      />
    </div>
  );
}
