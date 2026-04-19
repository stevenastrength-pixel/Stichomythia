import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import type { Conversation } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface BatchStatus {
  id: string;
  processing_status: string;
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
}

interface Props {
  conversationId: string;
  batchId: string;
  segmentCount: number;
  onComplete: (conv: Conversation) => void;
  onError: (message: string) => void;
}

export function BatchProgress({ conversationId, batchId, segmentCount, onComplete, onError }: Props) {
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [processing, setProcessing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const s = await api.generation.getBatchStatus(batchId);
        setStatus(s);

        if (s.processing_status === 'ended') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setProcessing(true);
          await api.generation.processBatchResults(conversationId, batchId);
          const conv = await api.conversations.get(conversationId);
          onComplete(conv);
        }
      } catch (err) {
        onError(String(err));
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [batchId, conversationId]);

  const succeeded = status?.request_counts.succeeded ?? 0;
  const errored = status?.request_counts.errored ?? 0;
  const inProgress = status?.request_counts.processing ?? segmentCount;
  const total = status
    ? status.request_counts.processing + succeeded + errored +
      status.request_counts.canceled + status.request_counts.expired
    : segmentCount;

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="flex items-center justify-center h-full p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 space-y-5">
          <div className="text-center">
            {processing ? (
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-green-400 mb-3" />
            ) : (
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400 mb-3" />
            )}
            <h2 className="text-lg font-semibold">
              {processing ? 'Loading Results...' : 'Generating Segments'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {formatTime(elapsed)} elapsed
            </p>
          </div>

          <div className="space-y-2">
            {Array.from({ length: segmentCount }, (_, i) => {
              const segDone = i < succeeded;
              const segError = i >= succeeded && i < succeeded + errored;
              const segActive = !segDone && !segError && i < succeeded + inProgress;

              return (
                <div key={i} className="flex items-center gap-3 text-sm">
                  {segDone ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  ) : segError ? (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  ) : segActive ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={segDone ? 'text-green-400' : segError ? 'text-red-400' : segActive ? '' : 'text-muted-foreground'}>
                    Segment {i + 1}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {segDone ? 'complete' : segError ? 'failed' : segActive ? 'generating...' : 'queued'}
                  </span>
                </div>
              );
            })}
          </div>

          {total > 0 && (
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${(succeeded / total) * 100}%` }}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            50% batch discount applied
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
